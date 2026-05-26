#!/usr/bin/env node
/**
 * WD Kibana Daily HTML Report Generator
 * Usage: KIBANA_WD_AUTH=user:pass node generate-wd-html-report.mjs [report-date YYYY-MM-DD]
 */
import { mkdirSync, writeFileSync, readFileSync, unlinkSync, readdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const AUTH = process.env.KIBANA_WD_AUTH;
const KIBANA = "https://kibana-wd.webgility.com";
const INDEX_ID = "61237d60-0ed9-11eb-816a-cde07dc15a1f";
const OUT_DIR = join(ROOT, "reports/wd-kibana-logs");
const TMP_DIR = join(OUT_DIR, ".tmp-report-build");

if (!AUTH) {
  console.error("HALT: KIBANA_WD_AUTH is not set");
  process.exit(1);
}

const B64 = Buffer.from(AUTH).toString("base64");
const HEADERS = {
  Authorization: `Basic ${B64}`,
  "kbn-xsrf": "true",
  "Content-Type": "application/json",
};

function parseReportDate(arg) {
  if (arg) return arg;
  const now = new Date();
  const todayIST9 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 30, 0));
  if (now < todayIST9) todayIST9.setUTCDate(todayIST9.getUTCDate() - 1);
  return todayIST9.toISOString().slice(0, 10);
}

const REPORT_DATE = parseReportDate(process.argv[2]);
const [y, m, d] = REPORT_DATE.split("-").map(Number);
const endUtc = new Date(Date.UTC(y, m - 1, d, 3, 30, 0));
const startUtc = new Date(endUtc);
startUtc.setUTCDate(startUtc.getUTCDate() - 1);
const prevEndUtc = new Date(startUtc);
const prevStartUtc = new Date(startUtc);
prevStartUtc.setUTCDate(prevStartUtc.getUTCDate() - 1);

const TIME = { gte: startUtc.toISOString(), lt: endUtc.toISOString() };
const PREV = { gte: prevStartUtc.toISOString(), lt: prevEndUtc.toISOString() };

function idxForRange(gte, lt) {
  const dates = new Set();
  for (let t = new Date(gte); t < new Date(lt); t.setUTCDate(t.getUTCDate() + 1)) {
    const yy = t.getUTCFullYear();
    const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(t.getUTCDate()).padStart(2, "0");
    dates.add(`webgilitydesktop-${yy}.${mm}.${dd}`);
  }
  const end = new Date(lt);
  end.setUTCMilliseconds(end.getUTCMilliseconds() - 1);
  const yy = end.getUTCFullYear();
  const mm = String(end.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(end.getUTCDate()).padStart(2, "0");
  dates.add(`webgilitydesktop-${yy}.${mm}.${dd}`);
  return [...dates].sort().join(",");
}

const INDICES = idxForRange(TIME.gte, TIME.lt);
const PREV_INDICES = idxForRange(PREV.gte, PREV.lt);

async function esSearch(indices, body) {
  const path = encodeURIComponent(`${indices}/_search`);
  const url = `${KIBANA}/api/console/proxy?path=${path}&method=POST`;
  const resp = await fetch(url, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ES ${resp.status}: ${text.slice(0, 500)}`);
  }
  return resp.json();
}

const urlCache = new Map();
async function shortenUrl(kql) {
  if (urlCache.has(kql)) return urlCache.get(kql);
  const discoverPath = `/app/kibana#/discover?_g=(refreshInterval:(pause:!t,value:0),time:(from:'${TIME.gte}',to:'${TIME.lt}'))&_a=(columns:!(timestamp,level,message,store,module,subscriberID),index:'${INDEX_ID}',interval:auto,query:(language:kuery,query:'${kql.replace(/'/g, "\\'")}'),sort:!(!(timestamp,desc)))`;
  try {
    const resp = await fetch(`${KIBANA}/api/shorten_url`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ url: discoverPath }),
      signal: AbortSignal.timeout(15_000),
    });
    if (resp.ok) {
      const j = await resp.json();
      const link = `${KIBANA}/goto/${j.urlId}`;
      urlCache.set(kql, link);
      return link;
    }
  } catch {}
  const fallback = KIBANA;
  urlCache.set(kql, fallback);
  return fallback;
}

async function shortenAll(entries, concurrency = 12) {
  const results = {};
  const queue = [...entries];
  async function worker() {
    while (queue.length) {
      const [key, kql] = queue.shift();
      results[key] = await shortenUrl(kql);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

function totalHits(res) {
  const t = res.hits?.total;
  return typeof t === "object" ? t.value : t ?? 0;
}

function levelMap(aggs) {
  const m = {};
  for (const b of aggs?.by_level?.buckets ?? []) m[b.key] = b.doc_count;
  return m;
}

function pctChange(cur, prev) {
  if (prev == null || prev === undefined) return { cls: "new", text: "NEW" };
  if (prev === 0 && cur === 0) return { cls: "flat", text: "≈" };
  if (prev === 0) return { cls: "new", text: "NEW" };
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) <= 10) return { cls: "flat", text: "≈" };
  const arrow = pct > 0 ? "↑" : "↓";
  const cls = pct > 0 ? "up" : "down";
  return { cls, text: `${arrow}${Math.abs(pct).toFixed(1)}%` };
}

function fmtNum(n) {
  return (n ?? 0).toLocaleString("en-US");
}

function fmtMs(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
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

function fmtDurSec(sec) {
  if (sec < 60) return `${sec.toFixed(1)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
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

function stepBarColor(pct) {
  if (pct > 80) return "red";
  if (pct > 50) return "orange";
  if (pct > 25) return "amber";
  return "blue";
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mainAggQuery(range) {
  return {
    size: 0,
    track_total_hits: true,
    query: { bool: { must: [{ range: { timestamp: range } }] } },
    aggs: {
      by_level: { terms: { field: "level.keyword", size: 10 } },
      hourly_errors: {
        filter: { term: { "level.keyword": "Error" } },
        aggs: {
          by_hour: {
            date_histogram: {
              field: "timestamp",
              fixed_interval: "1h",
              time_zone: "Asia/Kolkata",
              min_doc_count: 0,
            },
          },
        },
      },
      errors_by_module: {
        filter: { term: { "level.keyword": "Error" } },
        aggs: { items: { terms: { field: "module.keyword", size: 30, missing: "Unknown" } } },
      },
      errors_by_store: {
        filter: { term: { "level.keyword": "Error" } },
        aggs: { items: { terms: { field: "store.keyword", size: 25, missing: "Unknown" } } },
      },
      errors_by_tag: {
        filter: { term: { "level.keyword": "Error" } },
        aggs: { items: { terms: { field: "tag.keyword", size: 20, missing: "Unknown" } } },
      },
      errors_by_process: {
        filter: { term: { "level.keyword": "Error" } },
        aggs: { items: { terms: { field: "process.keyword", size: 10, missing: "Unknown" } } },
      },
      top_messages: {
        filter: { term: { "level.keyword": "Error" } },
        aggs: { items: { terms: { field: "message.keyword", size: 15 } } },
      },
      top_subscribers: {
        filter: { term: { "level.keyword": "Error" } },
        aggs: { items: { terms: { field: "subscriberID", size: 10 } } },
      },
      fatals_by_message: {
        filter: { term: { "level.keyword": "Fatal" } },
        aggs: { items: { terms: { field: "message.keyword", size: 15 } } },
      },
      fatals_by_store: {
        filter: { term: { "level.keyword": "Fatal" } },
        aggs: { items: { terms: { field: "store.keyword", size: 12, missing: "Unknown" } } },
      },
    },
  };
}

async function queryPayout(range) {
  let body = {
    query: {
      bool: {
        must: [
          { range: { timestamp: range } },
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
          combine_script: "return ['total_time': state.total_time, 'per_record_times': state.per_record_times]",
          reduce_script:
            "double total = 0; double min_t = Double.MAX_VALUE; double max_t = 0; double sum_t = 0; int count = 0; for (s in states) { total += s.total_time; for (t in s.per_record_times) { if (t < min_t) min_t = t; if (t > max_t) max_t = t; sum_t += t; count++; } } return ['total_seconds': total, 'min_per_payout_seconds': min_t == Double.MAX_VALUE ? 0 : min_t, 'max_per_payout_seconds': max_t, 'avg_per_payout_seconds': count > 0 ? sum_t / count : 0, 'batch_count': count]",
        },
      },
    },
  };
  let res = await esSearch(INDICES, body);
  if (totalHits(res) === 0) {
    body = {
      query: {
        bool: {
          must: [
            { range: { timestamp: range } },
            { term: { "store.keyword": "Shopify" } },
            { term: { "module.keyword": "PayoutPosting" } },
            { exists: { field: "processedRecords" } },
          ],
        },
      },
      size: 0,
      aggs: body.aggs,
    };
    delete body.aggs.payout_time_stats;
    res = await esSearch(INDICES, body);
  }
  return res;
}

async function queryAmazon(range) {
  return esSearch(INDICES, {
    query: {
      bool: {
        must: [{ range: { timestamp: range } }, { term: { "module.keyword": "AmazonSettlementReport" } }],
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
    },
  });
}

async function queryPerf(module, methodType, range) {
  let body = {
    query: {
      bool: {
        must: [
          { range: { timestamp: range } },
          { term: { "module.keyword": module } },
          { term: { "methodType.keyword": methodType } },
        ],
      },
    },
    size: 200,
    sort: [{ timestamp: "desc" }],
    _source: ["timestamp", "subscriberID", "profileId", "email", "detail", "message", "processedRecords", "baseUrl", "process", "methodType", "tag"],
  };
  let res = await esSearch(INDICES, body);
  if (totalHits(res) === 0) {
    body.query.bool.must = [
      { range: { timestamp: range } },
      { term: { "module.keyword": module } },
      { term: { "tag.keyword": "Performance" } },
    ];
    res = await esSearch(INDICES, body);
  }
  return res;
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
  for (const line of detail.split(/\r?\n/)) {
    const sm = line.match(/^Step\s+(\d+):\s+(.+?):\s+(\d+)\s+ms(?:\s+\|\s+Records:\s+(\d+))?/);
    if (sm) {
      steps.push({
        num: parseInt(sm[1], 10),
        name: sm[2].trim(),
        ms: parseInt(sm[3], 10),
        records: sm[4] ? parseInt(sm[4], 10) : 0,
      });
    }
  }
  steps.sort((a, b) => a.num - b.num);
  let maxStep = { name: "—", ms: 0 };
  for (const s of steps) {
    if (s.ms > maxStep.ms) maxStep = { name: s.name, ms: s.ms };
  }
  return {
    subscriberID: src.subscriberID,
    email: src.email || "",
    profileId: src.profileId,
    processedRecords: src.processedRecords || 0,
    process: src.process || "",
    timestamp: src.timestamp,
    totalTime,
    maxStep,
    steps,
  };
}

function aggregatePerf(hits) {
  const docs = hits.map((h) => parsePerfDoc(h._source)).filter((d) => d.totalTime > 0 || d.steps.length);
  const stepStats = new Map();
  for (const doc of docs) {
    for (const s of doc.steps) {
      if (!stepStats.has(s.name)) stepStats.set(s.name, { num: s.num, count: 0, totalMs: 0, maxMs: 0, minMs: Infinity });
      const st = stepStats.get(s.name);
      st.count++;
      st.totalMs += s.ms;
      st.maxMs = Math.max(st.maxMs, s.ms);
      st.minMs = Math.min(st.minMs, s.ms);
    }
  }
  const stepList = [...stepStats.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => a.num - b.num);

  const bySub = new Map();
  for (const doc of docs) {
    const id = doc.subscriberID;
    if (!bySub.has(id)) {
      bySub.set(id, { subscriberID: id, email: doc.email, totalTime: 0, runCount: 0, processedRecords: 0, maxStep: { name: "—", ms: 0 }, allSteps: [] });
    }
    const s = bySub.get(id);
    s.totalTime += doc.totalTime;
    s.runCount++;
    s.processedRecords += doc.processedRecords;
    if (doc.maxStep.ms > s.maxStep.ms) s.maxStep = doc.maxStep;
    s.allSteps.push(...doc.steps);
    if (!s.email && doc.email) s.email = doc.email;
  }

  const top5 = [...bySub.values()]
    .sort((a, b) => b.totalTime - a.totalTime)
    .slice(0, 5)
    .map((s) => {
      const stepTotals = new Map();
      for (const st of s.allSteps) {
        stepTotals.set(st.num, (stepTotals.get(st.num) || 0) + st.ms);
      }
      const top3 = [...stepTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([num, ms]) => `S${num}: ${fmtMs(ms)}`);
      return { ...s, top3Steps: top3 };
    });

  const maxSubTime = top5[0]?.totalTime || 1;
  return { docs, stepList, top5, maxSubTime, runCount: docs.length };
}

function istLabel(d) {
  return d.toISOString().slice(0, 10);
}

const yStart = startUtc.toISOString().slice(0, 10);
const yEnd = REPORT_DATE;
const prevStartLabel = prevStartUtc.toISOString().slice(0, 10);
const prevEndLabel = yStart;

console.log("Report date:", REPORT_DATE);
console.log("Window:", TIME.gte, "→", TIME.lt);
console.log("Indices:", INDICES);

// Connectivity test
const status = await fetch(`${KIBANA}/api/status`, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
if (!status.ok) {
  console.error("HALT: Kibana unreachable", status.status);
  process.exit(1);
}

console.log("Running queries...");
const [main, prev, payout, payoutPrev, amazon, amazonPrev, perfPayout, perfAmazon, perfPayoutPrev, perfAmazonPrev] =
  await Promise.all([
    esSearch(INDICES, mainAggQuery(TIME)),
    esSearch(PREV_INDICES, mainAggQuery(PREV)),
    queryPayout(TIME),
    queryPayout(PREV),
    queryAmazon(TIME),
    queryAmazon(PREV),
    queryPerf("PayoutPosting", "Payout_PerformanceSummary", TIME),
    queryPerf("AmazonSettlementReport", "Settlement_PerformanceSummary", TIME),
    queryPerf("PayoutPosting", "Payout_PerformanceSummary", PREV),
    queryPerf("AmazonSettlementReport", "Settlement_PerformanceSummary", PREV),
  ]);

const mainLevels = levelMap(main.aggregations);
const prevLevels = levelMap(prev.aggregations);
const total = totalHits(main);
const prevTotal = totalHits(prev);
const errors = mainLevels.Error ?? 0;
const prevErrors = prevLevels.Error ?? 0;
const fatals = mainLevels.Fatal ?? 0;
const prevFatals = prevLevels.Fatal ?? 0;
const warnings = mainLevels.Warning ?? 0;
const prevWarnings = prevLevels.Warning ?? 0;
const info = mainLevels.Info ?? 0;
const prevInfo = prevLevels.Info ?? 0;
const errorRate = total ? ((errors / total) * 100).toFixed(2) : "0.00";
const prevErrorRate = prevTotal ? ((prevErrors / prevTotal) * 100).toFixed(2) : "0.00";

// Build URL map
const urlEntries = [];
const addUrl = (key, kql) => urlEntries.push([key, kql]);

addUrl("total", "");
addUrl("errors", 'level.keyword:"Error"');
addUrl("fatals", 'level.keyword:"Fatal"');
addUrl("warnings", 'level.keyword:"Warning"');
addUrl("info", 'level.keyword:"Info"');

for (const b of main.aggregations.errors_by_module.items.buckets) {
  addUrl(`mod:${b.key}`, `level.keyword:"Error" AND module.keyword:"${b.key}"`);
}
for (const b of main.aggregations.errors_by_store.items.buckets) {
  addUrl(`store:${b.key}`, `level.keyword:"Error" AND store.keyword:"${b.key}"`);
}
for (const b of main.aggregations.errors_by_tag.items.buckets) {
  addUrl(`tag:${b.key}`, `level.keyword:"Error" AND tag.keyword:"${b.key}"`);
}
for (const b of main.aggregations.errors_by_process.items.buckets) {
  addUrl(`proc:${b.key}`, `level.keyword:"Error" AND process.keyword:"${b.key}"`);
}
for (const b of main.aggregations.top_messages.items.buckets) {
  const k = b.key.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  addUrl(`msg:${b.key}`, `level.keyword:"Error" AND message.keyword:"${k}"`);
}
for (const b of main.aggregations.top_subscribers.items.buckets) {
  addUrl(`sub:${b.key}`, `level.keyword:"Error" AND subscriberID:${b.key}`);
}
for (const b of main.aggregations.fatals_by_message.items.buckets) {
  const k = b.key.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  addUrl(`fmsg:${b.key}`, `level.keyword:"Fatal" AND message.keyword:"${k}"`);
}
for (const b of main.aggregations.fatals_by_store.items.buckets) {
  addUrl(`fstore:${b.key}`, `level.keyword:"Fatal" AND store.keyword:"${b.key}"`);
}

addUrl("payout_all", 'module.keyword:"PayoutPosting" AND store.keyword:"Shopify"');
addUrl("amazon_all", 'module.keyword:"AmazonSettlementReport"');
addUrl("amazon_err", 'level.keyword:"Error" AND module.keyword:"AmazonSettlementReport"');

const payoutSubs = payout.aggregations?.by_subscriber?.buckets ?? [];
for (const b of payoutSubs) {
  addUrl(`psub:${b.key}`, `level.keyword:"Info" AND module.keyword:"PayoutPosting" AND subscriberID:${b.key}`);
}

const amzErrs = amazon.aggregations?.top_errors?.by_message?.buckets ?? [];
for (const b of amzErrs) {
  const k = b.key.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  addUrl(`amsg:${b.key}`, `level.keyword:"Error" AND module.keyword:"AmazonSettlementReport" AND message.keyword:"${k}"`);
}
const amzSubs = amazon.aggregations?.top_subscribers?.buckets ?? [];
for (const b of amzSubs) {
  addUrl(`asub:${b.key}`, `module.keyword:"AmazonSettlementReport" AND subscriberID:${b.key}`);
}

const perfP = aggregatePerf(perfPayout.hits?.hits ?? []);
const perfA = aggregatePerf(perfAmazon.hits?.hits ?? []);
const perfPPrev = aggregatePerf(perfPayoutPrev.hits?.hits ?? []);
const perfAPrev = aggregatePerf(perfAmazonPrev.hits?.hits ?? []);

for (const s of perfP.top5) {
  addUrl(`pperf:${s.subscriberID}`, `tag.keyword:"Performance" AND module.keyword:"PayoutPosting" AND subscriberID:${s.subscriberID}`);
}
for (const s of perfA.top5) {
  addUrl(`aperf:${s.subscriberID}`, `tag.keyword:"Performance" AND module.keyword:"AmazonSettlementReport" AND subscriberID:${s.subscriberID}`);
}

console.log(`Generating ${urlEntries.length} short URLs...`);
const urls = await shortenAll(urlEntries);

function link(key, text) {
  const u = urls[key] || KIBANA;
  return `<a href="${esc(u)}" target="_blank">${esc(text)}</a>`;
}

function badge(cur, prev) {
  const b = pctChange(cur, prev);
  return `<span class="cb ${b.cls}">${b.text}</span>`;
}

function prevBucketMap(aggs, path) {
  const m = new Map();
  let buckets = aggs;
  for (const p of path) buckets = buckets?.[p];
  for (const b of buckets?.buckets ?? []) m.set(String(b.key), b.doc_count);
  return m;
}

const prevMod = prevBucketMap(prev.aggregations, ["errors_by_module", "items"]);
const prevStore = prevBucketMap(prev.aggregations, ["errors_by_store", "items"]);
const prevTag = prevBucketMap(prev.aggregations, ["errors_by_tag", "items"]);
const prevProc = prevBucketMap(prev.aggregations, ["errors_by_process", "items"]);
const prevMsg = prevBucketMap(prev.aggregations, ["top_messages", "items"]);
const prevSub = prevBucketMap(prev.aggregations, ["top_subscribers", "items"]);
const prevFmsg = prevBucketMap(prev.aggregations, ["fatals_by_message", "items"]);
const prevFstore = prevBucketMap(prev.aggregations, ["fatals_by_store", "items"]);

// Hourly chart - map IST hours 9..8
const hourBuckets = main.aggregations.hourly_errors.by_hour.buckets;
const hourMap = new Map();
for (const b of hourBuckets) {
  const h = new Date(b.key_as_string || b.key).getUTCHours();
  // key is in IST due to time_zone
  const istDate = new Date(b.key);
  const istH = parseInt(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(
      new Date(b.key)
    ),
    10
  );
  hourMap.set(istH, (hourMap.get(istH) || 0) + b.doc_count);
}
const hourOrder = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7, 8];
const hourCounts = hourOrder.map((h) => hourMap.get(h) || 0);
const maxHour = Math.max(...hourCounts, 1);
let peakHour = 0;
let peakCount = 0;
hourOrder.forEach((h, i) => {
  if (hourCounts[i] > peakCount) {
    peakCount = hourCounts[i];
    peakHour = h;
  }
});

const hourlyBars = hourOrder
  .map((h, i) => {
    const c = hourCounts[i];
    const pct = Math.max((c / maxHour) * 100, 0.1);
    const cls = barColorClass((c / maxHour) * 100);
    const lbl = String(h).padStart(2, "0");
    return `<div class="bar-col"><div class="bar ${cls}" style="height:${pct.toFixed(1)}%" title="${lbl}:00 IST — ${c} errors"></div><div class="bar-lbl">${lbl === "00" ? "00" : h}</div></div>`;
  })
  .join("\n");

function tblRows(buckets, prevMap, keyPrefix, showPct = false, totalErr = errors) {
  return buckets
    .map((b) => {
      const pct = showPct ? ((b.doc_count / totalErr) * 100).toFixed(1) : null;
      const pctHtml = showPct
        ? `<div class="pct-bar-wrap"><span class="pct-text">${pct}%</span><div class="pct-bar"><div class="pct-bar-fill ${pctBarColor(parseFloat(pct))}" style="width:${pct}%"></div></div></div>`
        : "";
      return `<tr><td>${link(`${keyPrefix}:${b.key}`, b.key)}</td><td class="r">${fmtNum(b.doc_count)}</td>${showPct ? `<td>${pctHtml}</td>` : ""}<td>${badge(b.doc_count, prevMap.get(String(b.key)))}</td></tr>`;
    })
    .join("\n");
}

// Fatal donut
const fatalStores = main.aggregations.fatals_by_store.items.buckets;
const fatalTotal = fatalStores.reduce((s, b) => s + b.doc_count, 0) || 1;
const colors = ["#96bf48", "#7f54b3", "#2196F3", "#ff9900", "#ee672d", "#94a3b8", "#10b981", "#ef4444"];
let deg = 0;
const stops = fatalStores.map((b, i) => {
  const slice = (b.doc_count / fatalTotal) * 360;
  const start = deg;
  deg += slice;
  return `${colors[i % colors.length]} ${start}deg ${deg}deg`;
});
const donutGradient = stops.length ? stops.join(",\n  ") : "#94a3b8 0deg 360deg";

// Payout section
const payoutProcessed = payout.aggregations?.total_processed?.value ?? 0;
const payoutPrevProcessed = payoutPrev.aggregations?.total_processed?.value ?? 0;
const payoutStats = payout.aggregations?.payout_time_stats?.value ?? {};
const payoutBatches = payoutSubs.reduce((s, b) => s + (b.batch_count?.value ?? 0), 0);

// Amazon
const amzTotal = totalHits(amazon);
const amzPrevTotal = totalHits(amazonPrev);
const amzLevels = levelMap(amazon.aggregations);
const amzPrevLevels = levelMap(amazonPrev.aggregations);
const amzErrors = amzLevels.Error ?? 0;
const amzPrevErrors = amzPrevLevels.Error ?? 0;
const amzProcessed = amazon.aggregations?.total_processed?.value ?? amzLevels.Info ?? 0;
const amzPrevProcessed = amazonPrev.aggregations?.total_processed?.value ?? amzPrevLevels.Info ?? 0;

function perfSectionHtml(title, perf, perfPrev, urlPrefix, placeholder) {
  if (perf.runCount === 0) {
    return `<div class="card"><div class="card-header"><h2>${title}</h2><span class="subtitle">0 runs in period</span></div><div class="card-body"><p style="color:#64748b;font-style:italic">${placeholder}</p></div></div>`;
  }
  const prevMap = new Map(perfPrev.top5.map((s) => [s.subscriberID, s.totalTime]));
  const rows = perf.top5
    .map((s, i) => {
      const pct = ((s.totalTime / perf.maxSubTime) * 100).toFixed(1);
      const barCls = stepBarColor(parseFloat(pct));
      const prevT = prevMap.get(s.subscriberID);
      const top3 = s.top3Steps.map((x) => esc(x)).join("<br>");
      return `<tr>
      <td>${i + 1}</td>
      <td>${link(`${urlPrefix}:${s.subscriberID}`, s.subscriberID)}</td>
      <td class="perf-email">${esc(s.email)}</td>
      <td class="r">${s.runCount}</td>
      <td class="r">${fmtNum(s.processedRecords)}</td>
      <td class="r perf-time">${fmtMs(s.totalTime)}</td>
      <td><div class="pct-bar-wrap"><span class="pct-text">${pct}%</span><div class="pct-bar"><div class="pct-bar-fill ${barCls}" style="width:${pct}%"></div></div></div></td>
      <td class="perf-step-max">${esc(s.maxStep.name)}<br><span class="perf-step-ms">${fmtMs(s.maxStep.ms)}</span></td>
      <td class="perf-step-detail">${top3}</td>
      <td>${badge(s.totalTime, prevT)}</td>
    </tr>`;
    })
    .join("\n");

  const maxAvg = Math.max(...perf.stepList.map((s) => s.totalMs / s.count), 1);
  const stepBars = perf.stepList
    .map((s) => {
      const avg = s.totalMs / s.count;
      const pct = (avg / maxAvg) * 100;
      const short = s.name.length > 18 ? s.name.slice(0, 18) + "…" : s.name;
      return `<div class="step-row"><div class="step-label" title="${esc(s.name)}">S${s.num}: ${esc(short)}</div><div class="step-bar-wrap"><div class="step-bar ${stepBarColor(pct)}" style="width:${pct.toFixed(1)}%"></div><span class="step-bar-val">${fmtMs(avg)} avg &nbsp;/&nbsp; ${fmtMs(s.maxMs)} max &nbsp;(${s.count} runs)</span></div></div>`;
    })
    .join("\n");

  return `<div class="card">
  <div class="card-header"><h2>${title}</h2><span class="subtitle">${perf.runCount} performance summary runs</span></div>
  <div class="card-body">
    <div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">Top 5 Clients by Total Processing Time</div>
    <table class="perf-table"><thead><tr><th>#</th><th>Subscriber ID</th><th>Email</th><th>Runs</th><th>Transactions</th><th>Total Time</th><th>% of Max</th><th>Slowest Step</th><th>Top 3 Steps by Time</th><th>vs Prev</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="step-chart"><div class="step-chart-title">Avg Step Processing Time (${perf.runCount} total runs)</div>${stepBars}</div>
  </div></div>`;
}

// Insights
const insights = [];
if (errors > prevErrors * 1.1) insights.push({ type: "spike", title: "Error volume elevated", desc: `Errors at ${fmtNum(errors)} (${badge(errors, prevErrors).replace(/<[^>]+>/g, "")}) vs previous period.` });
if (parseFloat(errorRate) > parseFloat(prevErrorRate) * 1.2) insights.push({ type: "warning", title: "Error rate increased", desc: `Error rate ${errorRate}% vs ${prevErrorRate}% previous day.` });
const topMod = main.aggregations.errors_by_module.items.buckets[0];
if (topMod && topMod.doc_count / errors > 0.5) insights.push({ type: "danger", title: `${topMod.key} dominates errors`, desc: `${((topMod.doc_count / errors) * 100).toFixed(1)}% of all errors from module ${topMod.key}.` });
if (errors < prevErrors * 0.9) insights.push({ type: "healthy", title: "Error count improved", desc: `Total errors down vs previous period (${fmtNum(errors)} vs ${fmtNum(prevErrors)}).` });
if (peakCount > maxHour * 0.5) insights.push({ type: "spike", title: `Peak at ${String(peakHour).padStart(2, "0")}:00 IST`, desc: `${fmtNum(peakCount)} errors in peak hour — review scheduler load.` });
if (insights.length < 2) insights.push({ type: "healthy", title: "Systems operational", desc: "No critical anomalies beyond normal daily variance." });

const insightHtml = insights
  .map((i) => {
    const icons = { danger: "!", warning: "↑", spike: "⚡", healthy: "✓" };
    return `<div class="insight-card ${i.type}"><div class="icon">${icons[i.type]}</div><h4>${esc(i.title)}</h4><p>${esc(i.desc)}</p></div>`;
  })
  .join("\n");

const generated = new Date().toISOString().replace("T", " ").slice(0, 19);

const css = readFileSync(join(ROOT, "reports/wd-kibana-logs/2026-05-20-wd-kibana-daily-report.html"), "utf8").match(
  /<style>([\s\S]*?)<\/style>/
)?.[1];

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WD Kibana Daily Log Report — ${REPORT_DATE}</title>
<style>
${css}
</style>
</head>
<body>
<div class="page">

<div class="rpt-header">
  <h1>WD Kibana Daily Log Report — ${REPORT_DATE}</h1>
  <div class="meta">
    <span>📅 Period: ${yStart} 09:00 IST → ${yEnd} 09:00 IST</span>
    <span>📊 Index: ${INDICES.replace(/,/g, " / ")}</span>
    <span>⚖️ Compared to: ${prevStartLabel} 09:00 IST → ${prevEndLabel} 09:00 IST</span>
    <span>🕐 Generated: ${generated} UTC</span>
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>📋 Executive Summary</h2><span class="subtitle">Total docs: ${fmtNum(total)} vs ${fmtNum(prevTotal)} prev day</span></div>
  <div class="card-body">
    <div class="exec-grid">
      <div class="exec-card total"><div class="label">Total Events</div><div class="value">${link("total", fmtNum(total))}</div><div class="change">${badge(total, prevTotal)} vs prev ${fmtNum(prevTotal)}</div></div>
      <div class="exec-card error"><div class="label">Errors</div><div class="value">${link("errors", fmtNum(errors))}</div><div class="change">${badge(errors, prevErrors)} vs prev ${fmtNum(prevErrors)}</div></div>
      <div class="exec-card fatal"><div class="label">Fatals</div><div class="value">${link("fatals", fmtNum(fatals))}</div><div class="change">${badge(fatals, prevFatals)} vs prev ${fmtNum(prevFatals)}</div></div>
      <div class="exec-card warning"><div class="label">Warnings</div><div class="value">${link("warnings", fmtNum(warnings))}</div><div class="change">${badge(warnings, prevWarnings)} vs prev ${fmtNum(prevWarnings)}</div></div>
      <div class="exec-card info"><div class="label">Info</div><div class="value">${link("info", fmtNum(info))}</div><div class="change">${badge(info, prevInfo)} vs prev ${fmtNum(prevInfo)}</div></div>
      <div class="exec-card rate"><div class="label">Error Rate</div><div class="value">${errorRate}%</div><div class="change">${badge(parseFloat(errorRate), parseFloat(prevErrorRate))} vs prev ${prevErrorRate}%</div></div>
    </div>
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>⏱ Hourly Error Timeline (IST)</h2><span class="subtitle">Peak: ${fmtNum(peakCount)} errors at ${String(peakHour).padStart(2, "0")}:00 IST</span></div>
  <div class="card-body">
    <div class="bar-chart">${hourlyBars}</div>
    <div style="font-size:.68rem;color:#94a3b8;margin-top:8px;display:flex;gap:16px;flex-wrap:wrap">
      <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;background:#cbd5e1;border-radius:2px;display:inline-block"></span>&lt;10% of peak</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;background:#fbbf24;border-radius:2px;display:inline-block"></span>10-25%</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;background:#f97316;border-radius:2px;display:inline-block"></span>25-60%</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;background:#ef4444;border-radius:2px;display:inline-block"></span>&gt;60% (peak)</span>
    </div>
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>🔍 Error Breakdown</h2><span class="subtitle">${fmtNum(errors)} total errors</span></div>
  <div class="card-body">
    <div class="grid-2">
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Module</div>
        <table class="tbl"><thead><tr><th>Module</th><th class="r">Count</th><th>% of Errors</th><th>vs Prev</th></tr></thead><tbody>${tblRows(main.aggregations.errors_by_module.items.buckets, prevMod, "mod", true)}</tbody></table></div>
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Store</div>
        <table class="tbl"><thead><tr><th>Store</th><th class="r">Count</th><th>% of Errors</th><th>vs Prev</th></tr></thead><tbody>${tblRows(main.aggregations.errors_by_store.items.buckets, prevStore, "store", true)}</tbody></table></div>
    </div>
    <div class="section-sep"></div>
    <div class="grid-2" style="margin-top:16px">
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Tag</div>
        <table class="tbl"><thead><tr><th>Tag</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${tblRows(main.aggregations.errors_by_tag.items.buckets, prevTag, "tag")}</tbody></table></div>
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Process</div>
        <table class="tbl"><thead><tr><th>Process</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${tblRows(main.aggregations.errors_by_process.items.buckets, prevProc, "proc")}</tbody></table></div>
    </div>
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>⚠️ Top Error Messages</h2><span class="subtitle">Top 15 by frequency</span></div>
  <div class="card-body">
    <table class="tbl"><thead><tr><th>#</th><th>Message</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>
    ${main.aggregations.top_messages.items.buckets.map((b, i) => `<tr><td>${i + 1}</td><td>${link(`msg:${b.key}`, b.key)}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${badge(b.doc_count, prevMsg.get(String(b.key)))}</td></tr>`).join("\n")}
    </tbody></table>
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>👥 Top Error Subscribers</h2><span class="subtitle">Top 10 by error count</span></div>
  <div class="card-body">
    <table class="tbl"><thead><tr><th>#</th><th>Subscriber ID</th><th class="r">Error Count</th><th>% of Errors</th><th>vs Prev</th></tr></thead><tbody>
    ${main.aggregations.top_subscribers.items.buckets.map((b, i) => {
      const pct = ((b.doc_count / errors) * 100).toFixed(1);
      return `<tr><td>${i + 1}</td><td>${link(`sub:${b.key}`, b.key)}</td><td class="r">${fmtNum(b.doc_count)}</td><td><div class="pct-bar-wrap"><span class="pct-text">${pct}%</span><div class="pct-bar"><div class="pct-bar-fill ${pctBarColor(parseFloat(pct))}" style="width:${pct}%"></div></div></div></td><td>${badge(b.doc_count, prevSub.get(String(b.key)))}</td></tr>`;
    }).join("\n")}
    </tbody></table>
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>💀 Fatal Events</h2><span class="subtitle">${fmtNum(fatals)} fatal events</span></div>
  <div class="card-body">
    <div class="grid-2">
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Message</div>
        <table class="tbl"><thead><tr><th>Message</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${tblRows(main.aggregations.fatals_by_message.items.buckets, prevFmsg, "fmsg")}</tbody></table></div>
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Store</div>
        <div class="donut-wrap"><div class="donut" style="background:conic-gradient(${donutGradient})"></div>
        <table class="tbl"><thead><tr><th>Store</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${tblRows(fatalStores, prevFstore, "fstore")}</tbody></table></div></div>
    </div>
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>💳 Shopify Payout Performance</h2><span class="subtitle">module=PayoutPosting, store=Shopify</span></div>
  <div class="card-body">
    ${payoutProcessed > 0 ? `
    <div class="exec-grid" style="margin-bottom:16px">
      <div class="exec-card info"><div class="label">Records Processed</div><div class="value">${link("payout_all", fmtNum(Math.round(payoutProcessed)))}</div><div class="change">${badge(Math.round(payoutProcessed), Math.round(payoutPrevProcessed))}</div></div>
      <div class="exec-card total"><div class="label">Batches</div><div class="value">${fmtNum(payoutBatches)}</div></div>
      <div class="exec-card warning"><div class="label">Min Time/Record</div><div class="value">${fmtDurSec(payoutStats.min_per_payout_seconds || 0)}</div></div>
      <div class="exec-card error"><div class="label">Max Time/Record</div><div class="value">${fmtDurSec(payoutStats.max_per_payout_seconds || 0)}</div></div>
      <div class="exec-card rate"><div class="label">Avg Time/Record</div><div class="value">${fmtDurSec(payoutStats.avg_per_payout_seconds || 0)}</div></div>
      <div class="exec-card info"><div class="label">Est. Total Time</div><div class="value">${fmtDurSec(payoutStats.total_seconds || 0)}</div></div>
    </div>
    <table class="tbl"><thead><tr><th>Subscriber ID</th><th class="r">Records</th><th class="r">Batches</th><th>% of Total</th><th>vs Prev</th></tr></thead><tbody>
    ${payoutSubs.map((b) => {
      const rec = b.processed_sum?.value ?? 0;
      const pct = payoutProcessed ? ((rec / payoutProcessed) * 100).toFixed(1) : "0";
      const prevB = (payoutPrev.aggregations?.by_subscriber?.buckets ?? []).find((x) => x.key === b.key);
      const prevRec = prevB?.processed_sum?.value ?? 0;
      return `<tr><td>${link(`psub:${b.key}`, b.key)}</td><td class="r">${fmtNum(Math.round(rec))}</td><td class="r">${b.batch_count?.value ?? 0}</td><td>${pct}%</td><td>${badge(Math.round(rec), Math.round(prevRec))}</td></tr>`;
    }).join("\n")}
    </tbody></table>` : `<p style="color:#64748b;font-style:italic;padding:12px 0">No PayoutPosting data found for this period</p>`}
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>🛒 Amazon Settlement Report</h2><span class="subtitle">module=AmazonSettlementReport</span></div>
  <div class="card-body">
    ${amzTotal > 0 ? `
    <div class="exec-grid" style="margin-bottom:16px">
      <div class="exec-card total"><div class="label">Total Events</div><div class="value">${link("amazon_all", fmtNum(amzTotal))}</div><div class="change">${badge(amzTotal, amzPrevTotal)}</div></div>
      <div class="exec-card error"><div class="label">Errors</div><div class="value">${link("amazon_err", fmtNum(amzErrors))}</div><div class="change">${badge(amzErrors, amzPrevErrors)}</div></div>
      <div class="exec-card info"><div class="label">Settlements Processed</div><div class="value">${fmtNum(Math.round(amzProcessed))}</div><div class="change">${badge(Math.round(amzProcessed), Math.round(amzPrevProcessed))}</div></div>
      <div class="exec-card warning"><div class="label">Affected Subscribers</div><div class="value">${amzSubs.length}</div></div>
    </div>
    ${amzErrs.length ? `<div style="font-size:.78rem;font-weight:700;margin:12px 0 8px">Top Error Messages</div><table class="tbl"><thead><tr><th>Message</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${amzErrs.map((b) => `<tr><td>${link(`amsg:${b.key}`, b.key)}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${badge(b.doc_count, null)}</td></tr>`).join("")}</tbody></table>` : ""}
    <div style="font-size:.78rem;font-weight:700;margin:16px 0 8px">Top 5 Subscribers</div>
    <table class="tbl"><thead><tr><th>Subscriber ID</th><th class="r">Events</th><th class="r">Errors</th><th class="r">Settlements</th><th>vs Prev</th></tr></thead><tbody>
    ${amzSubs.map((b) => {
      const errs = (b.by_level?.buckets ?? []).find((x) => x.key === "Error")?.doc_count ?? 0;
      const sett = Math.round(b.processed_sum?.value ?? 0);
      return `<tr><td>${link(`asub:${b.key}`, b.key)}</td><td class="r">${fmtNum(b.doc_count)}</td><td class="r">${fmtNum(errs)}</td><td class="r">${fmtNum(sett)}</td><td>${badge(b.doc_count, null)}</td></tr>`;
    }).join("\n")}
    </tbody></table>` : `<p style="color:#64748b;font-style:italic;padding:12px 0">No Amazon Settlement activity found for this period</p>`}
  </div>
</div>

${perfSectionHtml("🏃 Shopify Payout — Performance Deep-Dive", perfP, perfPPrev, "pperf", "No Payout_PerformanceSummary logs found in this period.")}

${perfSectionHtml("🏃 Amazon Settlement — Performance Deep-Dive", perfA, perfAPrev, "aperf", "No Settlement_PerformanceSummary logs found in this period.")}

<div class="card">
  <div class="card-header"><h2>💡 Actionable Insights</h2></div>
  <div class="card-body"><div class="insights-grid">${insightHtml}</div></div>
</div>

<div class="card" style="margin-top:8px">
  <div class="card-body" style="text-align:center;color:#94a3b8;font-size:.72rem;padding:12px">
    Source: Kibana WD (<a href="https://kibana-wd.webgility.com" target="_blank">kibana-wd.webgility.com</a>) · Indices: ${esc(INDICES)} · Report generated ${generated} UTC · WD ES Kibana Automation
  </div>
</div>

</div>
</body>
</html>`;

mkdirSync(OUT_DIR, { recursive: true });
const outPath = join(OUT_DIR, `${REPORT_DATE}-wd-kibana-daily-report.html`);
writeFileSync(outPath, html, "utf8");
const size = Buffer.byteLength(html, "utf8");
console.log(`Wrote ${outPath} (${(size / 1024).toFixed(1)} KB)`);

if (size < 30 * 1024) {
  console.error(`ERROR: Report size ${size} bytes is below 30 KB minimum`);
  process.exit(1);
}

const sections = [
  "Executive Summary",
  "Hourly Error Timeline",
  "Error Breakdown",
  "Top Error Messages",
  "Top Error Subscribers",
  "Fatal Events",
  "Shopify Payout Performance",
  "Amazon Settlement Report",
  "Performance Deep-Dive",
  "Actionable Insights",
];
for (const s of sections) {
  if (!html.includes(s)) console.warn("Missing section:", s);
}

console.log("SUCCESS");
