#!/usr/bin/env node
/**
 * WD Kibana Daily HTML Report Generator
 * Queries Kibana WD HTTPS API, generates short URLs, builds 13-section HTML report.
 */
import { mkdirSync, writeFileSync, readFileSync, unlinkSync, readdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const KIBANA_BASE = "https://kibana-wd.webgility.com";
const DATA_VIEW_ID = "61237d60-0ed9-11eb-816a-cde07dc15a1f";
const AUTH = process.env.KIBANA_WD_AUTH;

if (!AUTH) {
  console.error("HALT: KIBANA_WD_AUTH not configured");
  process.exit(1);
}

const AUTH_HDR = {
  Authorization: "Basic " + Buffer.from(AUTH).toString("base64"),
  "kbn-xsrf": "true",
  "Content-Type": "application/json",
};

function defaultWindows() {
  const now = new Date();
  const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 30, 0));
  if (now < todayEnd) todayEnd.setUTCDate(todayEnd.getUTCDate() - 1);
  const yesterdayEnd = new Date(todayEnd);
  const start = new Date(todayEnd);
  start.setUTCDate(start.getUTCDate() - 1);
  const prevStart = new Date(start);
  prevStart.setUTCDate(prevStart.getUTCDate() - 1);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const idxFmt = (d) => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `webgilitydesktop-${y}.${m}.${day}`;
  };
  const reportDate = fmt(todayEnd);
  const yesterday = fmt(start);
  const dayBefore = fmt(prevStart);
  return {
    startUtc: start.toISOString(),
    endUtc: todayEnd.toISOString(),
    prevStartUtc: prevStart.toISOString(),
    prevEndUtc: start.toISOString(),
    indices: `${idxFmt(start)},${idxFmt(todayEnd)}`,
    prevIndices: `${idxFmt(prevStart)},${idxFmt(start)}`,
    reportDate,
    yesterday,
    dayBefore,
    periodIst: `${yesterday} 09:00 IST → ${reportDate} 09:00 IST`,
    compareIst: `${dayBefore} 09:00 IST → ${yesterday} 09:00 IST`,
  };
}

const WIN = defaultWindows();

async function esSearch(indices, body) {
  const path = encodeURIComponent(`${indices}/_search`);
  const url = `${KIBANA_BASE}/api/console/proxy?path=${path}&method=POST`;
  const resp = await fetch(url, {
    method: "POST",
    headers: AUTH_HDR,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`ES query failed HTTP ${resp.status}: ${t.slice(0, 300)}`);
  }
  return resp.json();
}

function timeRangeQuery(gte, lt) {
  return { range: { timestamp: { gte, lt } } };
}

function mainAggQuery(gte, lt) {
  return {
    query: { bool: { must: [timeRangeQuery(gte, lt)] } },
    size: 0,
    track_total_hits: true,
    aggs: {
      by_level: { terms: { field: "level.keyword", size: 10 } },
      by_hour: {
        date_histogram: { field: "timestamp", fixed_interval: "1h", min_doc_count: 0 },
      },
      errors_only: {
        filter: { term: { "level.keyword": "Error" } },
        aggs: {
          by_module: { terms: { field: "module.keyword", size: 15, missing: "Unknown" } },
          by_store: { terms: { field: "store.keyword", size: 15, missing: "Unknown" } },
          by_tag: { terms: { field: "tag.keyword", size: 15, missing: "(none)" } },
          by_process: { terms: { field: "process.keyword", size: 10, missing: "(none)" } },
          top_messages: { terms: { field: "message.keyword", size: 15 } },
          top_subscribers: { terms: { field: "subscriberID", size: 10 } },
          by_hour: {
            date_histogram: { field: "timestamp", fixed_interval: "1h", min_doc_count: 0 },
          },
        },
      },
      fatals: {
        filter: { term: { "level.keyword": "Fatal" } },
        aggs: {
          by_message: { terms: { field: "message.keyword", size: 15 } },
          by_store: { terms: { field: "store.keyword", size: 10, missing: "Unknown" } },
        },
      },
    },
  };
}

function shopifyPayoutQuery(gte, lt) {
  return {
    query: {
      bool: {
        must: [
          timeRangeQuery(gte, lt),
          { term: { "store.keyword": "Shopify" } },
          { term: { "module.keyword": "PayoutPosting" } },
          { exists: { field: "processedRecords" } },
          { range: { averagePerSecond: { gt: 0 } } },
        ],
      },
    },
    size: 0,
    aggs: {
      total_processed: { sum: { field: "processedRecords" } },
      batch_count: { value_count: { field: "processedRecords" } },
      by_subscriber: {
        terms: { field: "subscriberID", size: 5, order: { processed_sum: "desc" } },
        aggs: {
          processed_sum: { sum: { field: "processedRecords" } },
          batch_count: { value_count: { field: "processedRecords" } },
        },
      },
      payout_time_stats: {
        scripted_metric: {
          init_script: "state.total_time = 0; state.per_record_times = []",
          map_script:
            "double rate = doc['averagePerSecond'].value; long records = doc['processedRecords'].value; if (rate > 0 && records > 0) { double batch_time = records / rate; state.total_time += batch_time; state.per_record_times.add(1.0 / rate); }",
          combine_script:
            "return ['total_time': state.total_time, 'per_record_times': state.per_record_times]",
          reduce_script:
            "double total = 0; double min_t = Double.MAX_VALUE; double max_t = 0; double sum_t = 0; int count = 0; for (s in states) { total += s.total_time; for (t in s.per_record_times) { if (t < min_t) min_t = t; if (t > max_t) max_t = t; sum_t += t; count++; } } return ['total_seconds': total, 'min_per_payout_seconds': min_t == Double.MAX_VALUE ? 0 : min_t, 'max_per_payout_seconds': max_t, 'avg_per_payout_seconds': count > 0 ? sum_t / count : 0, 'batch_count': count]",
        },
      },
    },
  };
}

function shopifyPayoutFallback(gte, lt) {
  const q = shopifyPayoutQuery(gte, lt);
  q.query.bool.must = q.query.bool.must.filter(
    (m) => !(m.range && m.range.averagePerSecond)
  );
  return q;
}

function amazonSettlementQuery(gte, lt) {
  return {
    query: {
      bool: {
        must: [timeRangeQuery(gte, lt), { term: { "module.keyword": "AmazonSettlementReport" } }],
      },
    },
    size: 0,
    track_total_hits: true,
    aggs: {
      by_level: { terms: { field: "level.keyword", size: 10 } },
      total_processed: { sum: { field: "processedRecords" } },
      top_errors: {
        filter: { term: { "level.keyword": "Error" } },
        aggs: { by_message: { terms: { field: "message.keyword", size: 10 } } },
      },
      top_subscribers: {
        terms: { field: "subscriberID", size: 5, order: { _count: "desc" } },
        aggs: {
          by_level: { terms: { field: "level.keyword", size: 5 } },
          processed_sum: { sum: { field: "processedRecords" } },
        },
      },
      unique_subscribers: { cardinality: { field: "subscriberID" } },
    },
  };
}

function perfQuery(gte, lt, module, methodType) {
  return {
    query: {
      bool: {
        must: [
          timeRangeQuery(gte, lt),
          { term: { "module.keyword": module } },
          { term: { "methodType.keyword": methodType } },
        ],
      },
    },
    size: 200,
    sort: [{ timestamp: "desc" }],
    _source: [
      "timestamp",
      "subscriberID",
      "profileId",
      "email",
      "detail",
      "message",
      "processedRecords",
      "baseUrl",
      "process",
      "methodType",
      "tag",
    ],
  };
}

function perfFallback(gte, lt, module) {
  return {
    query: {
      bool: {
        must: [
          timeRangeQuery(gte, lt),
          { term: { "module.keyword": module } },
          { term: { "tag.keyword": "Performance" } },
        ],
      },
    },
    size: 200,
    sort: [{ timestamp: "desc" }],
    _source: [
      "timestamp",
      "subscriberID",
      "profileId",
      "email",
      "detail",
      "message",
      "processedRecords",
      "baseUrl",
      "process",
      "methodType",
      "tag",
    ],
  };
}

function levelMap(aggs) {
  const m = {};
  for (const b of aggs?.by_level?.buckets ?? []) m[b.key] = b.doc_count;
  return m;
}

function vsBadge(curr, prev) {
  if (prev === undefined || prev === null) return { cls: "new", text: "NEW" };
  if (prev === 0 && curr === 0) return { cls: "flat", text: "≈" };
  if (prev === 0) return { cls: "new", text: "NEW" };
  const pct = ((curr - prev) / prev) * 100;
  if (Math.abs(pct) <= 10) return { cls: "flat", text: "≈" };
  const arrow = pct > 0 ? "↑" : "↓";
  const cls = pct > 0 ? "up" : "down";
  return { cls, text: `${arrow}${Math.abs(pct).toFixed(1)}%` };
}

function fmtNum(n) {
  return (n ?? 0).toLocaleString("en-US");
}

function fmtDurMs(ms) {
  if (!ms || ms < 1000) return `${Math.round(ms ?? 0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) {
    const m = Math.floor(ms / 60000);
    const s = Math.round((ms % 60000) / 1000);
    return `${m}m ${s}s`;
  }
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
}

function fmtDurSec(s) {
  if (!s || s < 60) return `${(s ?? 0).toFixed(1)}s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return `${m}m ${sec}s`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

function pctBarColor(pct) {
  if (pct > 50) return "red";
  if (pct > 20) return "orange";
  if (pct > 10) return "amber";
  if (pct > 5) return "blue";
  return "gray";
}

function barColorClass(pctOfMax) {
  if (pctOfMax > 60) return "c4";
  if (pctOfMax > 25) return "c3";
  if (pctOfMax > 10) return "c2";
  return "c1";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function kqlEscape(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildDiscoverPath(kql, fromUtc, toUtc) {
  const q = kql.replace(/'/g, "\\'");
  return `/app/kibana#/discover?_g=(refreshInterval:(pause:!t,value:0),time:(from:'${fromUtc}',to:'${toUtc}'))&_a=(columns:!(timestamp,level,message,store,module,subscriberID),index:'${DATA_VIEW_ID}',interval:auto,query:(language:kuery,query:'${q}'),sort:!(!(timestamp,desc)))`;
}

const urlCache = new Map();

async function shortenUrl(kql, fromUtc, toUtc) {
  const key = `${kql}|${fromUtc}|${toUtc}`;
  if (urlCache.has(key)) return urlCache.get(key);
  const path = buildDiscoverPath(kql, fromUtc, toUtc);
  try {
    const resp = await fetch(`${KIBANA_BASE}/api/shorten_url`, {
      method: "POST",
      headers: AUTH_HDR,
      body: JSON.stringify({ url: path }),
      signal: AbortSignal.timeout(15_000),
    });
    if (resp.ok) {
      const data = await resp.json();
      const link = `${KIBANA_BASE}/goto/${data.urlId}`;
      urlCache.set(key, link);
      return link;
    }
  } catch {}
  const fallback = KIBANA_BASE;
  urlCache.set(key, fallback);
  return fallback;
}

async function batchShorten(items, fromUtc, toUtc, concurrency = 8) {
  const results = new Map();
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async ({ id, kql }) => {
        results.set(id, await shortenUrl(kql, fromUtc, toUtc));
      })
    );
  }
  return results;
}

function parsePerfDoc(src) {
  const detail = src.detail || "";
  const msg = src.message || "";
  let totalTime = 0;
  const m1 = detail.match(/Total Time:\s*(\d+)\s*ms/);
  const m2 = msg.match(/Total Time:\s*(\d+),\s*ms/);
  if (m1) totalTime = parseInt(m1[1], 10);
  else if (m2) totalTime = parseInt(m2[1], 10);

  const steps = [];
  const lines = detail.split(/\r?\n/);
  const stepRe = /^Step\s+(\d+):\s+(.+?):\s+(\d+)\s+ms(?:\s+\|\s+Records:\s+(\d+))?/;
  for (const line of lines) {
    const sm = line.match(stepRe);
    if (sm) {
      steps.push({
        num: parseInt(sm[1], 10),
        name: sm[2],
        ms: parseInt(sm[3], 10),
        records: sm[4] ? parseInt(sm[4], 10) : 0,
      });
    }
  }
  let maxStep = "";
  let maxStepMs = 0;
  for (const s of steps) {
    if (s.ms > maxStepMs) {
      maxStepMs = s.ms;
      maxStep = s.name;
    }
  }
  return {
    subscriberID: src.subscriberID,
    profileId: src.profileId,
    email: src.email || "",
    processedRecords: src.processedRecords || 0,
    baseUrl: src.baseUrl,
    process: src.process || "",
    timestamp: src.timestamp,
    totalTime,
    maxStep,
    maxStepMs,
    steps,
  };
}

function aggregatePerf(docs) {
  const parsed = docs.map((h) => parsePerfDoc(h._source)).filter((p) => p.totalTime > 0);
  const stepStats = new Map();
  const bySub = new Map();

  for (const p of parsed) {
    const sid = p.subscriberID;
    if (!bySub.has(sid)) {
      bySub.set(sid, {
        subscriberID: sid,
        email: p.email,
        totalTime: 0,
        runCount: 0,
        processedRecords: 0,
        maxStep: "",
        maxStepMs: 0,
        allSteps: [],
      });
    }
    const sub = bySub.get(sid);
    sub.totalTime += p.totalTime;
    sub.runCount++;
    sub.processedRecords += p.processedRecords;
    if (p.maxStepMs > sub.maxStepMs) {
      sub.maxStepMs = p.maxStepMs;
      sub.maxStep = p.maxStep;
    }
    for (const s of p.steps) {
      sub.allSteps.push(s);
      const key = s.name;
      if (!stepStats.has(key)) stepStats.set(key, { num: s.num, name: key, count: 0, totalMs: 0, maxMs: 0, minMs: Infinity });
      const st = stepStats.get(key);
      st.count++;
      st.totalMs += s.ms;
      st.maxMs = Math.max(st.maxMs, s.ms);
      st.minMs = Math.min(st.minMs, s.ms);
      if (s.num < st.num) st.num = s.num;
    }
  }

  const top5 = [...bySub.values()].sort((a, b) => b.totalTime - a.totalTime).slice(0, 5);
  const maxSubTime = top5[0]?.totalTime || 1;

  const stepsOrdered = [...stepStats.values()].sort((a, b) => a.num - b.num);
  const maxAvg = Math.max(...stepsOrdered.map((s) => s.totalMs / s.count), 1);

  return { parsed, top5, maxSubTime, stepsOrdered, maxAvg, runCount: parsed.length };
}

function hourToIstLabel(utcHour, startDate) {
  const d = new Date(startDate);
  d.setUTCHours(utcHour, 0, 0, 0);
  const istH = (d.getUTCHours() + 5 + (d.getUTCMinutes() + 30 >= 30 ? 0 : 0)) % 24;
  const istHour = (utcHour + 3 + Math.floor((utcHour * 60 + 30) / 60)) % 24;
  return String(istHour).padStart(2, "0");
}

function utcToIstHourLabel(utcDate) {
  const istMs = utcDate.getTime() + 5.5 * 3600000;
  const ist = new Date(istMs);
  return String(ist.getUTCHours()).padStart(2, "0");
}

function buildHourlyBars(errorHourBuckets, startUtc, endUtc) {
  const bars = [];
  for (const b of errorHourBuckets ?? []) {
    const d = new Date(b.key_as_string || b.key);
    bars.push({
      key: b.key,
      count: b.doc_count,
      label: utcToIstHourLabel(d),
      sortKey: d.getTime(),
    });
  }
  bars.sort((a, b) => a.sortKey - b.sortKey);
  if (bars.length === 0) {
    let cursor = new Date(startUtc);
    const end = new Date(endUtc);
    while (cursor < end) {
      bars.push({ key: cursor.getTime(), count: 0, label: utcToIstHourLabel(cursor), sortKey: cursor.getTime() });
      cursor = new Date(cursor.getTime() + 3600000);
    }
  }
  const max = Math.max(...bars.map((b) => b.count), 1);
  let peak = { count: 0, label: "00" };
  for (const b of bars) {
    if (b.count > peak.count) peak = b;
  }
  return { bars, max, peak };
}

async function main() {
  console.log("Verifying Kibana connectivity...");
  const statusResp = await fetch(`${KIBANA_BASE}/api/status`, {
    headers: AUTH_HDR,
    signal: AbortSignal.timeout(30_000),
  });
  if (!statusResp.ok) {
    console.error(`HALT: Kibana unreachable HTTP ${statusResp.status}`);
    process.exit(1);
  }
  console.log(`Report window: ${WIN.periodIst}`);
  console.log(`Indices: ${WIN.indices}`);

  const [todayMain, prevMain, shopifyToday, shopifyPrev, amazonToday, amazonPrev] = await Promise.all([
    esSearch(WIN.indices, mainAggQuery(WIN.startUtc, WIN.endUtc)),
    esSearch(WIN.prevIndices, mainAggQuery(WIN.prevStartUtc, WIN.prevEndUtc)),
    esSearch(WIN.indices, shopifyPayoutQuery(WIN.startUtc, WIN.endUtc)).catch((e) => ({ error: e.message })),
    esSearch(WIN.prevIndices, shopifyPayoutQuery(WIN.prevStartUtc, WIN.prevEndUtc)).catch(() => null),
    esSearch(WIN.indices, amazonSettlementQuery(WIN.startUtc, WIN.endUtc)),
    esSearch(WIN.prevIndices, amazonSettlementQuery(WIN.prevStartUtc, WIN.prevEndUtc)),
  ]);

  let shopify = shopifyToday;
  if (shopify.error || (shopify.hits?.total?.value ?? 0) === 0) {
    shopify = await esSearch(WIN.indices, shopifyPayoutFallback(WIN.startUtc, WIN.endUtc));
  }
  let shopifyP = shopifyPrev;
  if (!shopifyP || (shopifyP.hits?.total?.value ?? 0) === 0) {
    shopifyP = await esSearch(WIN.prevIndices, shopifyPayoutFallback(WIN.prevStartUtc, WIN.prevEndUtc));
  }

  let payoutPerf = await esSearch(
    WIN.indices,
    perfQuery(WIN.startUtc, WIN.endUtc, "PayoutPosting", "Payout_PerformanceSummary")
  );
  if ((payoutPerf.hits?.hits?.length ?? 0) === 0) {
    payoutPerf = await esSearch(WIN.indices, perfFallback(WIN.startUtc, WIN.endUtc, "PayoutPosting"));
  }
  let amazonPerf = await esSearch(
    WIN.indices,
    perfQuery(WIN.startUtc, WIN.endUtc, "AmazonSettlementReport", "Settlement_PerformanceSummary")
  );
  if ((amazonPerf.hits?.hits?.length ?? 0) === 0) {
    amazonPerf = await esSearch(
      WIN.indices,
      perfFallback(WIN.startUtc, WIN.endUtc, "AmazonSettlementReport")
    );
  }

  let payoutPerfPrev = await esSearch(
    WIN.prevIndices,
    perfQuery(WIN.prevStartUtc, WIN.prevEndUtc, "PayoutPosting", "Payout_PerformanceSummary")
  );
  if ((payoutPerfPrev.hits?.hits?.length ?? 0) === 0) {
    payoutPerfPrev = await esSearch(
      WIN.prevIndices,
      perfFallback(WIN.prevStartUtc, WIN.prevEndUtc, "PayoutPosting")
    );
  }
  let amazonPerfPrev = await esSearch(
    WIN.prevIndices,
    perfQuery(WIN.prevStartUtc, WIN.prevEndUtc, "AmazonSettlementReport", "Settlement_PerformanceSummary")
  );
  if ((amazonPerfPrev.hits?.hits?.length ?? 0) === 0) {
    amazonPerfPrev = await esSearch(
      WIN.prevIndices,
      perfFallback(WIN.prevStartUtc, WIN.prevEndUtc, "AmazonSettlementReport")
    );
  }

  const totalToday = todayMain.hits?.total?.value ?? 0;
  const totalPrev = prevMain.hits?.total?.value ?? 0;
  if (totalToday === 0 && totalPrev === 0) {
    console.warn("Warning: zero events in both windows — proceeding with placeholders");
  }

  const levelsToday = levelMap(todayMain.aggregations);
  const levelsPrev = levelMap(prevMain.aggregations);
  const errorsToday = levelsToday.Error ?? 0;
  const errorsPrev = levelsPrev.Error ?? 0;
  const fatalsToday = levelsToday.Fatal ?? 0;
  const fatalsPrev = levelsPrev.Fatal ?? 0;
  const warningsToday = levelsToday.Warning ?? 0;
  const warningsPrev = levelsPrev.Warning ?? 0;
  const infoToday = levelsToday.Info ?? 0;
  const infoPrev = levelsPrev.Info ?? 0;
  const errorRateToday = totalToday ? ((errorsToday / totalToday) * 100).toFixed(2) : "0.00";
  const errorRatePrev = totalPrev ? ((errorsPrev / totalPrev) * 100).toFixed(2) : "0.00";

  const errAggs = todayMain.aggregations?.errors_only ?? {};
  const errAggsPrev = prevMain.aggregations?.errors_only ?? {};
  const fatalAggs = todayMain.aggregations?.fatals ?? {};

  const hourly = buildHourlyBars(
    errAggs.by_hour?.buckets,
    WIN.startUtc,
    WIN.endUtc
  );

  const payoutAgg = shopify.aggregations ?? {};
  const payoutAggPrev = shopifyP?.aggregations ?? {};
  const amazonAgg = amazonToday.aggregations ?? {};
  const amazonAggPrev = amazonPrev.aggregations ?? {};

  const perfPayout = aggregatePerf(payoutPerf.hits?.hits ?? []);
  const perfAmazon = aggregatePerf(amazonPerf.hits?.hits ?? []);
  const perfPayoutPrev = aggregatePerf(payoutPerfPrev.hits?.hits ?? []);
  const perfAmazonPrev = aggregatePerf(amazonPerfPrev.hits?.hits ?? []);

  const prevSubTimePayout = new Map(
    perfPayoutPrev.top5.map((s) => [s.subscriberID, s.totalTime])
  );
  const prevSubTimeAmazon = new Map(
    perfAmazonPrev.top5.map((s) => [s.subscriberID, s.totalTime])
  );

  const shortenItems = [];
  const add = (id, kql) => shortenItems.push({ id, kql });

  add("total", "");
  add("errors", 'level.keyword:"Error"');
  add("fatals", 'level.keyword:"Fatal"');
  add("warnings", 'level.keyword:"Warning"');
  add("info", 'level.keyword:"Info"');

  for (const b of errAggs.by_module?.buckets ?? []) {
    const mod = b.key === "Unknown" ? "" : `module.keyword:"${kqlEscape(b.key)}"`;
    add(`mod_${b.key}`, mod ? `level.keyword:"Error" AND ${mod}` : 'level.keyword:"Error"');
  }
  for (const b of errAggs.by_store?.buckets ?? []) {
    add(`store_${b.key}`, `level.keyword:"Error" AND store.keyword:"${kqlEscape(b.key)}"`);
  }
  for (const b of errAggs.by_tag?.buckets ?? []) {
    if (b.key !== "(none)")
      add(`tag_${b.key}`, `level.keyword:"Error" AND tag.keyword:"${kqlEscape(b.key)}"`);
  }
  for (const b of errAggs.by_process?.buckets ?? []) {
    if (b.key !== "(none)")
      add(`proc_${b.key}`, `level.keyword:"Error" AND process.keyword:"${kqlEscape(b.key)}"`);
  }
  for (const b of errAggs.top_messages?.buckets ?? []) {
    add(`msg_${b.key.slice(0, 40)}`, `level.keyword:"Error" AND message.keyword:"${kqlEscape(b.key)}"`);
  }
  for (const b of errAggs.top_subscribers?.buckets ?? []) {
    add(`sub_${b.key}`, `level.keyword:"Error" AND subscriberID:${b.key}`);
  }
  for (const b of fatalAggs.by_message?.buckets ?? []) {
    add(`fatal_msg_${b.key.slice(0, 30)}`, `level.keyword:"Fatal" AND message.keyword:"${kqlEscape(b.key)}"`);
  }
  for (const b of fatalAggs.by_store?.buckets ?? []) {
    add(`fatal_store_${b.key}`, `level.keyword:"Fatal" AND store.keyword:"${kqlEscape(b.key)}"`);
  }

  add("shopify_all", 'store.keyword:"Shopify" AND module.keyword:"PayoutPosting"');
  for (const b of payoutAgg.by_subscriber?.buckets ?? []) {
    add(
      `payout_sub_${b.key}`,
      `level.keyword:"Info" AND module.keyword:"PayoutPosting" AND subscriberID:${b.key}`
    );
  }

  add("amazon_all", 'module.keyword:"AmazonSettlementReport"');
  add("amazon_errors", 'level.keyword:"Error" AND module.keyword:"AmazonSettlementReport"');
  for (const b of amazonAgg.top_errors?.by_message?.buckets ?? []) {
    add(
      `amz_err_${b.key.slice(0, 30)}`,
      `level.keyword:"Error" AND module.keyword:"AmazonSettlementReport" AND message.keyword:"${kqlEscape(b.key)}"`
    );
  }
  for (const b of amazonAgg.top_subscribers?.buckets ?? []) {
    add(
      `amz_sub_${b.key}`,
      `module.keyword:"AmazonSettlementReport" AND subscriberID:${b.key}`
    );
  }

  for (const s of perfPayout.top5) {
    add(
      `perf_p_${s.subscriberID}`,
      `tag.keyword:"Performance" AND module.keyword:"PayoutPosting" AND subscriberID:${s.subscriberID}`
    );
  }
  for (const s of perfAmazon.top5) {
    add(
      `perf_a_${s.subscriberID}`,
      `tag.keyword:"Performance" AND module.keyword:"AmazonSettlementReport" AND subscriberID:${s.subscriberID}`
    );
  }

  console.log(`Generating ${shortenItems.length} Kibana short URLs...`);
  const links = await batchShorten(shortenItems, WIN.startUtc, WIN.endUtc);
  console.log(`Short URLs ready: ${links.size}`);
  const L = (id) => links.get(id) || KIBANA_BASE;
  const link = (kql) => L(kql) || KIBANA_BASE;

  const templatePath = join(REPO_ROOT, "reports/wd-kibana-logs/2026-05-20-wd-kibana-daily-report.html");
  let css = "";
  try {
    const tpl = readFileSync(templatePath, "utf8");
    const m = tpl.match(/<style>([\s\S]*?)<\/style>/);
    css = m ? m[1] : "";
  } catch {
    css = "body{font-family:sans-serif}";
  }

  const prevMap = (buckets) => {
    const m = new Map();
    for (const b of buckets ?? []) m.set(b.key, b.doc_count);
    return m;
  };
  const modPrev = prevMap(errAggsPrev.by_module?.buckets);
  const storePrev = prevMap(errAggsPrev.by_store?.buckets);
  const tagPrev = prevMap(errAggsPrev.by_tag?.buckets);
  const procPrev = prevMap(errAggsPrev.by_process?.buckets);
  const msgPrev = prevMap(errAggsPrev.top_messages?.buckets);
  const subPrev = prevMap(errAggsPrev.top_subscribers?.buckets);
  const fatalMsgPrev = prevMap(prevMain.aggregations?.fatals?.by_message?.buckets);
  const fatalStorePrev = prevMap(prevMain.aggregations?.fatals?.by_store?.buckets);

  const pctOfErrors = (n) => (errorsToday ? ((n / errorsToday) * 100).toFixed(1) : "0.0");

  const pctBar = (pct, color) =>
    `<div class="pct-bar-wrap"><span class="pct-text">${pct}%</span><div class="pct-bar"><div class="pct-bar-fill ${color}" style="width:${Math.min(parseFloat(pct), 100)}%"></div></div></div>`;

  const badge = (curr, prev) => {
    const b = vsBadge(curr, prev);
    return `<span class="cb ${b.cls}">${b.text}</span>`;
  };

  const modRows = (errAggs.by_module?.buckets ?? [])
    .map((b) => {
      const pct = pctOfErrors(b.doc_count);
      return `<tr><td><a href="${L(`mod_${b.key}`)}" target="_blank">${escapeHtml(b.key)}</a></td><td class="r">${fmtNum(b.doc_count)}</td><td>${pctBar(pct, pctBarColor(parseFloat(pct)))}</td><td>${badge(b.doc_count, modPrev.get(b.key))}</td></tr>`;
    })
    .join("\n");

  const storeRows = (errAggs.by_store?.buckets ?? [])
    .map((b) => {
      const pct = pctOfErrors(b.doc_count);
      return `<tr><td><a href="${L(`store_${b.key}`)}" target="_blank">${escapeHtml(b.key)}</a></td><td class="r">${fmtNum(b.doc_count)}</td><td>${pctBar(pct, pctBarColor(parseFloat(pct)))}</td><td>${badge(b.doc_count, storePrev.get(b.key))}</td></tr>`;
    })
    .join("\n");

  const tagRows = (errAggs.by_tag?.buckets ?? [])
    .filter((b) => b.key !== "(none)")
    .map(
      (b) =>
        `<tr><td><a href="${L(`tag_${b.key}`)}" target="_blank">${escapeHtml(b.key)}</a></td><td class="r">${fmtNum(b.doc_count)}</td><td>${badge(b.doc_count, tagPrev.get(b.key))}</td></tr>`
    )
    .join("\n");

  const procRows = (errAggs.by_process?.buckets ?? [])
    .filter((b) => b.key !== "(none)")
    .map(
      (b) =>
        `<tr><td><a href="${L(`proc_${b.key}`)}" target="_blank">${escapeHtml(b.key)}</a></td><td class="r">${fmtNum(b.doc_count)}</td><td>${badge(b.doc_count, procPrev.get(b.key))}</td></tr>`
    )
    .join("\n");

  const msgRows = (errAggs.top_messages?.buckets ?? [])
    .map(
      (b, i) =>
        `<tr><td>${i + 1}</td><td><a href="${L(`msg_${b.key.slice(0, 40)}`)}" target="_blank">${escapeHtml(b.key)}</a></td><td class="r">${fmtNum(b.doc_count)}</td><td>${badge(b.doc_count, msgPrev.get(b.key))}</td></tr>`
    )
    .join("\n");

  const subRows = (errAggs.top_subscribers?.buckets ?? [])
    .map((b) => {
      const pct = pctOfErrors(b.doc_count);
      return `<tr><td><a href="${L(`sub_${b.key}`)}" target="_blank">${b.key}</a></td><td class="r">${fmtNum(b.doc_count)}</td><td>${pct}%</td><td>${badge(b.doc_count, subPrev.get(b.key))}</td></tr>`;
    })
    .join("\n");

  const fatalMsgRows = (fatalAggs.by_message?.buckets ?? [])
    .map(
      (b) =>
        `<tr><td><a href="${L(`fatal_msg_${b.key.slice(0, 30)}`)}" target="_blank">${escapeHtml(b.key)}</a></td><td class="r">${fmtNum(b.doc_count)}</td><td>${badge(b.doc_count, fatalMsgPrev.get(b.key))}</td></tr>`
    )
    .join("\n") || '<tr><td colspan="3">No fatal messages found</td></tr>';

  const fatalStores = fatalAggs.by_store?.buckets ?? [];
  const fatalStoreTotal = fatalStores.reduce((s, b) => s + b.doc_count, 0) || 1;
  const donutColors = ["#96bf48", "#7f54b3", "#2196F3", "#ff9900", "#ee672d", "#94a3b8"];
  let degAcc = 0;
  const conicParts = fatalStores.map((b, i) => {
    const deg = (b.doc_count / fatalStoreTotal) * 360;
    const start = degAcc;
    degAcc += deg;
    return `${donutColors[i % donutColors.length]} ${start}deg ${degAcc}deg`;
  });
  const donutStyle = conicParts.length
    ? `conic-gradient(${conicParts.join(", ")})`
    : "conic-gradient(#e2e8f0 0deg 360deg)";

  const fatalStoreRows = fatalStores
    .map(
      (b) =>
        `<tr><td><a href="${L(`fatal_store_${b.key}`)}" target="_blank">${escapeHtml(b.key)}</a></td><td class="r">${fmtNum(b.doc_count)}</td><td>${badge(b.doc_count, fatalStorePrev.get(b.key))}</td></tr>`
    )
    .join("\n") || '<tr><td colspan="3">No data</td></tr>';

  const barHtml = hourly.bars
    .map((b) => {
      const pct = Math.max((b.count / hourly.max) * 100, 0.1);
      const cls = barColorClass(pct);
      return `<div class="bar-col"><div class="bar ${cls}" style="height:${pct.toFixed(1)}%" title="${b.label}:00 IST — ${b.count} errors"></div><div class="bar-lbl">${b.label}</div></div>`;
    })
    .join("\n");

  const totalProcessed = payoutAgg.total_processed?.value ?? 0;
  const totalProcessedPrev = payoutAggPrev.total_processed?.value ?? 0;
  const payoutStats = payoutAgg.payout_time_stats?.value ?? {};
  const payoutBatches = payoutAgg.batch_count?.value ?? payoutStats.batch_count ?? 0;

  const shopifySection =
    totalProcessed > 0 || payoutBatches > 0
      ? `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px">
      <div class="exec-card info"><div class="label">Records Processed</div><div class="value"><a href="${L("shopify_all")}" target="_blank">${fmtNum(totalProcessed)}</a></div><div class="change">${badge(totalProcessed, totalProcessedPrev)}</div></div>
      <div class="exec-card total"><div class="label">Batches</div><div class="value">${fmtNum(payoutBatches)}</div></div>
      <div class="exec-card rate"><div class="label">Min Time/Record</div><div class="value">${fmtDurSec(payoutStats.min_per_payout_seconds)}</div></div>
      <div class="exec-card warning"><div class="label">Max Time/Record</div><div class="value">${fmtDurSec(payoutStats.max_per_payout_seconds)}</div></div>
      <div class="exec-card info"><div class="label">Avg Time/Record</div><div class="value">${fmtDurSec(payoutStats.avg_per_payout_seconds)}</div></div>
      <div class="exec-card total"><div class="label">Est. Total Time</div><div class="value">${fmtDurSec(payoutStats.total_seconds)}</div></div>
    </div>
    <table class="tbl"><thead><tr><th>Subscriber ID</th><th class="r">Records</th><th class="r">Batches</th><th>% of Total</th><th>vs Prev</th></tr></thead><tbody>
    ${(payoutAgg.by_subscriber?.buckets ?? [])
      .map((b) => {
        const rec = b.processed_sum?.value ?? 0;
        const pct = totalProcessed ? ((rec / totalProcessed) * 100).toFixed(1) : "0";
        const prevB = payoutAggPrev.by_subscriber?.buckets?.find((x) => x.key === b.key);
        const prevRec = prevB?.processed_sum?.value ?? 0;
        return `<tr><td><a href="${L(`payout_sub_${b.key}`)}" target="_blank">${b.key}</a></td><td class="r">${fmtNum(rec)}</td><td class="r">${fmtNum(b.batch_count?.value ?? 0)}</td><td>${pct}%</td><td>${badge(rec, prevRec)}</td></tr>`;
      })
      .join("\n")}
    </tbody></table>`
      : `<p style="color:#64748b;padding:12px 0">No PayoutPosting data found for this period</p>`;

  const amazonTotal = amazonToday.hits?.total?.value ?? 0;
  const amazonTotalPrev = amazonPrev.hits?.total?.value ?? 0;
  const amazonLevels = levelMap(amazonAgg);
  const amazonLevelsPrev = levelMap(amazonAggPrev);
  const amazonErrors = amazonLevels.Error ?? 0;
  const amazonErrorsPrev = amazonLevelsPrev.Error ?? 0;
  const amazonProcessed = amazonAgg.total_processed?.value ?? amazonLevels.Info ?? 0;
  const amazonProcessedPrev = amazonAggPrev.total_processed?.value ?? amazonLevelsPrev.Info ?? 0;
  const amazonSubs = amazonAgg.unique_subscribers?.value ?? 0;

  const amazonSection =
    amazonTotal > 0
      ? `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px">
      <div class="exec-card total"><div class="label">Total Events</div><div class="value"><a href="${L("amazon_all")}" target="_blank">${fmtNum(amazonTotal)}</a></div><div class="change">${badge(amazonTotal, amazonTotalPrev)}</div></div>
      <div class="exec-card error"><div class="label">Errors</div><div class="value"><a href="${L("amazon_errors")}" target="_blank">${fmtNum(amazonErrors)}</a></div><div class="change">${badge(amazonErrors, amazonErrorsPrev)}</div></div>
      <div class="exec-card info"><div class="label">Settlements Processed</div><div class="value">${fmtNum(amazonProcessed)}</div><div class="change">${badge(amazonProcessed, amazonProcessedPrev)}</div></div>
      <div class="exec-card rate"><div class="label">Affected Subscribers</div><div class="value">${fmtNum(amazonSubs)}</div></div>
    </div>
    <div style="font-size:.78rem;font-weight:700;margin:12px 0 8px">Top Error Messages</div>
    <table class="tbl"><thead><tr><th>Message</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>
    ${(amazonAgg.top_errors?.by_message?.buckets ?? [])
      .map((b) => {
        const prevB = amazonAggPrev.top_errors?.by_message?.buckets?.find((x) => x.key === b.key);
        return `<tr><td><a href="${L(`amz_err_${b.key.slice(0, 30)}`)}" target="_blank">${escapeHtml(b.key)}</a></td><td class="r">${fmtNum(b.doc_count)}</td><td>${badge(b.doc_count, prevB?.doc_count)}</td></tr>`;
      })
      .join("\n") || '<tr><td colspan="3">No errors</td></tr>'}
    </tbody></table>
    <div style="font-size:.78rem;font-weight:700;margin:16px 0 8px">Top 5 Subscribers</div>
    <table class="tbl"><thead><tr><th>Subscriber</th><th class="r">Events</th><th class="r">Errors</th><th class="r">Settlements</th><th>vs Prev</th></tr></thead><tbody>
    ${(amazonAgg.top_subscribers?.buckets ?? [])
      .map((b) => {
        const errs = b.by_level?.buckets?.find((x) => x.key === "Error")?.doc_count ?? 0;
        const sett = b.processed_sum?.value ?? 0;
        const prevB = amazonAggPrev.top_subscribers?.buckets?.find((x) => x.key === b.key);
        const prevSett = prevB?.processed_sum?.value ?? 0;
        return `<tr><td><a href="${L(`amz_sub_${b.key}`)}" target="_blank">${b.key}</a></td><td class="r">${fmtNum(b.doc_count)}</td><td class="r">${fmtNum(errs)}</td><td class="r">${fmtNum(sett)}</td><td>${badge(sett, prevSett)}</td></tr>`;
      })
      .join("\n")}
    </tbody></table>`
      : `<p style="color:#64748b;padding:12px 0">No Amazon Settlement activity found for this period</p>`;

  function renderPerfSection(title, module, perf, prevMapSub, linkPrefix) {
    if (perf.runCount === 0) {
      return `<p style="color:#64748b;padding:12px 0">No <code>${module === "PayoutPosting" ? "Payout_PerformanceSummary" : "Settlement_PerformanceSummary"}</code> logs found in this period.</p>`;
    }
    const rows = perf.top5
      .map((s, i) => {
        const pct = ((s.totalTime / perf.maxSubTime) * 100).toFixed(0);
        const barColor = pct > 80 ? "red" : pct > 50 ? "orange" : pct > 25 ? "amber" : "blue";
        const top3 = [...s.allSteps]
          .sort((a, b) => b.ms - a.ms)
          .slice(0, 3)
          .map((st) => `S${st.num}: ${fmtDurMs(st.ms)}`)
          .join("<br>");
        const prevT = prevMapSub.get(s.subscriberID);
        return `<tr>
      <td>${i + 1}</td>
      <td><a href="${L(`${linkPrefix}_${s.subscriberID}`)}" target="_blank">${s.subscriberID}</a></td>
      <td class="perf-email">${escapeHtml(s.email)}</td>
      <td class="r">${s.runCount}</td>
      <td class="r">${fmtNum(s.processedRecords)}</td>
      <td class="r perf-time">${fmtDurMs(s.totalTime)}</td>
      <td><div class="pct-bar-wrap"><span class="pct-text">${pct}%</span><div class="pct-bar"><div class="pct-bar-fill ${barColor}" style="width:${pct}%"></div></div></div></td>
      <td class="perf-step-max">${escapeHtml(s.maxStep)}<br><span class="perf-step-ms">${fmtDurMs(s.maxStepMs)}</span></td>
      <td class="perf-step-detail">${top3}</td>
      <td>${badge(s.totalTime, prevT)}</td>
    </tr>`;
      })
      .join("\n");

    const stepBars = perf.stepsOrdered
      .map((st) => {
        const avg = st.totalMs / st.count;
        const pct = ((avg / perf.maxAvg) * 100).toFixed(1);
        const color = pct > 80 ? "red" : pct > 50 ? "orange" : pct > 25 ? "amber" : "blue";
        const shortName = st.name.length > 18 ? st.name.slice(0, 18) + "…" : st.name;
        return `<div class="step-row"><div class="step-label" title="${escapeHtml(st.name)}">S${st.num}: ${escapeHtml(shortName)}</div><div class="step-bar-wrap"><div class="step-bar ${color}" style="width:${pct}%"></div><span class="step-bar-val">${fmtDurMs(avg)} avg / ${fmtDurMs(st.maxMs)} max (${st.count} runs)</span></div></div>`;
      })
      .join("\n");

    return `
    <p class="subtitle" style="margin-bottom:12px">${perf.runCount} performance summary runs in period</p>
    <table class="perf-table"><thead><tr><th>#</th><th>Subscriber ID</th><th>Email</th><th>Runs</th><th>Transactions</th><th>Total Time</th><th>% of Max</th><th>Slowest Step</th><th>Top 3 Steps</th><th>vs Prev</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="step-chart"><div class="step-chart-title">Avg Step Processing Time — ${title} (${perf.runCount} runs)</div>${stepBars}</div>`;
  }

  const insights = [];
  if (errorsToday > errorsPrev * 1.2)
    insights.push({ type: "spike", title: "Error volume elevated", desc: `Errors at ${fmtNum(errorsToday)} vs ${fmtNum(errorsPrev)} previous period (${badge(errorsToday, errorsPrev)}).` });
  if (hourly.peak.count > 500)
    insights.push({ type: "warning", title: `Peak at ${hourly.peak.label}:00 IST`, desc: `${fmtNum(hourly.peak.count)} errors in the busiest hour.` });
  const storeConn = errAggs.by_tag?.buckets?.find((b) => b.key === "StoreConnectionError");
  if (storeConn && storeConn.doc_count > 500)
    insights.push({ type: "danger", title: "StoreConnectionError spike", desc: `${fmtNum(storeConn.doc_count)} store connection errors — investigate channel credentials.` });
  if (errorsToday < errorsPrev * 0.9)
    insights.push({ type: "healthy", title: "Errors decreased", desc: `Error count down vs previous day (${fmtNum(errorsToday)} vs ${fmtNum(errorsPrev)}).` });
  if (insights.length === 0)
    insights.push({ type: "healthy", title: "Stable period", desc: "No major anomalies detected in this reporting window." });

  const insightHtml = insights
    .map(
      (ins) =>
        `<div class="insight-card ${ins.type}"><div class="icon">${ins.type === "danger" ? "!" : ins.type === "warning" ? "↑" : ins.type === "spike" ? "⚡" : "✓"}</div><h4>${escapeHtml(ins.title)}</h4><p>${ins.desc}</p></div>`
    )
    .join("\n");

  const genUtc = new Date().toISOString().replace("T", " ").slice(0, 19);
  const idxDisplay = WIN.indices.replace(/,/g, " / ");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WD Kibana Daily Log Report — ${WIN.reportDate}</title>
<style>${css}</style>
</head>
<body>
<div class="page">

<div class="rpt-header">
  <h1>WD Kibana Daily Log Report — ${WIN.reportDate}</h1>
  <div class="meta">
    <span>📅 Period: ${WIN.periodIst}</span>
    <span>📊 Index: ${idxDisplay}</span>
    <span>⚖️ Compared to: ${WIN.compareIst}</span>
    <span>🕐 Generated: ${genUtc} UTC</span>
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>📋 Executive Summary</h2><span class="subtitle">Total docs: ${fmtNum(totalToday)} vs ${fmtNum(totalPrev)} prev day</span></div>
  <div class="card-body">
    <div class="exec-grid">
      <div class="exec-card total"><div class="label">Total Events</div><div class="value"><a href="${L("total")}" target="_blank">${fmtNum(totalToday)}</a></div><div class="change">${badge(totalToday, totalPrev)} vs prev ${fmtNum(totalPrev)}</div></div>
      <div class="exec-card error"><div class="label">Errors</div><div class="value"><a href="${L("errors")}" target="_blank">${fmtNum(errorsToday)}</a></div><div class="change">${badge(errorsToday, errorsPrev)} vs prev ${fmtNum(errorsPrev)}</div></div>
      <div class="exec-card fatal"><div class="label">Fatals</div><div class="value"><a href="${L("fatals")}" target="_blank">${fmtNum(fatalsToday)}</a></div><div class="change">${badge(fatalsToday, fatalsPrev)} vs prev ${fmtNum(fatalsPrev)}</div></div>
      <div class="exec-card warning"><div class="label">Warnings</div><div class="value"><a href="${L("warnings")}" target="_blank">${fmtNum(warningsToday)}</a></div><div class="change">${badge(warningsToday, warningsPrev)} vs prev ${fmtNum(warningsPrev)}</div></div>
      <div class="exec-card info"><div class="label">Info</div><div class="value"><a href="${L("info")}" target="_blank">${fmtNum(infoToday)}</a></div><div class="change">${badge(infoToday, infoPrev)} vs prev ${fmtNum(infoPrev)}</div></div>
      <div class="exec-card rate"><div class="label">Error Rate</div><div class="value">${errorRateToday}%</div><div class="change">${badge(parseFloat(errorRateToday), parseFloat(errorRatePrev))} vs prev ${errorRatePrev}%</div></div>
    </div>
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>⏱ Hourly Error Timeline (IST)</h2><span class="subtitle">Peak: ${fmtNum(hourly.peak.count)} errors at ${hourly.peak.label}:00 IST</span></div>
  <div class="card-body">
    ${errorsToday > 0 ? `<div class="bar-chart">${barHtml}</div>` : '<p style="color:#64748b">No error events found in this period</p>'}
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>🔍 Error Breakdown</h2><span class="subtitle">${fmtNum(errorsToday)} total errors</span></div>
  <div class="card-body">
    ${errorsToday > 0 ? `<div class="grid-2">
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Module</div>
      <table class="tbl"><thead><tr><th>Module</th><th class="r">Count</th><th>% of Errors</th><th>vs Prev</th></tr></thead><tbody>${modRows}</tbody></table></div>
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Store</div>
      <table class="tbl"><thead><tr><th>Store</th><th class="r">Count</th><th>%</th><th>vs Prev</th></tr></thead><tbody>${storeRows}</tbody></table></div>
    </div>
    <div class="section-sep"></div>
    <div class="grid-2" style="margin-top:16px">
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Tag</div>
      <table class="tbl"><thead><tr><th>Tag</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${tagRows || '<tr><td colspan="3">No tagged errors</td></tr>'}</tbody></table></div>
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Process</div>
      <table class="tbl"><thead><tr><th>Process</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${procRows || '<tr><td colspan="3">No process-tagged errors</td></tr>'}</tbody></table></div>
    </div>` : '<p style="color:#64748b;padding:12px 0">No error events found in this period</p>'}
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>⚠️ Top Error Messages</h2></div>
  <div class="card-body">
    ${errorsToday > 0 ? `<table class="tbl"><thead><tr><th>#</th><th>Message</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${msgRows}</tbody></table>` : '<p style="color:#64748b">No error messages found in this period</p>'}
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>👤 Top Error Subscribers</h2></div>
  <div class="card-body">
    ${errorsToday > 0 ? `<table class="tbl"><thead><tr><th>Subscriber ID</th><th class="r">Errors</th><th>% of Errors</th><th>vs Prev</th></tr></thead><tbody>${subRows}</tbody></table>` : '<p style="color:#64748b">No error subscribers found in this period</p>'}
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>💀 Fatal Events</h2><span class="subtitle">${fmtNum(fatalsToday)} fatals</span></div>
  <div class="card-body">
    ${fatalsToday > 0 ? `<div class="grid-2">
      <div><div style="font-size:.78rem;font-weight:700;margin-bottom:8px">By Message</div>
      <table class="tbl"><thead><tr><th>Message</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${fatalMsgRows}</tbody></table></div>
      <div><div class="donut-wrap"><div class="donut" style="background:${donutStyle}"></div>
      <table class="tbl"><thead><tr><th>Store</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${fatalStoreRows}</tbody></table></div>
    </div>` : '<p style="color:#64748b">No fatal events found in this period</p>'}
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>💳 Shopify Payout Performance</h2></div>
  <div class="card-body">${shopifySection}</div>
</div>

<div class="card">
  <div class="card-header"><h2>🛒 Amazon Settlement Report</h2></div>
  <div class="card-body">${amazonSection}</div>
</div>

<div class="card">
  <div class="card-header"><h2>🏃 Shopify Payout — Performance Deep-Dive</h2></div>
  <div class="card-body">${renderPerfSection("Shopify Payout", "PayoutPosting", perfPayout, prevSubTimePayout, "perf_p")}</div>
</div>

<div class="card">
  <div class="card-header"><h2>🏃 Amazon Settlement — Performance Deep-Dive</h2></div>
  <div class="card-body">${renderPerfSection("Amazon Settlement", "AmazonSettlementReport", perfAmazon, prevSubTimeAmazon, "perf_a")}</div>
</div>

<div class="card">
  <div class="card-header"><h2>💡 Actionable Insights</h2></div>
  <div class="card-body"><div class="insights-grid">${insightHtml}</div></div>
</div>

<div class="card">
  <div class="card-body" style="font-size:.72rem;color:#94a3b8;text-align:center">
    Source: Kibana WD (<a href="https://kibana-wd.webgility.com" target="_blank">kibana-wd.webgility.com</a>) · Indices: ${idxDisplay} · Automation-generated ${genUtc} UTC
  </div>
</div>

</div>
</body>
</html>`;

  const outDir = join(REPO_ROOT, "reports/wd-kibana-logs");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${WIN.reportDate}-wd-kibana-daily-report.html`);
  writeFileSync(outPath, html, "utf8");
  const size = Buffer.byteLength(html, "utf8");
  console.log(`Wrote ${outPath} (${(size / 1024).toFixed(1)} KB)`);

  if (size < 30 * 1024) {
    console.error(`ERROR: Report size ${size} bytes < 30 KB minimum`);
    process.exit(1);
  }

  const reportDir = outDir;
  for (const f of readdirSync(reportDir)) {
    if (/^(gen-short-urls|short-urls|q\d|computed)/.test(f)) {
      try {
        unlinkSync(join(reportDir, f));
        console.log(`Cleaned up ${f}`);
      } catch {}
    }
  }

  console.log(JSON.stringify({
    reportDate: WIN.reportDate,
    path: outPath,
    sizeKb: (size / 1024).toFixed(1),
    totalToday,
    errorsToday,
    fatalsToday,
    peakHour: hourly.peak,
  }));
}

main().catch((e) => {
  console.error("HALT:", e.message);
  process.exit(1);
});
