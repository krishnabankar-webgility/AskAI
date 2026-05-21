#!/usr/bin/env node
/**
 * WD Kibana Daily HTML Report Generator
 * Uses Kibana WD HTTPS proxy + shorten_url API
 */
import { writeFileSync, mkdirSync, unlinkSync, readdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = resolve(__dirname, "../../reports/wd-kibana-logs");
const KIBANA = "https://kibana-wd.webgility.com";
const INDEX_ID = "61237d60-0ed9-11eb-816a-cde07dc15a1f";
const AUTH = process.env.KIBANA_WD_AUTH;

if (!AUTH) {
  console.error("HALT: KIBANA_WD_AUTH not set");
  process.exit(1);
}

const AUTH_B64 = Buffer.from(AUTH).toString("base64");
const HDR = {
  Authorization: `Basic ${AUTH_B64}`,
  "kbn-xsrf": "true",
  "Content-Type": "application/json",
};

// Time windows — default: yesterday 9AM IST → today 9AM IST
function istWindow() {
  const now = new Date();
  const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 30, 0));
  if (now < todayEnd) todayEnd.setUTCDate(todayEnd.getUTCDate() - 1);
  const start = new Date(todayEnd);
  start.setUTCDate(start.getUTCDate() - 1);
  const prevStart = new Date(start);
  prevStart.setUTCDate(prevStart.getUTCDate() - 1);
  return {
    start: start.toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    end: todayEnd.toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    prevStart: prevStart.toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    reportDate: todayEnd.toISOString().slice(0, 10),
    yesterday: start.toISOString().slice(0, 10),
    dayBefore: prevStart.toISOString().slice(0, 10),
  };
}

const TW = istWindow();
const fmtIdx = (d) => d.replace(/-/g, ".");
const INDICES = `webgilitydesktop-${fmtIdx(TW.yesterday)},webgilitydesktop-${fmtIdx(TW.reportDate)}`;
const INDICES_PREV = `webgilitydesktop-${fmtIdx(TW.dayBefore)},webgilitydesktop-${fmtIdx(TW.yesterday)}`;

async function esSearch(indices, body) {
  const path = encodeURIComponent(`${indices}/_search`);
  const url = `${KIBANA}/api/console/proxy?path=${path}&method=POST`;
  const r = await fetch(url, { method: "POST", headers: HDR, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new Error(`ES ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

function discoverPath(kql, from, to) {
  const q = kql.replace(/'/g, "\\'");
  return `/app/kibana#/discover?_g=(refreshInterval:(pause:!t,value:0),time:(from:'${from}',to:'${to}'))&_a=(columns:!(timestamp,level,message,store,module,subscriberID),index:'${INDEX_ID}',interval:auto,query:(language:kuery,query:'${q}'),sort:!(!(timestamp,desc)))`;
}

const urlCache = new Map();
async function shortUrl(kql, from = TW.start, to = TW.end) {
  const key = `${from}|${to}|${kql}`;
  if (urlCache.has(key)) return urlCache.get(key);
  const r = await fetch(`${KIBANA}/api/shorten_url`, {
    method: "POST",
    headers: HDR,
    body: JSON.stringify({ url: discoverPath(kql, from, to) }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) {
    const fallback = "https://kibana-wd.webgility.com";
    urlCache.set(key, fallback);
    return fallback;
  }
  const j = await r.json();
  const u = `https://kibana-wd.webgility.com/goto/${j.urlId}`;
  urlCache.set(key, u);
  return u;
}

async function shortUrlsBatch(items) {
  const results = {};
  const batchSize = 15;
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    await Promise.all(
      chunk.map(async ({ id, kql, from, to }) => {
        results[id] = await shortUrl(kql, from ?? TW.start, to ?? TW.end);
      })
    );
  }
  return results;
}

function mainAgg(gte, lt) {
  return {
    query: { bool: { must: [{ range: { timestamp: { gte, lt } } }] } },
    size: 0,
    track_total_hits: true,
    aggs: {
      by_level: { terms: { field: "level.keyword", size: 10 } },
      errors_hourly: {
        filter: { term: { "level.keyword": "Error" } },
        aggs: {
          by_hour: {
            date_histogram: { field: "timestamp", fixed_interval: "1h", min_doc_count: 0, extended_bounds: { min: gte, max: lt } },
          },
        },
      },
      errors_by_module: {
        filter: { term: { "level.keyword": "Error" } },
        aggs: { by_module: { terms: { field: "module.keyword", size: 15, missing: "Unknown" } } },
      },
      errors_by_store: {
        filter: { term: { "level.keyword": "Error" } },
        aggs: { by_store: { terms: { field: "store.keyword", size: 20, missing: "Unknown" } } },
      },
      errors_by_tag: {
        filter: { term: { "level.keyword": "Error" } },
        aggs: { by_tag: { terms: { field: "tag.keyword", size: 15, missing: "Unknown" } } },
      },
      errors_by_process: {
        filter: { term: { "level.keyword": "Error" } },
        aggs: { by_process: { terms: { field: "process.keyword", size: 10, missing: "Unknown" } } },
      },
      top_messages: {
        filter: { term: { "level.keyword": "Error" } },
        aggs: { by_message: { terms: { field: "message.keyword", size: 15 } } },
      },
      top_subscribers: {
        filter: { term: { "level.keyword": "Error" } },
        aggs: { by_sub: { terms: { field: "subscriberID", size: 10 } } },
      },
      fatals_by_message: {
        filter: { term: { "level.keyword": "Fatal" } },
        aggs: { by_message: { terms: { field: "message.keyword", size: 15 } } },
      },
      fatals_by_store: {
        filter: { term: { "level.keyword": "Fatal" } },
        aggs: { by_store: { terms: { field: "store.keyword", size: 15, missing: "Unknown" } } },
      },
    },
  };
}

function payoutQuery(gte, lt, withRate = true) {
  const must = [
    { range: { timestamp: { gte, lt } } },
    { term: { "store.keyword": "Shopify" } },
    { term: { "module.keyword": "PayoutPosting" } },
    { exists: { field: "processedRecords" } },
  ];
  if (withRate) must.push({ range: { averagePerSecond: { gt: 0 } } });
  return {
    query: { bool: { must } },
    size: 0,
    track_total_hits: true,
    aggs: {
      total_processed: { sum: { field: "processedRecords" } },
      by_subscriber: {
        terms: { field: "subscriberID", size: 5, order: { processed_sum: "desc" } },
        aggs: {
          processed_sum: { sum: { field: "processedRecords" } },
          batch_count: { value_count: { field: "processedRecords" } },
        },
      },
      payout_time_stats: withRate
        ? {
            scripted_metric: {
              init_script: "state.total_time = 0; state.per_record_times = []",
              map_script:
                "double rate = doc['averagePerSecond'].value; long records = doc['processedRecords'].value; if (rate > 0 && records > 0) { double batch_time = records / rate; state.total_time += batch_time; state.per_record_times.add(1.0 / rate); }",
              combine_script: "return ['total_time': state.total_time, 'per_record_times': state.per_record_times]",
              reduce_script:
                "double total = 0; double min_t = Double.MAX_VALUE; double max_t = 0; double sum_t = 0; int count = 0; for (s in states) { total += s.total_time; for (t in s.per_record_times) { if (t < min_t) min_t = t; if (t > max_t) max_t = t; sum_t += t; count++; } } return ['total_seconds': total, 'min_per_payout_seconds': min_t == Double.MAX_VALUE ? 0 : min_t, 'max_per_payout_seconds': max_t, 'avg_per_payout_seconds': count > 0 ? sum_t / count : 0, 'batch_count': count]",
            },
          }
        : undefined,
    },
  };
}

function amazonQuery(gte, lt) {
  return {
    query: {
      bool: {
        must: [{ range: { timestamp: { gte, lt } } }, { term: { "module.keyword": "AmazonSettlementReport" } }],
      },
    },
    size: 0,
    track_total_hits: true,
    aggs: {
      by_level: { terms: { field: "level.keyword", size: 10 } },
      total_processed: { sum: { field: "processedRecords" } },
      unique_subs: { cardinality: { field: "subscriberID" } },
      top_errors: {
        filter: { term: { "level.keyword": "Error" } },
        aggs: { by_message: { terms: { field: "message.keyword", size: 10 } } },
      },
      top_subscribers: {
        terms: { field: "subscriberID", size: 5, order: { _count: "desc" } },
        aggs: {
          by_level: { terms: { field: "level.keyword", size: 5 } },
          processed_sum: { sum: { field: "processedRecords" } },
          errors: { filter: { term: { "level.keyword": "Error" } } },
        },
      },
    },
  };
}

function perfQuery(gte, lt, module, methodType) {
  return {
    query: {
      bool: {
        must: [
          { range: { timestamp: { gte, lt } } },
          { term: { "module.keyword": module } },
          { term: { "methodType.keyword": methodType } },
        ],
      },
    },
    size: 200,
    sort: [{ timestamp: "desc" }],
    _source: ["timestamp", "subscriberID", "profileId", "email", "detail", "message", "processedRecords", "baseUrl", "process", "methodType", "tag"],
  };
}

function perfQueryFallback(gte, lt, module) {
  return {
    query: {
      bool: {
        must: [
          { range: { timestamp: { gte, lt } } },
          { term: { "module.keyword": module } },
          { term: { "tag.keyword": "Performance" } },
        ],
      },
    },
    size: 200,
    sort: [{ timestamp: "desc" }],
    _source: ["timestamp", "subscriberID", "profileId", "email", "detail", "message", "processedRecords", "baseUrl", "process", "methodType", "tag"],
  };
}

function levelMap(aggs) {
  const m = {};
  for (const b of aggs?.by_level?.buckets ?? []) m[b.key] = b.doc_count;
  return m;
}

function pctChange(cur, prev) {
  if (prev === 0 && cur === 0) return { cls: "flat", text: "≈" };
  if (prev === 0) return { cls: "new", text: "NEW" };
  const p = ((cur - prev) / prev) * 100;
  if (Math.abs(p) <= 10) return { cls: "flat", text: "≈" };
  const sign = p > 0 ? "↑" : "↓";
  const cls = p > 0 ? "up" : "down";
  return { cls, text: `${sign}${Math.abs(p).toFixed(1)}%` };
}

function fmtNum(n) {
  return (n ?? 0).toLocaleString("en-US");
}

function fmtDurSec(s) {
  if (s < 60) return `${s.toFixed(1)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function fmtDurMs(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) {
    const m = Math.floor(ms / 60000);
    const s = Math.round((ms % 60000) / 1000);
    return `${m}m ${s}s`;
  }
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${h}h ${m}m ${s > 0 ? ` ${s}s` : ""}`.trim();
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

function parsePerfDoc(src) {
  const detail = src.detail || "";
  const msg = src.message || "";
  let totalTime = 0;
  const m1 = detail.match(/Total Time:\s*(\d+)\s*ms/);
  const m2 = msg.match(/Total Time:\s*(\d+),?\s*ms/);
  if (m1) totalTime = parseInt(m1[1], 10);
  else if (m2) totalTime = parseInt(m2[1], 10);

  const steps = [];
  const lines = detail.split(/\r?\n/);
  const stepRe = /^Step\s+(\d+):\s+(.+?):\s+(\d+)\s+ms(?:\s+\|\s+Records:\s+(\d+))?/;
  for (const line of lines) {
    const sm = line.match(stepRe);
    if (sm) steps.push({ num: +sm[1], name: sm[2].trim(), ms: +sm[3], records: sm[4] ? +sm[4] : 0 });
  }
  let maxStep = null;
  let maxStepMs = 0;
  for (const s of steps) {
    if (s.ms > maxStepMs) {
      maxStepMs = s.ms;
      maxStep = s;
    }
  }
  return {
    subscriberID: src.subscriberID,
    profileId: src.profileId,
    email: src.email || "",
    processedRecords: src.processedRecords || 0,
    process: src.process || "",
    totalTime,
    maxStep: maxStep?.name ?? "—",
    maxStepMs,
    steps,
  };
}

function aggregatePerf(hits) {
  const parsed = hits.map((h) => parsePerfDoc(h._source));
  const bySub = new Map();
  for (const p of parsed) {
    const id = p.subscriberID;
    if (!bySub.has(id))
      bySub.set(id, { subscriberID: id, email: p.email, totalTime: 0, runCount: 0, processedRecords: 0, maxStepMs: 0, maxStep: "", allSteps: [] });
    const s = bySub.get(id);
    s.totalTime += p.totalTime;
    s.runCount++;
    s.processedRecords += p.processedRecords;
    if (p.maxStepMs > s.maxStepMs) {
      s.maxStepMs = p.maxStepMs;
      s.maxStep = p.maxStep;
    }
    s.allSteps.push(...p.steps);
  }
  const top5 = [...bySub.values()].sort((a, b) => b.totalTime - a.totalTime).slice(0, 5);

  const stepStats = new Map();
  for (const p of parsed) {
    for (const st of p.steps) {
      if (!stepStats.has(st.name)) stepStats.set(st.name, { num: st.num, name: st.name, count: 0, totalMs: 0, maxMs: 0, minMs: Infinity });
      const ss = stepStats.get(st.name);
      ss.count++;
      ss.totalMs += st.ms;
      ss.maxMs = Math.max(ss.maxMs, st.ms);
      ss.minMs = Math.min(ss.minMs, st.ms);
    }
  }
  const stepList = [...stepStats.values()].sort((a, b) => a.num - b.num);
  return { parsed, top5, stepList, runCount: parsed.length };
}

function top3Steps(allSteps) {
  const byName = new Map();
  for (const s of allSteps) {
    if (!byName.has(s.name)) byName.set(s.name, { num: s.num, name: s.name, ms: 0 });
    byName.get(s.name).ms += s.ms;
  }
  return [...byName.values()].sort((a, b) => b.ms - a.ms).slice(0, 3);
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function link(url, text) {
  return `<a href="${url}" target="_blank">${esc(text)}</a>`;
}

function badge(chg) {
  return `<span class="cb ${chg.cls}">${chg.text}</span>`;
}

function pctBar(pct, color) {
  const p = Math.min(100, pct).toFixed(1);
  return `<div class="pct-bar-wrap"><span class="pct-text">${p}%</span><div class="pct-bar"><div class="pct-bar-fill ${color}" style="width:${p}%"></div></div></div>`;
}

async function main() {
  console.log("Time window:", TW.start, "→", TW.end);
  console.log("Indices:", INDICES);

  const [q1, q2, q3, q4, q5raw, q6raw] = await Promise.all([
    esSearch(INDICES, mainAgg(TW.start, TW.end)),
    esSearch(INDICES_PREV, mainAgg(TW.prevStart, TW.start)),
    esSearch(INDICES, payoutQuery(TW.start, TW.end, true)).catch((e) => ({ error: e.message })),
    esSearch(INDICES, amazonQuery(TW.start, TW.end)),
    esSearch(INDICES, perfQuery(TW.start, TW.end, "PayoutPosting", "Payout_PerformanceSummary")),
    esSearch(INDICES, perfQuery(TW.start, TW.end, "AmazonSettlementReport", "Settlement_PerformanceSummary")),
  ]);

  const totalHits = q1.hits?.total?.value ?? q1.hits?.total ?? 0;
  if (totalHits === 0 && !q1.aggregations) {
    console.error("HALT: Q1 returned no data and no aggregations — possible auth/query failure");
    process.exit(1);
  }

  let q3data = q3;
  if (q3.error || (q3.hits?.total?.value ?? 0) === 0) {
    q3data = await esSearch(INDICES, payoutQuery(TW.start, TW.end, false));
  }

  let q5 = q5raw;
  if ((q5.hits?.hits?.length ?? 0) === 0) {
    q5 = await esSearch(INDICES, perfQueryFallback(TW.start, TW.end, "PayoutPosting"));
  }
  let q6 = q6raw;
  if ((q6.hits?.hits?.length ?? 0) === 0) {
    q6 = await esSearch(INDICES, perfQueryFallback(TW.start, TW.end, "AmazonSettlementReport"));
  }

  const q3prev = await esSearch(INDICES_PREV, payoutQuery(TW.prevStart, TW.start, true)).catch(() =>
    esSearch(INDICES_PREV, payoutQuery(TW.prevStart, TW.start, false))
  );
  const q4prev = await esSearch(INDICES_PREV, amazonQuery(TW.prevStart, TW.start));
  const q5prev = await esSearch(
    INDICES_PREV,
    (q5raw.hits?.hits?.length ?? 0) > 0
      ? perfQuery(TW.prevStart, TW.start, "PayoutPosting", "Payout_PerformanceSummary")
      : perfQueryFallback(TW.prevStart, TW.start, "PayoutPosting")
  );
  const q6prev = await esSearch(
    INDICES_PREV,
    (q6raw.hits?.hits?.length ?? 0) > 0
      ? perfQuery(TW.prevStart, TW.start, "AmazonSettlementReport", "Settlement_PerformanceSummary")
      : perfQueryFallback(TW.prevStart, TW.start, "AmazonSettlementReport")
  );

  const lv = levelMap(q1.aggregations);
  const lvPrev = levelMap(q2.aggregations);
  const total = totalHits;
  const totalPrev = q2.hits?.total?.value ?? q2.hits?.total ?? 0;
  const errors = lv.Error ?? 0;
  const errorsPrev = lvPrev.Error ?? 0;
  const fatals = lv.Fatal ?? 0;
  const fatalsPrev = lvPrev.Fatal ?? 0;
  const warnings = lv.Warning ?? 0;
  const warningsPrev = lvPrev.Warning ?? 0;
  const info = lv.Info ?? 0;
  const infoPrev = lvPrev.Info ?? 0;
  const errorRate = total > 0 ? ((errors / total) * 100).toFixed(2) : "0.00";
  const errorRatePrev = totalPrev > 0 ? (errorsPrev / totalPrev) * 100 : 0;

  // Build short URL requests
  const urlItems = [];
  const addUrl = (id, kql, from, to) => urlItems.push({ id, kql, from, to });

  addUrl("total", "*");
  addUrl("errors", 'level.keyword:"Error"');
  addUrl("fatals", 'level.keyword:"Fatal"');
  addUrl("warnings", 'level.keyword:"Warning"');
  addUrl("info", 'level.keyword:"Info"');

  const modules = q1.aggregations?.errors_by_module?.by_module?.buckets ?? [];
  const stores = q1.aggregations?.errors_by_store?.by_store?.buckets ?? [];
  const tags = q1.aggregations?.errors_by_tag?.by_tag?.buckets ?? [];
  const processes = q1.aggregations?.errors_by_process?.by_process?.buckets ?? [];
  const messages = q1.aggregations?.top_messages?.by_message?.buckets ?? [];
  const subs = q1.aggregations?.top_subscribers?.by_sub?.buckets ?? [];
  const fatalMsgs = q1.aggregations?.fatals_by_message?.by_message?.buckets ?? [];
  const fatalStores = q1.aggregations?.fatals_by_store?.by_store?.buckets ?? [];

  const prevModules = Object.fromEntries((q2.aggregations?.errors_by_module?.by_module?.buckets ?? []).map((b) => [b.key, b.doc_count]));
  const prevStores = Object.fromEntries((q2.aggregations?.errors_by_store?.by_store?.buckets ?? []).map((b) => [b.key, b.doc_count]));
  const prevTags = Object.fromEntries((q2.aggregations?.errors_by_tag?.by_tag?.buckets ?? []).map((b) => [b.key, b.doc_count]));
  const prevProcesses = Object.fromEntries((q2.aggregations?.errors_by_process?.by_process?.buckets ?? []).map((b) => [b.key, b.doc_count]));
  const prevMessages = Object.fromEntries((q2.aggregations?.top_messages?.by_message?.buckets ?? []).map((b) => [b.key, b.doc_count]));
  const prevSubs = Object.fromEntries((q2.aggregations?.top_subscribers?.by_sub?.buckets ?? []).map((b) => [String(b.key), b.doc_count]));
  const prevFatalMsgs = Object.fromEntries((q2.aggregations?.fatals_by_message?.by_message?.buckets ?? []).map((b) => [b.key, b.doc_count]));
  const prevFatalStores = Object.fromEntries((q2.aggregations?.fatals_by_store?.by_store?.buckets ?? []).map((b) => [b.key, b.doc_count]));

  for (const b of modules) {
    const k = b.key === "Unknown" ? 'level.keyword:"Error"' : `level.keyword:"Error" AND module.keyword:"${b.key}"`;
    addUrl(`mod_${b.key}`, k);
  }
  for (const b of stores) {
    addUrl(`store_${b.key}`, `level.keyword:"Error" AND store.keyword:"${b.key}"`);
  }
  for (const b of tags) {
    if (b.key !== "Unknown") addUrl(`tag_${b.key}`, `level.keyword:"Error" AND tag.keyword:"${b.key}"`);
  }
  for (const b of processes) {
    if (b.key !== "Unknown") addUrl(`proc_${b.key}`, `level.keyword:"Error" AND process.keyword:"${b.key}"`);
  }
  for (const b of messages) {
    const mk = b.key.replace(/"/g, '\\"');
    addUrl(`msg_${b.key.slice(0, 40)}`, `level.keyword:"Error" AND message.keyword:"${mk}"`);
  }
  for (const b of subs) {
    addUrl(`sub_${b.key}`, `level.keyword:"Error" AND subscriberID:${b.key}`);
  }
  for (const b of fatalMsgs) {
    const mk = b.key.replace(/"/g, '\\"');
    addUrl(`fmsg_${b.key.slice(0, 30)}`, `level.keyword:"Fatal" AND message.keyword:"${mk}"`);
  }
  for (const b of fatalStores) {
    addUrl(`fstore_${b.key}`, `level.keyword:"Fatal" AND store.keyword:"${b.key}"`);
  }

  addUrl("payout_all", 'level.keyword:"Info" AND module.keyword:"PayoutPosting" AND store.keyword:"Shopify"');
  addUrl("amazon_all", 'module.keyword:"AmazonSettlementReport"');
  addUrl("amazon_err", 'level.keyword:"Error" AND module.keyword:"AmazonSettlementReport"');

  const perfPayout = aggregatePerf(q5.hits?.hits ?? []);
  const perfAmazon = aggregatePerf(q6.hits?.hits ?? []);
  const perfPayoutPrev = aggregatePerf(q5prev.hits?.hits ?? []);
  const perfAmazonPrev = aggregatePerf(q6prev.hits?.hits ?? []);

  for (const s of perfPayout.top5) {
    addUrl(`perfP_${s.subscriberID}`, `tag.keyword:"Performance" AND module.keyword:"PayoutPosting" AND subscriberID:${s.subscriberID}`);
  }
  for (const s of perfAmazon.top5) {
    addUrl(`perfA_${s.subscriberID}`, `tag.keyword:"Performance" AND module.keyword:"AmazonSettlementReport" AND subscriberID:${s.subscriberID}`);
  }

  const payoutSubs = q3data.aggregations?.by_subscriber?.buckets ?? [];
  for (const b of payoutSubs) {
    addUrl(`paySub_${b.key}`, `level.keyword:"Info" AND module.keyword:"PayoutPosting" AND subscriberID:${b.key}`);
  }

  const amzSubs = q4.aggregations?.top_subscribers?.buckets ?? [];
  const amzErrs = q4.aggregations?.top_errors?.by_message?.buckets ?? [];
  for (const b of amzSubs) addUrl(`amzSub_${b.key}`, `module.keyword:"AmazonSettlementReport" AND subscriberID:${b.key}`);
  for (const b of amzErrs) {
    const mk = b.key.replace(/"/g, '\\"');
    addUrl(`amzMsg_${b.key.slice(0, 30)}`, `level.keyword:"Error" AND module.keyword:"AmazonSettlementReport" AND message.keyword:"${mk}"`);
  }

  console.log(`Generating ${urlItems.length} short URLs...`);
  const urls = await shortUrlsBatch(urlItems);

  const genAt = new Date().toISOString().replace("T", " ").slice(0, 19);
  const genIST = new Date(Date.now() + 5.5 * 3600000).toISOString().replace("T", " ").slice(0, 19);

  // Hourly chart — map UTC hours to IST display order starting 09
  const hourlyBuckets = q1.aggregations?.errors_hourly?.by_hour?.buckets ?? [];
  const hourCounts = new Array(24).fill(0);
  for (const b of hourlyBuckets) {
    const d = new Date(b.key);
    const istHour = (d.getUTCHours() + 5 + Math.floor((d.getUTCMinutes() + 30) / 60)) % 24;
    const adj = (istHour + 19) % 24; // rotate so index 0 = 09 IST
    const idx = adj;
    hourCounts[idx] = (hourCounts[idx] || 0) + b.doc_count;
  }
  // Rebuild from UTC timestamps properly
  const hourMap = {};
  for (const b of hourlyBuckets) {
    const d = new Date(b.key);
    let istH = d.getUTCHours() + 5;
    let istM = d.getUTCMinutes() + 30;
    if (istM >= 60) {
      istH++;
      istM -= 60;
    }
    if (istH >= 24) istH -= 24;
    hourMap[istH] = b.doc_count;
  }
  const istLabels = [];
  const istCounts = [];
  for (let i = 0; i < 24; i++) {
    const h = (9 + i) % 24;
    istLabels.push(String(h).padStart(2, "0"));
    istCounts.push(hourMap[h] ?? 0);
  }
  const maxHour = Math.max(...istCounts, 1);
  let peakHour = "09";
  let peakCount = 0;
  for (let i = 0; i < 24; i++) {
    if (istCounts[i] > peakCount) {
      peakCount = istCounts[i];
      peakHour = istLabels[i];
    }
  }

  let barsHtml = "";
  for (let i = 0; i < 24; i++) {
    const c = istCounts[i];
    const pct = (c / maxHour) * 100;
    const h = Math.max(pct, 0.1);
    const cls = barColorClass(pct);
    barsHtml += `<div class="bar-col"><div class="bar ${cls}" style="height:${h.toFixed(1)}%" title="${istLabels[i]}:00 IST — ${c} errors"></div><div class="bar-lbl">${istLabels[i]}</div></div>\n`;
  }

  const CSS = await import("fs").then((fs) => {
    const prev = resolve(REPORTS_DIR, "2026-05-20-wd-kibana-daily-report.html");
    try {
      const html = fs.readFileSync(prev, "utf8");
      const m = html.match(/<style>([\s\S]*?)<\/style>/);
      return m ? m[1] : "";
    } catch {
      return "";
    }
  });

  // Module table rows
  let modRows = "";
  for (const b of modules) {
    const pct = errors > 0 ? (b.doc_count / errors) * 100 : 0;
    const chg = pctChange(b.doc_count, prevModules[b.key] ?? 0);
    modRows += `<tr><td>${link(urls[`mod_${b.key}`], b.key)}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${pctBar(pct, pctBarColor(pct))}</td><td>${badge(chg)}</td></tr>\n`;
  }
  if (!modRows) modRows = `<tr><td colspan="4"><em>No module errors found in this period</em></td></tr>`;

  let storeRows = "";
  for (const b of stores) {
    const pct = errors > 0 ? (b.doc_count / errors) * 100 : 0;
    const chg = pctChange(b.doc_count, prevStores[b.key] ?? 0);
    storeRows += `<tr><td>${link(urls[`store_${b.key}`], b.key)}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${pctBar(pct, pctBarColor(pct))}</td><td>${badge(chg)}</td></tr>\n`;
  }
  if (!storeRows) storeRows = `<tr><td colspan="4"><em>No store errors found</em></td></tr>`;

  let tagRows = "";
  for (const b of tags) {
    if (b.key === "Unknown" && b.doc_count === errors) continue;
    const chg = pctChange(b.doc_count, prevTags[b.key] ?? 0);
    const u = urls[`tag_${b.key}`] ?? urls.errors;
    tagRows += `<tr><td>${link(u, b.key)}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${badge(chg)}</td></tr>\n`;
  }
  if (!tagRows) tagRows = `<tr><td colspan="3"><em>No tagged errors found</em></td></tr>`;

  let procRows = "";
  for (const b of processes) {
    if (b.key === "Unknown") continue;
    const chg = pctChange(b.doc_count, prevProcesses[b.key] ?? 0);
    procRows += `<tr><td>${link(urls[`proc_${b.key}`], b.key)}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${badge(chg)}</td></tr>\n`;
  }
  if (!procRows) procRows = `<tr><td colspan="3"><em>No process-tagged errors found</em></td></tr>`;

  let msgRows = "";
  let rank = 1;
  for (const b of messages) {
    const chg = pctChange(b.doc_count, prevMessages[b.key] ?? 0);
    const short = b.key.length > 80 ? b.key.slice(0, 77) + "…" : b.key;
    msgRows += `<tr><td>${rank++}</td><td>${link(urls[`msg_${b.key.slice(0, 40)}`], short)}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${badge(chg)}</td></tr>\n`;
  }
  if (!msgRows) msgRows = `<tr><td colspan="4"><em>No error messages found in this period</em></td></tr>`;

  let subRows = "";
  for (const b of subs) {
    const pct = errors > 0 ? (b.doc_count / errors) * 100 : 0;
    const chg = pctChange(b.doc_count, prevSubs[String(b.key)] ?? 0);
    subRows += `<tr><td>${link(urls[`sub_${b.key}`], String(b.key))}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${pctBar(pct, pctBarColor(pct))}</td><td>${badge(chg)}</td></tr>\n`;
  }
  if (!subRows) subRows = `<tr><td colspan="4"><em>No error subscribers found</em></td></tr>`;

  let fatalMsgRows = "";
  for (const b of fatalMsgs) {
    const chg = pctChange(b.doc_count, prevFatalMsgs[b.key] ?? 0);
    fatalMsgRows += `<tr><td>${link(urls[`fmsg_${b.key.slice(0, 30)}`], b.key.slice(0, 60))}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${badge(chg)}</td></tr>\n`;
  }
  if (!fatalMsgRows) fatalMsgRows = `<tr><td colspan="3"><em>No fatal messages found in this period</em></td></tr>`;

  let fatalStoreRows = "";
  const fatalStoreTotal = fatalStores.reduce((s, b) => s + b.doc_count, 0) || 1;
  let donutParts = [];
  let acc = 0;
  const donutColors = ["#96bf48", "#7f54b3", "#2196F3", "#ff9900", "#ee672d", "#94a3b8", "#10b981", "#ef4444"];
  for (let i = 0; i < fatalStores.length; i++) {
    const b = fatalStores[i];
    const deg = (b.doc_count / fatalStoreTotal) * 360;
    const chg = pctChange(b.doc_count, prevFatalStores[b.key] ?? 0);
    fatalStoreRows += `<tr><td>${link(urls[`fstore_${b.key}`], b.key)}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${badge(chg)}</td></tr>\n`;
    donutParts.push(`${donutColors[i % donutColors.length]} ${acc}deg ${acc + deg}deg`);
    acc += deg;
  }
  if (!fatalStoreRows) {
    fatalStoreRows = `<tr><td colspan="3"><em>No fatal store events found</em></td></tr>`;
    donutParts = ["#e2e8f0 0deg 360deg"];
  }
  const donutCss = donutParts.join(",\n  ");

  // Payout section
  const payoutProcessed = q3data.aggregations?.total_processed?.value ?? 0;
  const payoutProcessedPrev = q3prev.aggregations?.total_processed?.value ?? 0;
  const payoutStats = q3data.aggregations?.payout_time_stats?.value ?? {};
  const payoutHits = q3data.hits?.total?.value ?? 0;

  let payoutSection = "";
  if (payoutHits === 0 && payoutProcessed === 0) {
    payoutSection = `<p style="padding:20px;color:#64748b"><em>No PayoutPosting data found for this period</em></p>`;
  } else {
    const batches = payoutStats.batch_count ?? payoutHits;
    const minT = payoutStats.min_per_payout_seconds ?? 0;
    const maxT = payoutStats.max_per_payout_seconds ?? 0;
    const avgT = payoutStats.avg_per_payout_seconds ?? 0;
    const totalSec = payoutStats.total_seconds ?? 0;
    const chgRec = pctChange(payoutProcessed, payoutProcessedPrev);

    let paySubRows = "";
    for (const b of payoutSubs) {
      const rec = b.processed_sum?.value ?? 0;
      const pctT = payoutProcessed > 0 ? (rec / payoutProcessed) * 100 : 0;
      const prevB = (q3prev.aggregations?.by_subscriber?.buckets ?? []).find((x) => x.key === b.key);
      const prevRec = prevB?.processed_sum?.value ?? 0;
      const chg = pctChange(rec, prevRec);
      paySubRows += `<tr><td>${link(urls[`paySub_${b.key}`], String(b.key))}</td><td class="r">${fmtNum(rec)}</td><td class="r">${b.batch_count?.value ?? "—"}</td><td class="r">${pctT.toFixed(1)}%</td><td>${badge(chg)}</td></tr>\n`;
    }
    if (!paySubRows) paySubRows = `<tr><td colspan="5"><em>No subscriber payout data</em></td></tr>`;

    payoutSection = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px">
      <div class="exec-card info"><div class="label">Records Processed</div><div class="value">${link(urls.payout_all, fmtNum(payoutProcessed))}</div><div class="change">${badge(chgRec)} vs prev ${fmtNum(payoutProcessedPrev)}</div></div>
      <div class="exec-card total"><div class="label">Batches</div><div class="value">${fmtNum(batches)}</div></div>
      <div class="exec-card rate"><div class="label">Min Time/Record</div><div class="value">${fmtDurSec(minT)}</div></div>
      <div class="exec-card warning"><div class="label">Max Time/Record</div><div class="value">${fmtDurSec(maxT)}</div></div>
      <div class="exec-card error"><div class="label">Avg Time/Record</div><div class="value">${fmtDurSec(avgT)}</div></div>
      <div class="exec-card total"><div class="label">Est. Total Time</div><div class="value">${fmtDurSec(totalSec)}</div></div>
      <div class="exec-card healthy"><div class="label">Status</div><div class="value" style="font-size:1rem">Active</div></div>
    </div>
    <div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">Top 5 Subscribers</div>
    <table class="tbl"><thead><tr><th>Subscriber ID</th><th class="r">Records</th><th class="r">Batches</th><th class="r">% Total</th><th>vs Prev</th></tr></thead><tbody>${paySubRows}</tbody></table>`;
  }

  // Amazon section
  const amzTotal = q4.hits?.total?.value ?? 0;
  const amzLv = levelMap(q4.aggregations);
  const amzLvPrev = levelMap(q4prev.aggregations);
  const amzErrors = amzLv.Error ?? 0;
  const amzErrorsPrev = amzLvPrev.Error ?? 0;
  const amzSettled = q4.aggregations?.total_processed?.value || amzLv.Info || 0;
  const amzSettledPrev = q4prev.aggregations?.total_processed?.value || amzLvPrev.Info || 0;
  const amzSubsCount = q4.aggregations?.unique_subs?.value ?? amzSubs.length;

  let amazonSection = "";
  if (amzTotal === 0) {
    amazonSection = `<p style="padding:20px;color:#64748b"><em>No Amazon Settlement activity found for this period</em></p>`;
  } else {
    let amzErrRows = "";
    for (const b of amzErrs) {
      const chg = pctChange(b.doc_count, 0);
      amzErrRows += `<tr><td>${link(urls[`amzMsg_${b.key.slice(0, 30)}`], b.key.slice(0, 70))}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${badge(chg)}</td></tr>\n`;
    }
    if (!amzErrRows) amzErrRows = `<tr><td colspan="3"><em>No Amazon settlement errors</em></td></tr>`;

    let amzSubRows = "";
    for (const b of amzSubs) {
      const errC = b.errors?.doc_count ?? 0;
      const sett = b.processed_sum?.value ?? 0;
      amzSubRows += `<tr><td>${link(urls[`amzSub_${b.key}`], String(b.key))}</td><td class="r">${fmtNum(b.doc_count)}</td><td class="r">${fmtNum(errC)}</td><td class="r">${fmtNum(sett)}</td><td>${badge(pctChange(b.doc_count, 0))}</td></tr>\n`;
    }
    if (!amzSubRows) amzSubRows = `<tr><td colspan="5"><em>No subscriber data</em></td></tr>`;

    amazonSection = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px">
      <div class="exec-card total"><div class="label">Total Events</div><div class="value">${link(urls.amazon_all, fmtNum(amzTotal))}</div></div>
      <div class="exec-card error"><div class="label">Errors</div><div class="value">${link(urls.amazon_err, fmtNum(amzErrors))}</div><div class="change">${badge(pctChange(amzErrors, amzErrorsPrev))}</div></div>
      <div class="exec-card info"><div class="label">Settlements Processed</div><div class="value">${fmtNum(amzSettled)}</div><div class="change">${badge(pctChange(amzSettled, amzSettledPrev))}</div></div>
      <div class="exec-card warning"><div class="label">Affected Subscribers</div><div class="value">${fmtNum(amzSubsCount)}</div></div>
    </div>
    <div style="font-size:.78rem;font-weight:700;color:#475569;margin:8px 0">Top Error Messages</div>
    <table class="tbl"><thead><tr><th>Message</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${amzErrRows}</tbody></table>
    <div style="font-size:.78rem;font-weight:700;color:#475569;margin:16px 0 8px">Top 5 Subscribers</div>
    <table class="tbl"><thead><tr><th>Subscriber ID</th><th class="r">Total</th><th class="r">Errors</th><th class="r">Settlements</th><th>vs Prev</th></tr></thead><tbody>${amzSubRows}</tbody></table>`;
  }

  function renderPerfSection(title, perf, perfPrev, urlPrefix, moduleName, methodLabel) {
    if (perf.runCount === 0) {
      return `<p style="padding:20px;color:#64748b"><em>No ${methodLabel} logs found in this period.</em></p>`;
    }
    const maxT = perf.top5[0]?.totalTime || 1;
    const prevBySub = Object.fromEntries(perfPrev.top5.map((s) => [s.subscriberID, s.totalTime]));

    let rows = "";
    perf.top5.forEach((s, i) => {
      const pct = (s.totalTime / maxT) * 100;
      const barColor = pct > 80 ? "red" : pct > 50 ? "orange" : pct > 25 ? "amber" : "blue";
      const t3 = top3Steps(s.allSteps ?? []);
      const t3html = t3.map((x) => `S${x.num}: ${fmtDurMs(x.ms)}`).join("<br>");
      const prevT = prevBySub[s.subscriberID];
      const chg = prevT != null ? pctChange(s.totalTime, prevT) : { cls: "new", text: "NEW" };
      rows += `<tr>
        <td>${i + 1}</td>
        <td>${link(urls[`${urlPrefix}_${s.subscriberID}`], String(s.subscriberID))}</td>
        <td class="perf-email">${esc(s.email)}</td>
        <td class="r">${s.runCount}</td>
        <td class="r">${fmtNum(s.processedRecords)}</td>
        <td class="r perf-time">${fmtDurMs(s.totalTime)}</td>
        <td><div class="pct-bar-wrap"><span class="pct-text">${pct.toFixed(0)}%</span><div class="pct-bar"><div class="pct-bar-fill ${barColor}" style="width:${pct}%"></div></div></div></td>
        <td class="perf-step-max">${esc(s.maxStep)}<br><span class="perf-step-ms">${fmtDurMs(s.maxStepMs)}</span></td>
        <td class="perf-step-detail">${t3html}</td>
        <td>${badge(chg)}</td>
      </tr>`;
    });

    const maxAvg = Math.max(...perf.stepList.map((s) => s.totalMs / s.count), 1);
    let stepBars = "";
    for (const st of perf.stepList) {
      const avg = st.totalMs / st.count;
      const pct = (avg / maxAvg) * 100;
      const color = pct > 80 ? "red" : pct > 50 ? "orange" : pct > 25 ? "amber" : "blue";
      const shortName = st.name.length > 16 ? st.name.slice(0, 14) + "…" : st.name;
      stepBars += `<div class="step-row"><div class="step-label" title="${esc(st.name)}">S${st.num}: ${esc(shortName)}</div><div class="step-bar-wrap"><div class="step-bar ${color}" style="width:${pct.toFixed(1)}%"></div><span class="step-bar-val">${fmtDurMs(avg)} avg / ${fmtDurMs(st.maxMs)} max (${st.count} runs)</span></div></div>\n`;
    }

    return `
    <p class="subtitle" style="padding:0 20px 8px">${perf.runCount} performance summary runs in period</p>
    <table class="perf-table"><thead><tr><th>#</th><th>Subscriber ID</th><th>Email</th><th>Runs</th><th>Transactions</th><th>Total Time</th><th>% of Max</th><th>Slowest Step</th><th>Top 3 Steps</th><th>vs Prev</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="step-chart"><div class="step-chart-title">Avg Step Processing Time — ${esc(moduleName)} (${perf.runCount} runs)</div>${stepBars}</div>`;
  }

  // Insights
  const insights = [];
  if (errors > errorsPrev * 1.2) insights.push({ type: "spike", title: "Error volume elevated", desc: `Errors at ${fmtNum(errors)} (${badge(pctChange(errors, errorsPrev))}) vs previous ${fmtNum(errorsPrev)}.` });
  if (parseFloat(errorRate) > errorRatePrev * 1.3) insights.push({ type: "warning", title: "Error rate increased", desc: `Error rate ${errorRate}% vs ${errorRatePrev.toFixed(2)}% previous day.` });
  const topMod = modules[0];
  if (topMod) insights.push({ type: "danger", title: `${topMod.key} dominates errors`, desc: `${topMod.key} accounts for ${((topMod.doc_count / errors) * 100).toFixed(1)}% of all errors (${fmtNum(topMod.doc_count)}).` });
  if (peakCount > 500) insights.push({ type: "spike", title: "Peak error hour", desc: `${fmtNum(peakCount)} errors at ${peakHour}:00 IST — investigate scheduler/load patterns.` });
  if (errors < errorsPrev * 0.9) insights.push({ type: "healthy", title: "Errors trending down", desc: `Total errors decreased ${badge(pctChange(errors, errorsPrev))} compared to previous period.` });
  if (fatals < fatalsPrev * 0.8) insights.push({ type: "healthy", title: "Fatals reduced", desc: `Fatal events at ${fmtNum(fatals)} vs ${fmtNum(fatalsPrev)} previous day.` });
  if (insights.length < 4) insights.push({ type: "healthy", title: "Report complete", desc: `All 13 sections generated for ${TW.reportDate}. Review linked Kibana drilldowns for investigation.` });

  let insightHtml = "";
  for (const ins of insights.slice(0, 6)) {
    const icons = { danger: "!", warning: "↑", spike: "⚡", healthy: "✓" };
    insightHtml += `<div class="insight-card ${ins.type}"><div class="icon">${icons[ins.type]}</div><h4>${esc(ins.title)}</h4><p>${ins.desc}</p></div>\n`;
  }

  const periodIST = `${TW.yesterday} 09:00 IST → ${TW.reportDate} 09:00 IST`;
  const compareIST = `${TW.dayBefore} 09:00 IST → ${TW.yesterday} 09:00 IST`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WD Kibana Daily Log Report — ${TW.reportDate}</title>
<style>${CSS}</style>
</head>
<body>
<div class="page">

<div class="rpt-header">
  <h1>WD Kibana Daily Log Report — ${TW.reportDate}</h1>
  <div class="meta">
    <span>📅 Period: ${periodIST}</span>
    <span>📊 Index: ${INDICES.replace(/,/g, " / ")}</span>
    <span>⚖️ Compared to: ${compareIST}</span>
    <span>🕐 Generated: ${genAt} UTC (${genIST} IST)</span>
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>📋 Executive Summary</h2><span class="subtitle">Total docs: ${fmtNum(total)} vs ${fmtNum(totalPrev)} prev day</span></div>
  <div class="card-body">
    <div class="exec-grid">
      <div class="exec-card total"><div class="label">Total Events</div><div class="value">${link(urls.total, fmtNum(total))}</div><div class="change">${badge(pctChange(total, totalPrev))} vs prev ${fmtNum(totalPrev)}</div></div>
      <div class="exec-card error"><div class="label">Errors</div><div class="value">${link(urls.errors, fmtNum(errors))}</div><div class="change">${badge(pctChange(errors, errorsPrev))} vs prev ${fmtNum(errorsPrev)}</div></div>
      <div class="exec-card fatal"><div class="label">Fatals</div><div class="value">${link(urls.fatals, fmtNum(fatals))}</div><div class="change">${badge(pctChange(fatals, fatalsPrev))} vs prev ${fmtNum(fatalsPrev)}</div></div>
      <div class="exec-card warning"><div class="label">Warnings</div><div class="value">${link(urls.warnings, fmtNum(warnings))}</div><div class="change">${badge(pctChange(warnings, warningsPrev))} vs prev ${fmtNum(warningsPrev)}</div></div>
      <div class="exec-card info"><div class="label">Info</div><div class="value">${link(urls.info, fmtNum(info))}</div><div class="change">${badge(pctChange(info, infoPrev))} vs prev ${fmtNum(infoPrev)}</div></div>
      <div class="exec-card rate"><div class="label">Error Rate</div><div class="value">${errorRate}%</div><div class="change">${badge(pctChange(parseFloat(errorRate), errorRatePrev))} vs prev ${errorRatePrev.toFixed(2)}%</div></div>
    </div>
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>⏱ Hourly Error Timeline (IST)</h2><span class="subtitle">Peak: ${fmtNum(peakCount)} errors at ${peakHour}:00 IST</span></div>
  <div class="card-body"><div class="bar-chart">${barsHtml}</div></div>
</div>

<div class="card">
  <div class="card-header"><h2>🔍 Error Breakdown</h2><span class="subtitle">${fmtNum(errors)} total errors</span></div>
  <div class="card-body">
    <div class="grid-2">
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Module</div>
        <table class="tbl"><thead><tr><th>Module</th><th class="r">Count</th><th>% of Errors</th><th>vs Prev</th></tr></thead><tbody>${modRows}</tbody></table></div>
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Store</div>
        <table class="tbl"><thead><tr><th>Store</th><th class="r">Count</th><th>%</th><th>vs Prev</th></tr></thead><tbody>${storeRows}</tbody></table></div>
    </div>
    <div class="section-sep"></div>
    <div class="grid-2" style="margin-top:16px">
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Tag</div>
        <table class="tbl"><thead><tr><th>Tag</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${tagRows}</tbody></table></div>
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Process</div>
        <table class="tbl"><thead><tr><th>Process</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${procRows}</tbody></table></div>
    </div>
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>⚠️ Top Error Messages</h2><span class="subtitle">Top ${messages.length} messages</span></div>
  <div class="card-body"><table class="tbl"><thead><tr><th>#</th><th>Message</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${msgRows}</tbody></table></div>
</div>

<div class="card">
  <div class="card-header"><h2>👤 Top Error Subscribers</h2><span class="subtitle">Top ${subs.length} subscribers by error count</span></div>
  <div class="card-body"><table class="tbl"><thead><tr><th>Subscriber ID</th><th class="r">Errors</th><th>% of Errors</th><th>vs Prev</th></tr></thead><tbody>${subRows}</tbody></table></div>
</div>

<div class="card">
  <div class="card-header"><h2>💀 Fatal Events</h2><span class="subtitle">${fmtNum(fatals)} fatal events</span></div>
  <div class="card-body">
    <div class="grid-2">
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Message</div>
        <table class="tbl"><thead><tr><th>Message</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${fatalMsgRows}</tbody></table></div>
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Store</div>
        <div class="donut-wrap"><div class="donut" style="background:conic-gradient(${donutCss})"></div>
        <table class="tbl"><thead><tr><th>Store</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${fatalStoreRows}</tbody></table></div></div>
    </div>
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>💳 Shopify Payout Performance</h2><span class="subtitle">module=PayoutPosting, store=Shopify</span></div>
  <div class="card-body">${payoutSection}</div>
</div>

<div class="card">
  <div class="card-header"><h2>🛒 Amazon Settlement Report</h2><span class="subtitle">module=AmazonSettlementReport</span></div>
  <div class="card-body">${amazonSection}</div>
</div>

<div class="card">
  <div class="card-header"><h2>🏃 Shopify Payout — Performance Deep-Dive</h2></div>
  <div class="card-body">${renderPerfSection("Shopify Payout", perfPayout, perfPayoutPrev, "perfP", "Shopify Payout", "Payout_PerformanceSummary")}</div>
</div>

<div class="card">
  <div class="card-header"><h2>🏃 Amazon Settlement — Performance Deep-Dive</h2></div>
  <div class="card-body">${renderPerfSection("Amazon Settlement", perfAmazon, perfAmazonPrev, "perfA", "Amazon Settlement", "Settlement_PerformanceSummary")}</div>
</div>

<div class="card">
  <div class="card-header"><h2>💡 Actionable Insights</h2></div>
  <div class="card-body"><div class="insights-grid">${insightHtml}</div></div>
</div>

<div class="card" style="margin-top:8px">
  <div class="card-body" style="font-size:.72rem;color:#94a3b8;text-align:center">
    Source: Kibana WD (<a href="https://kibana-wd.webgility.com" target="_blank">kibana-wd.webgility.com</a>) · Indices: ${INDICES} · Period: ${periodIST} · Generated by WD ES Kibana automation
  </div>
</div>

</div>
</body>
</html>`;

  mkdirSync(REPORTS_DIR, { recursive: true });
  const outPath = join(REPORTS_DIR, `${TW.reportDate}-wd-kibana-daily-report.html`);
  writeFileSync(outPath, html, "utf8");
  const size = Buffer.byteLength(html, "utf8");
  console.log(`Wrote ${outPath} (${(size / 1024).toFixed(1)} KB)`);

  if (size < 30000) {
    console.error(`ERROR: Report size ${size} bytes < 30 KB minimum`);
    process.exit(1);
  }

  // Summary JSON for Slack
  const summary = {
    reportDate: TW.reportDate,
    period: periodIST,
    total,
    errors,
    fatals,
    errorsPrev,
    fatalsPrev,
    totalPrev,
    peakHour,
    peakCount,
    errorRate,
    path: outPath,
    sizeKB: (size / 1024).toFixed(1),
    changes: {
      total: pctChange(total, totalPrev),
      errors: pctChange(errors, errorsPrev),
      fatals: pctChange(fatals, fatalsPrev),
    },
  };
  writeFileSync(join(REPORTS_DIR, "last-run-summary.json"), JSON.stringify(summary, null, 2));
  console.log("SUMMARY:", JSON.stringify(summary));
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
