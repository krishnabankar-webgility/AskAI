#!/usr/bin/env node
/**
 * WD Kibana Daily HTML Report Generator
 * Uses Kibana WD HTTPS proxy + shorten_url API
 */
import { writeFileSync, mkdirSync, unlinkSync, readdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const AUTH = process.env.KIBANA_WD_AUTH;
const KIBANA = "https://kibana-wd.webgility.com";
const INDEX_ID = "61237d60-0ed9-11eb-816a-cde07dc15a1f";

if (!AUTH) {
  console.error("HALT: KIBANA_WD_AUTH not set");
  process.exit(1);
}

const AUTH_HDR = "Basic " + Buffer.from(AUTH).toString("base64");
const HDR = {
  Authorization: AUTH_HDR,
  "kbn-xsrf": "true",
  "Content-Type": "application/json",
};

// --- Time windows (cron at 03:30 UTC = 09:00 IST) ---
function fmtIdx(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

const now = new Date();
const today930 = new Date(
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 30, 0)
);
if (now < today930) today930.setUTCDate(today930.getUTCDate() - 1);
const yesterday930 = new Date(today930);
yesterday930.setUTCDate(yesterday930.getUTCDate() - 1);
const dayBefore930 = new Date(yesterday930);
dayBefore930.setUTCDate(dayBefore930.getUTCDate() - 1);

const START = yesterday930.toISOString();
const END = today930.toISOString();
const PREV_START = dayBefore930.toISOString();
const PREV_END = yesterday930.toISOString();

const TODAY = today930.toISOString().slice(0, 10);
const YESTERDAY = yesterday930.toISOString().slice(0, 10);
const DAY_BEFORE = dayBefore930.toISOString().slice(0, 10);

async function indexExists(idx) {
  const path = encodeURIComponent(`${idx}/_count`);
  const resp = await fetch(`${KIBANA}/api/console/proxy?path=${path}&method=POST`, {
    method: "POST",
    headers: HDR,
    body: "{}",
    signal: AbortSignal.timeout(15_000),
  });
  return resp.ok;
}

async function resolveIndicesForWindow(windowStart, windowEnd) {
  const indices = new Set();
  for (const d of [windowEnd, windowStart]) {
    const idx = `webgilitydesktop-${fmtIdx(d)}`;
    if (await indexExists(idx)) indices.add(idx);
  }
  if (indices.size < 2) {
    const fb = new Date(windowStart);
    fb.setUTCDate(fb.getUTCDate() - 1);
    const fbIdx = `webgilitydesktop-${fmtIdx(fb)}`;
    if (await indexExists(fbIdx)) indices.add(fbIdx);
  }
  return [...indices].join(",");
}

const INDICES = await resolveIndicesForWindow(yesterday930, today930);
const PREV_INDICES = await resolveIndicesForWindow(dayBefore930, yesterday930);

async function esSearch(indices, body) {
  const path = encodeURIComponent(`${indices}/_search`);
  const url = `${KIBANA}/api/console/proxy?path=${path}&method=POST`;
  const resp = await fetch(url, {
    method: "POST",
    headers: HDR,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`ES ${resp.status}: ${t.slice(0, 300)}`);
  }
  return resp.json();
}

function mainAggQuery(gte, lt) {
  return {
    query: { bool: { must: [{ range: { timestamp: { gte, lt } } }] } },
    size: 0,
    track_total_hits: true,
    aggs: {
      by_level: { terms: { field: "level.keyword", size: 10 } },
      errors: {
        filter: { term: { "level.keyword": "Error" } },
        aggs: {
          by_hour: {
            date_histogram: {
              field: "timestamp",
              fixed_interval: "1h",
              time_zone: "+05:30",
              extended_bounds: { min: gte, max: lt },
            },
          },
          by_module: { terms: { field: "module.keyword", size: 15 } },
          by_store: { terms: { field: "store.keyword", size: 15 } },
          by_tag: { terms: { field: "tag.keyword", size: 15 } },
          by_process: { terms: { field: "process.keyword", size: 10 } },
          top_messages: { terms: { field: "message.keyword", size: 15 } },
          top_subscribers: { terms: { field: "subscriberID", size: 10 } },
        },
      },
      fatals: {
        filter: { term: { "level.keyword": "Fatal" } },
        aggs: {
          by_message: { terms: { field: "message.keyword", size: 15 } },
          by_store: { terms: { field: "store.keyword", size: 15 } },
        },
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
  const aggs = {
    total_processed: { sum: { field: "processedRecords" } },
    by_subscriber: {
      terms: { field: "subscriberID", size: 5, order: { processed_sum: "desc" } },
      aggs: {
        processed_sum: { sum: { field: "processedRecords" } },
        batch_count: { value_count: { field: "processedRecords" } },
      },
    },
  };
  if (withRate) {
    aggs.payout_time_stats = {
      scripted_metric: {
        init_script: "state.total_time = 0; state.per_record_times = []",
        map_script:
          "double rate = doc['averagePerSecond'].value; long records = doc['processedRecords'].value; if (rate > 0 && records > 0) { double batch_time = records / rate; state.total_time += batch_time; state.per_record_times.add(1.0 / rate); }",
        combine_script:
          "return ['total_time': state.total_time, 'per_record_times': state.per_record_times]",
        reduce_script:
          "double total = 0; double min_t = Double.MAX_VALUE; double max_t = 0; double sum_t = 0; int count = 0; for (s in states) { total += s.total_time; for (t in s.per_record_times) { if (t < min_t) min_t = t; if (t > max_t) max_t = t; sum_t += t; count++; } } return ['total_seconds': total, 'min_per_payout_seconds': min_t == Double.MAX_VALUE ? 0 : min_t, 'max_per_payout_seconds': max_t, 'avg_per_payout_seconds': count > 0 ? sum_t / count : 0, 'batch_count': count]",
      },
    };
  }
  return { query: { bool: { must } }, size: 0, aggs };
}

function amazonQuery(gte, lt) {
  return {
    query: {
      bool: {
        must: [
          { range: { timestamp: { gte, lt } } },
          { term: { "module.keyword": "AmazonSettlementReport" } },
        ],
      },
    },
    size: 0,
    track_total_hits: true,
    aggs: {
      by_level: { terms: { field: "level.keyword", size: 10 } },
      total_processed: { sum: { field: "processedRecords" } },
      unique_subscribers: { cardinality: { field: "subscriberID" } },
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

function perfFallbackQuery(gte, lt, module) {
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

// --- Helpers ---
function levelCount(aggs, level) {
  const b = aggs?.by_level?.buckets?.find((x) => x.key === level);
  return b?.doc_count ?? 0;
}

function buckets(agg) {
  return agg?.buckets ?? [];
}

function pctChange(cur, prev) {
  if (prev === 0 && cur === 0) return { cls: "flat", text: "≈" };
  if (prev === 0) return { cls: "new", text: "NEW" };
  const ch = ((cur - prev) / prev) * 100;
  if (Math.abs(ch) <= 10) return { cls: "flat", text: "≈" };
  const arrow = ch > 0 ? "↑" : "↓";
  const cls = ch > 0 ? "up" : "down";
  return { cls, text: `${arrow}${Math.abs(ch).toFixed(1)}%` };
}

function vsBadge(cur, prev, invertGood = false) {
  const p = pctChange(cur, prev);
  if (invertGood && p.cls === "up") p.cls = "down";
  else if (invertGood && p.cls === "down") p.cls = "up";
  return `<span class="cb ${p.cls}">${p.text}</span>`;
}

function fmtNum(n) {
  return (n ?? 0).toLocaleString("en-US");
}

function fmtDurSec(s) {
  if (!s || s <= 0) return "0s";
  if (s < 60) return `${s.toFixed(1)}s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return `${m}m ${sec}s`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  return `${h}h ${m}m${sec ? ` ${sec}s` : ""}`;
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
  return `${h}h ${m}m${s ? ` ${s}s` : ""}`;
}

function pctBarColor(pct, type = "error") {
  if (type === "error") {
    if (pct > 50) return "red";
    if (pct > 20) return "orange";
    if (pct > 10) return "amber";
    if (pct > 5) return "blue";
    return "gray";
  }
  if (pct > 80) return "red";
  if (pct > 50) return "orange";
  if (pct > 25) return "amber";
  return "blue";
}

function pctBarHtml(pct, color) {
  const w = Math.min(100, Math.max(0.1, pct)).toFixed(1);
  const label = pct < 0.1 ? "<0.1%" : `${w}%`;
  return `<div class="pct-bar-wrap"><span class="pct-text">${label}</span><div class="pct-bar"><div class="pct-bar-fill ${color}" style="width:${w}%"></div></div></div>`;
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escKql(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildDiscoverUrl(kql, from, to) {
  const q = escKql(kql);
  return `/app/kibana#/discover?_g=(refreshInterval:(pause:!t,value:0),time:(from:'${from}',to:'${to}'))&_a=(columns:!(timestamp,level,message,store,module,subscriberID),index:'${INDEX_ID}',interval:auto,query:(language:kuery,query:'${q}'),sort:!(!(timestamp,desc)))`;
}

const urlCache = new Map();
async function shortUrl(kql, from = START, to = END) {
  const key = `${from}|${to}|${kql}`;
  if (urlCache.has(key)) return urlCache.get(key);
  const discover = buildDiscoverUrl(kql, from, to);
  try {
    const resp = await fetch(`${KIBANA}/api/shorten_url`, {
      method: "POST",
      headers: HDR,
      body: JSON.stringify({ url: discover }),
      signal: AbortSignal.timeout(30_000),
    });
    if (resp.ok) {
      const j = await resp.json();
      const u = `${KIBANA}/goto/${j.urlId}`;
      urlCache.set(key, u);
      return u;
    }
  } catch {}
  const u = KIBANA;
  urlCache.set(key, u);
  return u;
}

async function shortUrlsBatch(items) {
  const results = await Promise.all(
    items.map(async ({ kql, from, to }) => ({
      ...items.find((x) => x.kql === kql),
      url: await shortUrl(kql, from ?? START, to ?? END),
    }))
  );
  return results;
}

function link(url, text) {
  return `<a href="${url}" target="_blank">${escHtml(text)}</a>`;
}

function parsePerfDetail(detail, message) {
  let totalTime = 0;
  const m1 = (detail || "").match(/Total Time:\s*(\d+)\s*ms/);
  const m2 = (message || "").match(/Total Time:\s*(\d+),\s*ms/);
  if (m1) totalTime = parseInt(m1[1], 10);
  else if (m2) totalTime = parseInt(m2[1], 10);

  const steps = [];
  for (const line of (detail || "").split(/\r?\n/)) {
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
  let maxStep = { name: "—", ms: 0 };
  for (const s of steps) {
    if (s.ms > maxStep.ms) maxStep = { name: s.name, ms: s.ms };
  }
  return { totalTime, steps, maxStep };
}

function aggregatePerf(hits) {
  const bySub = new Map();
  const stepStats = new Map();

  for (const h of hits) {
    const s = h._source;
    const { totalTime, steps, maxStep } = parsePerfDetail(s.detail, s.message);
    const sid = s.subscriberID;
    if (!bySub.has(sid)) {
      bySub.set(sid, {
        subscriberID: sid,
        email: s.email || "",
        runCount: 0,
        processedRecords: 0,
        totalTime: 0,
        maxStep: { name: "", ms: 0 },
        allSteps: [],
      });
    }
    const rec = bySub.get(sid);
    rec.runCount++;
    rec.processedRecords += s.processedRecords || 0;
    rec.totalTime += totalTime;
    if (maxStep.ms > rec.maxStep.ms) rec.maxStep = maxStep;
    rec.allSteps.push(...steps);

    for (const st of steps) {
      const key = `${st.num}:${st.name}`;
      if (!stepStats.has(key)) {
        stepStats.set(key, { num: st.num, name: st.name, count: 0, totalMs: 0, maxMs: 0, minMs: Infinity });
      }
      const ss = stepStats.get(key);
      ss.count++;
      ss.totalMs += st.ms;
      ss.maxMs = Math.max(ss.maxMs, st.ms);
      ss.minMs = Math.min(ss.minMs, st.ms);
    }
  }

  const top5 = [...bySub.values()]
    .sort((a, b) => b.totalTime - a.totalTime)
    .slice(0, 5);

  const stepList = [...stepStats.values()].sort((a, b) => a.num - b.num);
  return { top5, stepList, runCount: hits.length };
}

function buildDonutGradient(storeBuckets, total) {
  const colors = ["#96bf48", "#7f54b3", "#2196F3", "#ff9900", "#ee672d", "#94a3b8"];
  let deg = 0;
  const parts = [];
  const top = storeBuckets.slice(0, 5);
  const topSum = top.reduce((a, b) => a + b.doc_count, 0);
  for (let i = 0; i < top.length; i++) {
    const pct = (top[i].doc_count / total) * 360;
    const end = deg + pct;
    parts.push(`${colors[i % colors.length]} ${deg}deg ${end}deg`);
    deg = end;
  }
  if (deg < 360) parts.push(`${colors[5]} ${deg}deg 360deg`);
  return parts.join(",\n  ");
}

function istHourLabels() {
  return [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7, 8];
}

function mapHourlyToIST(buckets, startMs, endMs) {
  const labels = istHourLabels();
  const counts = new Array(24).fill(0);
  for (const b of buckets) {
    const t = new Date(b.key).getTime();
    if (t < startMs || t >= endMs) continue;
    const ist = new Date(t + 5.5 * 3600 * 1000);
    const h = ist.getUTCHours();
    const idx = labels.indexOf(h);
    if (idx >= 0) counts[idx] += b.doc_count;
  }
  return { labels, counts };
}

// --- Main (indices resolved above) ---
console.log(`Report date: ${TODAY}`);
console.log(`Window: ${START} → ${END}`);
console.log(`Indices: ${INDICES}`);
console.log(`Prev indices: ${PREV_INDICES}`);

// Connectivity
const status = await fetch(`${KIBANA}/api/status`, { headers: { Authorization: AUTH_HDR, "kbn-xsrf": "true" } });
if (!status.ok) {
  console.error(`HALT: Kibana status ${status.status}`);
  process.exit(1);
}

console.log("Running queries...");
const [q1, q2, q3, q4, q5raw, q6raw] = await Promise.all([
  esSearch(INDICES, mainAggQuery(START, END)),
  esSearch(PREV_INDICES, mainAggQuery(PREV_START, PREV_END)),
  esSearch(INDICES, payoutQuery(START, END, true)).catch(() => null),
  esSearch(INDICES, amazonQuery(START, END)),
  esSearch(INDICES, perfQuery(START, END, "PayoutPosting", "Payout_PerformanceSummary")),
  esSearch(INDICES, perfQuery(START, END, "AmazonSettlementReport", "Settlement_PerformanceSummary")),
]);

let q3fb = null;
if (!q3 || (q3.hits?.total?.value ?? 0) === 0) {
  q3fb = await esSearch(INDICES, payoutQuery(START, END, false));
}
const payout = q3?.aggregations?.total_processed ? q3 : q3fb;

let q5 = q5raw;
if ((q5raw.hits?.hits?.length ?? 0) === 0) {
  q5 = await esSearch(INDICES, perfFallbackQuery(START, END, "PayoutPosting"));
}
let q6 = q6raw;
if ((q6raw.hits?.hits?.length ?? 0) === 0) {
  q6 = await esSearch(INDICES, perfFallbackQuery(START, END, "AmazonSettlementReport"));
}

const [q2payout, q2amazon] = await Promise.all([
  esSearch(PREV_INDICES, payoutQuery(PREV_START, PREV_END, true)).catch(() =>
    esSearch(PREV_INDICES, payoutQuery(PREV_START, PREV_END, false))
  ),
  esSearch(PREV_INDICES, amazonQuery(PREV_START, PREV_END)),
]);

const q5prev = await esSearch(
  PREV_INDICES,
  (q5raw.hits?.hits?.length ?? 0) > 0
    ? perfQuery(PREV_START, PREV_END, "PayoutPosting", "Payout_PerformanceSummary")
    : perfFallbackQuery(PREV_START, PREV_END, "PayoutPosting")
);
const q6prev = await esSearch(
  PREV_INDICES,
  (q6raw.hits?.hits?.length ?? 0) > 0
    ? perfQuery(PREV_START, PREV_END, "AmazonSettlementReport", "Settlement_PerformanceSummary")
    : perfFallbackQuery(PREV_START, PREV_END, "AmazonSettlementReport")
);

const total = q1.hits.total.value;
if (total === 0) {
  console.warn("Warning: Q1 returned 0 hits but proceeding with all sections");
}

const prevTotal = q2.hits.total.value;
const aggs = q1.aggregations;
const prevAggs = q2.aggregations;

const errors = levelCount(aggs, "Error");
const fatals = levelCount(aggs, "Fatal");
const warnings = levelCount(aggs, "Warning");
const info = levelCount(aggs, "Info");
const prevErrors = levelCount(prevAggs, "Error");
const prevFatals = levelCount(prevAggs, "Fatal");
const prevWarnings = levelCount(prevAggs, "Warning");
const prevInfo = levelCount(prevAggs, "Info");
const errorRate = total > 0 ? ((errors / total) * 100).toFixed(2) : "0.00";
const prevErrorRate = prevTotal > 0 ? ((prevErrors / prevTotal) * 100).toFixed(2) : "0.00";

const errAggs = aggs.errors;
const prevErrAggs = prevAggs.errors;
const fatalAggs = aggs.fatals;

const startMs = new Date(START).getTime();
const endMs = new Date(END).getTime();
const hourly = mapHourlyToIST(buckets(errAggs.by_hour), startMs, endMs);
const maxHourly = Math.max(...hourly.counts, 1);
let peakHour = 9,
  peakCount = 0;
hourly.counts.forEach((c, i) => {
  if (c > peakCount) {
    peakCount = c;
    peakHour = hourly.labels[i];
  }
});

const perfPayout = aggregatePerf(q5.hits?.hits ?? []);
const perfAmazon = aggregatePerf(q6.hits?.hits ?? []);
const perfPayoutPrev = aggregatePerf(q5prev.hits?.hits ?? []);
const perfAmazonPrev = aggregatePerf(q6prev.hits?.hits ?? []);

function prevMap(buckets) {
  const m = new Map();
  for (const b of buckets) m.set(b.key, b.doc_count);
  return m;
}

const prevModuleMap = prevMap(buckets(prevErrAggs.by_module));
const prevStoreMap = prevMap(buckets(prevErrAggs.by_store));
const prevTagMap = prevMap(buckets(prevErrAggs.by_tag));
const prevProcessMap = prevMap(buckets(prevErrAggs.by_process));
const prevMsgMap = prevMap(buckets(prevErrAggs.top_messages));
const prevSubMap = prevMap(buckets(prevErrAggs.top_subscribers));
const prevFatalMsgMap = prevMap(buckets(prevAggs.fatals.by_message));
const prevFatalStoreMap = prevMap(buckets(prevAggs.fatals.by_store));

console.log(`Generating ${urlCache.size} short URLs...`);

// Collect all KQL for short URLs
const kqlItems = [];
const addKql = (id, kql, from = START, to = END) => kqlItems.push({ id, kql, from, to });

addKql("total", "*");
addKql("errors", 'level.keyword:"Error"');
addKql("fatals", 'level.keyword:"Fatal"');
addKql("warnings", 'level.keyword:"Warning"');
addKql("info", 'level.keyword:"Info"');
addKql("payout_all", 'level.keyword:"Info" AND module.keyword:"PayoutPosting" AND store.keyword:"Shopify"');
addKql("amazon_all", 'module.keyword:"AmazonSettlementReport"');
addKql("amazon_errors", 'level.keyword:"Error" AND module.keyword:"AmazonSettlementReport"');

for (const b of buckets(errAggs.by_module)) {
  const k = b.key === "" || b.key === "(empty)" ? "Unknown" : b.key;
  addKql(`mod_${k}`, `level.keyword:"Error" AND module.keyword:"${escKql(k === "Unknown" ? "" : k)}"`);
}
for (const b of buckets(errAggs.by_store)) {
  addKql(`store_${b.key}`, `level.keyword:"Error" AND store.keyword:"${escKql(b.key)}"`);
}
for (const b of buckets(errAggs.by_tag)) {
  addKql(`tag_${b.key}`, `level.keyword:"Error" AND tag.keyword:"${escKql(b.key)}"`);
}
for (const b of buckets(errAggs.by_process)) {
  addKql(`proc_${b.key}`, `level.keyword:"Error" AND process.keyword:"${escKql(b.key)}"`);
}
for (const b of buckets(errAggs.top_messages)) {
  addKql(`msg_${b.key.slice(0, 40)}`, `level.keyword:"Error" AND message.keyword:"${escKql(b.key)}"`);
}
for (const b of buckets(errAggs.top_subscribers)) {
  addKql(`sub_${b.key}`, `level.keyword:"Error" AND subscriberID:${b.key}`);
}
for (const b of buckets(fatalAggs.by_message)) {
  addKql(`fmsg_${b.key.slice(0, 40)}`, `level.keyword:"Fatal" AND message.keyword:"${escKql(b.key)}"`);
}
for (const b of buckets(fatalAggs.by_store)) {
  addKql(`fstore_${b.key}`, `level.keyword:"Fatal" AND store.keyword:"${escKql(b.key)}"`);
}

const payoutAggs = payout?.aggregations;
if (payoutAggs) {
  for (const b of buckets(payoutAggs.by_subscriber)) {
    addKql(`pay_sub_${b.key}`, `level.keyword:"Info" AND module.keyword:"PayoutPosting" AND subscriberID:${b.key}`);
  }
}
for (const b of buckets(q4.aggregations.top_subscribers)) {
  addKql(`amz_sub_${b.key}`, `module.keyword:"AmazonSettlementReport" AND subscriberID:${b.key}`);
}
for (const b of buckets(q4.aggregations.top_errors?.by_message)) {
  addKql(`amz_err_${b.key.slice(0, 40)}`, `level.keyword:"Error" AND module.keyword:"AmazonSettlementReport" AND message.keyword:"${escKql(b.key)}"`);
}
for (const p of perfPayout.top5) {
  addKql(`perf_pay_${p.subscriberID}`, `tag.keyword:"Performance" AND module.keyword:"PayoutPosting" AND subscriberID:${p.subscriberID}`);
}
for (const p of perfAmazon.top5) {
  addKql(`perf_amz_${p.subscriberID}`, `tag.keyword:"Performance" AND module.keyword:"AmazonSettlementReport" AND subscriberID:${p.subscriberID}`);
}

// Generate URLs in batches of 15
const urlMap = {};
for (let i = 0; i < kqlItems.length; i += 15) {
  const batch = kqlItems.slice(i, i + 15);
  await Promise.all(
    batch.map(async (item) => {
      urlMap[item.id] = await shortUrl(item.kql, item.from, item.to);
    })
  );
}
console.log(`Generated ${Object.keys(urlMap).length} short URLs`);

function u(id) {
  return urlMap[id] || KIBANA;
}

const genUtc = new Date().toISOString().replace("T", " ").slice(0, 19);
const genIst = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19);

// Build hourly bars HTML
let barsHtml = "";
for (let i = 0; i < 24; i++) {
  const c = hourly.counts[i];
  const h = hourly.labels[i];
  const pct = (c / maxHourly) * 100;
  const hPct = Math.max(0.1, pct);
  let cls = "c1";
  if (pct >= 60) cls = "c4";
  else if (pct >= 25) cls = "c3";
  else if (pct >= 10) cls = "c2";
  const lbl = String(h).padStart(2, "0");
  barsHtml += `<div class="bar-col"><div class="bar ${cls}" style="height:${hPct.toFixed(1)}%" title="${lbl}:00 IST — ${c} errors"></div><div class="bar-lbl">${lbl}</div></div>\n`;
}

// Module table
let moduleRows = "";
for (const b of buckets(errAggs.by_module)) {
  const name = !b.key || b.key === "(empty)" ? "Unknown" : b.key;
  const pct = errors > 0 ? (b.doc_count / errors) * 100 : 0;
  moduleRows += `<tr><td>${link(u(`mod_${name}`), name)}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${pctBarHtml(pct, pctBarColor(pct))}</td><td>${vsBadge(b.doc_count, prevModuleMap.get(b.key) ?? prevModuleMap.get("") ?? 0)}</td></tr>\n`;
}
if (!moduleRows) moduleRows = `<tr><td colspan="4"><em>No data found</em></td></tr>`;

let storeRows = "";
for (const b of buckets(errAggs.by_store)) {
  const pct = errors > 0 ? (b.doc_count / errors) * 100 : 0;
  storeRows += `<tr><td>${link(u(`store_${b.key}`), b.key)}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${pctBarHtml(pct, pctBarColor(pct))}</td><td>${vsBadge(b.doc_count, prevStoreMap.get(b.key) ?? 0)}</td></tr>\n`;
}
if (!storeRows) storeRows = `<tr><td colspan="4"><em>No data found</em></td></tr>`;

let tagRows = "";
for (const b of buckets(errAggs.by_tag)) {
  tagRows += `<tr><td>${link(u(`tag_${b.key}`), b.key)}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${vsBadge(b.doc_count, prevTagMap.get(b.key) ?? 0)}</td></tr>\n`;
}
if (!tagRows) tagRows = `<tr><td colspan="3"><em>No data found</em></td></tr>`;

let procRows = "";
for (const b of buckets(errAggs.by_process)) {
  procRows += `<tr><td>${link(u(`proc_${b.key}`), b.key)}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${vsBadge(b.doc_count, prevProcessMap.get(b.key) ?? 0)}</td></tr>\n`;
}
if (!procRows) procRows = `<tr><td colspan="3"><em>No data found</em></td></tr>`;

let msgRows = "";
let mi = 1;
for (const b of buckets(errAggs.top_messages)) {
  const short = b.key.length > 80 ? b.key.slice(0, 77) + "..." : b.key;
  msgRows += `<tr><td>${mi}</td><td>${link(u(`msg_${b.key.slice(0, 40)}`), short)}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${vsBadge(b.doc_count, prevMsgMap.get(b.key) ?? 0)}</td></tr>\n`;
  mi++;
}
if (!msgRows) msgRows = `<tr><td colspan="4"><em>No error messages found in this period</em></td></tr>`;

let subRows = "";
let si = 1;
for (const b of buckets(errAggs.top_subscribers)) {
  const pct = errors > 0 ? (b.doc_count / errors) * 100 : 0;
  subRows += `<tr><td>${si}</td><td>${link(u(`sub_${b.key}`), String(b.key))}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${pctBarHtml(pct, pctBarColor(pct))}</td><td>${vsBadge(b.doc_count, prevSubMap.get(b.key) ?? 0)}</td></tr>\n`;
  si++;
}
if (!subRows) subRows = `<tr><td colspan="5"><em>No data found</em></td></tr>`;

let fatalMsgRows = "";
for (const b of buckets(fatalAggs.by_message)) {
  const short = b.key.length > 60 ? b.key.slice(0, 57) + "..." : b.key;
  fatalMsgRows += `<tr><td>${link(u(`fmsg_${b.key.slice(0, 40)}`), short)}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${vsBadge(b.doc_count, prevFatalMsgMap.get(b.key) ?? 0)}</td></tr>\n`;
}
if (!fatalMsgRows) fatalMsgRows = `<tr><td colspan="3"><em>No fatal events found in this period</em></td></tr>`;

const fatalStoreBuckets = buckets(fatalAggs.by_store);
const fatalTotal = fatals || 1;
const donutGrad = buildDonutGradient(fatalStoreBuckets, fatalTotal);

let fatalStoreRows = "";
for (const b of fatalStoreBuckets) {
  const pct = ((b.doc_count / fatalTotal) * 100).toFixed(1);
  fatalStoreRows += `<tr><td>${link(u(`fstore_${b.key}`), b.key)}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${pct}%</td><td>${vsBadge(b.doc_count, prevFatalStoreMap.get(b.key) ?? 0)}</td></tr>\n`;
}
if (!fatalStoreRows) fatalStoreRows = `<tr><td colspan="4"><em>No data found</em></td></tr>`;

// Payout section
const payStats = payoutAggs?.payout_time_stats?.value;
const payProcessed = payoutAggs?.total_processed?.value ?? 0;
const prevPayProcessed = q2payout?.aggregations?.total_processed?.value ?? 0;
const payBatches = payStats?.batch_count ?? buckets(payoutAggs?.by_subscriber).reduce((a, b) => a + (b.batch_count?.value ?? 0), 0);

let payoutSection = "";
if (!payoutAggs || payProcessed === 0) {
  payoutSection = `<p style="color:#64748b;padding:16px"><em>No PayoutPosting data found for this period</em></p>`;
} else {
  const minT = payStats?.min_per_payout_seconds ?? 0;
  const maxT = payStats?.max_per_payout_seconds ?? 0;
  const avgT = payStats?.avg_per_payout_seconds ?? 0;
  const totalSec = payStats?.total_seconds ?? 0;
  let paySubRows = "";
  let pi = 1;
  for (const b of buckets(payoutAggs.by_subscriber)) {
    const rec = b.processed_sum?.value ?? 0;
    const pct = payProcessed > 0 ? (rec / payProcessed) * 100 : 0;
    paySubRows += `<tr><td>${pi}</td><td>${link(u(`pay_sub_${b.key}`), String(b.key))}</td><td class="r">${fmtNum(rec)}</td><td class="r">${b.batch_count?.value ?? 0}</td><td>${pctBarHtml(pct, pctBarColor(pct))}</td><td><span class="cb new">NEW</span></td></tr>\n`;
    pi++;
  }
  payoutSection = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px">
      <div class="exec-card" style="border-color:#3b82f6"><div class="label">Records Processed</div><div class="value" style="font-size:1.3rem">${link(u("payout_all"), fmtNum(payProcessed))}</div><div class="change">${vsBadge(payProcessed, prevPayProcessed)} vs prev ${fmtNum(prevPayProcessed)}</div></div>
      <div class="exec-card" style="border-color:#10b981"><div class="label">Batches</div><div class="value" style="font-size:1.3rem">${fmtNum(payBatches)}</div></div>
      <div class="exec-card" style="border-color:#f97316"><div class="label">Min Time/Record</div><div class="value" style="font-size:1.1rem">${fmtDurSec(minT)}</div></div>
      <div class="exec-card" style="border-color:#ef4444"><div class="label">Max Time/Record</div><div class="value" style="font-size:1.1rem">${fmtDurSec(maxT)}</div></div>
      <div class="exec-card" style="border-color:#8b5cf6"><div class="label">Avg Time/Record</div><div class="value" style="font-size:1.1rem">${fmtDurSec(avgT)}</div></div>
      <div class="exec-card" style="border-color:#6366f1"><div class="label">Est. Total Time</div><div class="value" style="font-size:1.1rem">${fmtDurSec(totalSec)}</div></div>
    </div>
    <div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">Top 5 Subscribers by Records Processed</div>
    <table class="tbl"><thead><tr><th>#</th><th>Subscriber ID</th><th class="r">Records</th><th class="r">Batches</th><th>% of Total</th><th>vs Prev</th></tr></thead><tbody>${paySubRows || '<tr><td colspan="6"><em>No subscriber data</em></td></tr>'}</tbody></table>`;
}

// Amazon section
const amzAggs = q4.aggregations;
const amzTotal = q4.hits.total.value;
const prevAmzTotal = q2amazon.hits.total.value;
const amzErrors = levelCount(amzAggs, "Error");
const prevAmzErrors = levelCount(q2amazon.aggregations, "Error");
const amzInfo = levelCount(amzAggs, "Info");
const prevAmzInfo = levelCount(q2amazon.aggregations, "Info");
const amzSubs = amzAggs.unique_subscribers?.value ?? 0;
const prevAmzSubs = q2amazon.aggregations.unique_subscribers?.value ?? 0;

let amzErrRows = "";
for (const b of buckets(amzAggs.top_errors?.by_message)) {
  amzErrRows += `<tr><td>${link(u(`amz_err_${b.key.slice(0, 40)}`), escHtml(b.key))}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${vsBadge(b.doc_count, 0)}</td></tr>\n`;
}

let amzSubRows = "";
let ai = 1;
for (const b of buckets(amzAggs.top_subscribers)) {
  const infoC = b.by_level?.buckets?.find((x) => x.key === "Info")?.doc_count ?? 0;
  const errC = b.by_level?.buckets?.find((x) => x.key === "Error")?.doc_count ?? 0;
  const sett = b.processed_sum?.value || infoC;
  amzSubRows += `<tr><td>${ai}</td><td>${link(u(`amz_sub_${b.key}`), String(b.key))}</td><td class="r">${fmtNum(b.doc_count)}</td><td class="r">${fmtNum(errC)}</td><td class="r">${fmtNum(sett)}</td><td><span class="cb new">NEW</span></td></tr>\n`;
  ai++;
}

let amazonSection = "";
if (amzTotal === 0) {
  amazonSection = `<p style="color:#64748b;padding:16px"><em>No Amazon Settlement activity found for this period</em></p>`;
} else {
  amazonSection = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px">
      <div class="exec-card" style="border-color:#3b82f6"><div class="label">Total Events</div><div class="value" style="font-size:1.3rem">${link(u("amazon_all"), fmtNum(amzTotal))}</div><div class="change">${vsBadge(amzTotal, prevAmzTotal)} vs prev ${fmtNum(prevAmzTotal)}</div></div>
      <div class="exec-card" style="border-color:#ef4444"><div class="label">Errors</div><div class="value" style="font-size:1.3rem">${link(u("amazon_errors"), fmtNum(amzErrors))}</div><div class="change">${vsBadge(amzErrors, prevAmzErrors)}</div></div>
      <div class="exec-card" style="border-color:#10b981"><div class="label">Settlements (Info)</div><div class="value" style="font-size:1.3rem">${fmtNum(amzInfo)}</div><div class="change">${vsBadge(amzInfo, prevAmzInfo)}</div></div>
      <div class="exec-card" style="border-color:#f97316"><div class="label">Affected Subscribers</div><div class="value" style="font-size:1.3rem">${fmtNum(amzSubs)}</div><div class="change">${vsBadge(amzSubs, prevAmzSubs)}</div></div>
    </div>
    ${amzErrRows ? `<div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">Top Error Messages</div><table class="tbl"><thead><tr><th>Message</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${amzErrRows}</tbody></table>` : '<div style="font-size:.75rem;color:#64748b;margin-bottom:12px">No error messages found for this period — all activity was Info/Fatal level.</div>'}
    <div style="font-size:.78rem;font-weight:700;color:#475569;margin:16px 0 8px">Top 5 Subscribers by Total Events</div>
    <table class="tbl"><thead><tr><th>#</th><th>Subscriber ID</th><th class="r">Total Events</th><th class="r">Errors</th><th class="r">Settlements</th><th>vs Prev</th></tr></thead><tbody>${amzSubRows}</tbody></table>`;
}

function buildPerfSection(perf, perfPrev, module, moduleLabel, urlPrefix) {
  if (perf.runCount === 0) {
    return `<p style="color:#64748b;padding:16px"><em>No \`${module === "PayoutPosting" ? "Payout_PerformanceSummary" : "Settlement_PerformanceSummary"}\` logs found in this period.</em></p>`;
  }
  const prevTopMap = new Map(perfPrev.top5.map((p) => [p.subscriberID, p.totalTime]));
  const maxTime = perf.top5[0]?.totalTime || 1;
  const maxStepAvg = Math.max(...perf.stepList.map((s) => s.totalMs / s.count), 1);

  let rows = "";
  let rank = 1;
  for (const p of perf.top5) {
    const pct = (p.totalTime / maxTime) * 100;
    const prevT = prevTopMap.get(p.subscriberID);
    const vs =
      prevT === undefined
        ? '<span class="cb new">NEW</span>'
        : vsBadge(p.totalTime, prevT);
    const stepSums = {};
    for (const st of p.allSteps) {
      const k = `S${st.num}`;
      stepSums[k] = (stepSums[k] || 0) + st.ms;
    }
    const top3 = Object.entries(stepSums)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${fmtDurMs(v)}`)
      .join("<br>");
    rows += `<tr><td>${rank}</td><td>${link(u(`${urlPrefix}_${p.subscriberID}`), String(p.subscriberID))}</td><td class="perf-email">${escHtml(p.email)}</td><td class="r">${p.runCount}</td><td class="r">${fmtNum(p.processedRecords)}</td><td class="r perf-time">${fmtDurMs(p.totalTime)}</td><td>${pctBarHtml(pct, pctBarColor(pct, "perf"))}</td><td class="perf-step-max">${escHtml(p.maxStep.name)}<br><span class="perf-step-ms">${fmtDurMs(p.maxStep.ms)}</span></td><td class="perf-step-detail">${top3}</td><td>${vs}</td></tr>\n`;
    rank++;
  }

  let stepBars = "";
  for (const s of perf.stepList) {
    const avg = s.totalMs / s.count;
    const pct = (avg / maxStepAvg) * 100;
    const shortName = s.name.length > 18 ? s.name.slice(0, 18) : s.name;
    const cls = pctBarColor(pct, "perf");
    stepBars += `<div class="step-row"><div class="step-label" title="${escHtml(s.name)}">S${s.num}: ${escHtml(shortName)}</div><div class="step-bar-wrap"><div class="step-bar ${cls}" style="width:${Math.max(4, pct).toFixed(1)}%"></div><span class="step-bar-val">${fmtDurMs(avg)} avg / ${fmtDurMs(s.maxMs)} max (${s.count} runs)</span></div></div>\n`;
  }

  return `
    <div style="font-size:.8rem;font-weight:700;color:#334155;margin-bottom:12px">Sub-section A: Top 5 Clients by Total Processing Time</div>
    <div style="overflow-x:auto"><table class="perf-table"><thead><tr><th>#</th><th>Subscriber ID</th><th>Email</th><th>Runs</th><th>Transactions</th><th>Total Time</th><th>% of Max</th><th>Slowest Step</th><th>Top 3 Steps by Time</th><th>vs Prev</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="step-chart"><div class="step-chart-title">Avg Step Processing Time — ${moduleLabel} (${perf.runCount} total runs)</div>${stepBars}</div>`;
}

// Insights
const insights = [];
if (errors > prevErrors * 1.2) insights.push({ type: "spike", title: "Error volume elevated", desc: `Errors at ${fmtNum(errors)} (${vsBadge(errors, prevErrors).replace(/<[^>]+>/g, "")} vs previous day). Review top messages and subscriber 73243 if present.` });
else if (errors < prevErrors * 0.8) insights.push({ type: "healthy", title: "Error volume improved", desc: `Errors decreased to ${fmtNum(errors)} from ${fmtNum(prevErrors)}.` });
if (peakCount > maxHourly * 0.8) insights.push({ type: "warning", title: "Peak error hour", desc: `Peak ${fmtNum(peakCount)} errors at ${String(peakHour).padStart(2, "0")}:00 IST — investigate hourly timeline.` });
const topMsg = buckets(errAggs.top_messages)[0];
if (topMsg) insights.push({ type: "danger", title: "Top error message", desc: `"${topMsg.key.slice(0, 80)}" — ${fmtNum(topMsg.doc_count)} occurrences (${((topMsg.doc_count / errors) * 100).toFixed(1)}% of errors).` });
if (fatals > 0) insights.push({ type: "warning", title: "Fatal events", desc: `${fmtNum(fatals)} fatal events (${vsBadge(fatals, prevFatals).replace(/<[^>]+>/g, "")} vs prev). Check 401 Unauthorized and QB connection issues.` });
if (payProcessed > 0) insights.push({ type: "healthy", title: "Shopify Payout active", desc: `${fmtNum(payProcessed)} payout records processed across ${fmtNum(payBatches)} batches.` });
if (amzTotal > 0 && amzErrors === 0) insights.push({ type: "healthy", title: "Amazon Settlement clean", desc: `${fmtNum(amzTotal)} settlement events with zero errors.` });
while (insights.length < 4) insights.push({ type: "healthy", title: "Monitoring", desc: "Continue daily review of error trends and performance deep-dives." });

let insightsHtml = "";
for (const ins of insights.slice(0, 6)) {
  const icons = { danger: "!", warning: "↑", spike: "⚡", healthy: "✓" };
  insightsHtml += `<div class="insight-card ${ins.type}"><div class="icon">${icons[ins.type] || "•"}</div><h4>${escHtml(ins.title)}</h4><p>${escHtml(ins.desc)}</p></div>\n`;
}

const rateCh = parseFloat(errorRate) - parseFloat(prevErrorRate);
const rateBadge = rateCh > 0 ? `<span class="cb up">↑${Math.abs(rateCh).toFixed(2)}pp</span>` : rateCh < 0 ? `<span class="cb down">↓${Math.abs(rateCh).toFixed(2)}pp</span>` : `<span class="cb flat">≈</span>`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WD Kibana Daily Log Report — ${TODAY}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f8fafc;color:#1e293b;font-size:.85rem}
a{color:#2563eb;text-decoration:none}
a:hover{text-decoration:underline}
.page{max-width:1280px;margin:0 auto;padding:24px 16px}
.rpt-header{background:linear-gradient(135deg,#1e3a5f 0%,#2d5a8e 100%);color:#fff;border-radius:12px;padding:24px 32px;margin-bottom:24px}
.rpt-header h1{font-size:1.4rem;font-weight:700;margin-bottom:4px}
.rpt-header .meta{font-size:.78rem;opacity:.8;display:flex;gap:24px;flex-wrap:wrap;margin-top:8px}
.rpt-header .meta span{display:flex;align-items:center;gap:4px}
.card{background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.08),0 1px 2px rgba(0,0,0,.05);margin-bottom:20px;overflow:hidden}
.card-header{padding:14px 20px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
.card-header h2{font-size:.92rem;font-weight:700;color:#0f172a}
.card-header .subtitle{font-size:.72rem;color:#64748b}
.card-body{padding:16px 20px}
.exec-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.exec-card{border-radius:8px;padding:14px 16px;border-left:4px solid #e2e8f0;background:#fafafa}
.exec-card.total{border-color:#3b82f6}.exec-card.error{border-color:#ef4444}.exec-card.fatal{border-color:#7c3aed}
.exec-card.warning{border-color:#f59e0b}.exec-card.info{border-color:#10b981}.exec-card.rate{border-color:#f97316}
.exec-card .label{font-size:.68rem;font-weight:600;text-transform:uppercase;color:#64748b;letter-spacing:.05em;margin-bottom:6px}
.exec-card .value{font-size:1.5rem;font-weight:800;color:#0f172a}
.exec-card .value a{color:inherit}
.exec-card .change{font-size:.7rem;margin-top:4px}
.cb{display:inline-flex;align-items:center;gap:2px;padding:2px 7px;border-radius:9999px;font-size:.68rem;font-weight:600}
.cb.down{background:#dcfce7;color:#166534}.cb.up{background:#fef2f2;color:#991b1b}
.cb.new{background:#eff6ff;color:#1e40af}.cb.flat{background:#f3f4f6;color:#6b7280}
.bar-chart{display:flex;align-items:stretch;gap:3px;height:180px;padding:0 4px;overflow:visible}
.bar-col{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;min-width:0;height:100%}
.bar{width:100%;border-radius:3px 3px 0 0;min-height:3px}
.bar-lbl{font-size:.6rem;color:#94a3b8;margin-top:4px;flex-shrink:0}
.c1{background:#cbd5e1}.c2{background:#fbbf24}.c3{background:#f97316}.c4{background:#ef4444}
.tbl{width:100%;border-collapse:collapse;font-size:.78rem}
.tbl th{background:#f8fafc;padding:8px 12px;text-align:left;font-size:.7rem;color:#475569;font-weight:600;border-bottom:2px solid #e2e8f0}
.tbl td{padding:7px 12px;border-bottom:1px solid #f8fafc;vertical-align:middle}
.tbl tr:last-child td{border-bottom:none}
.tbl tr:hover td{background:#fafafa}
.r{text-align:right}
.pct-bar-wrap{display:flex;align-items:center;gap:6px;min-width:100px}
.pct-text{font-size:.7rem;font-weight:600;color:#334155;min-width:38px}
.pct-bar{flex:1;background:#f1f5f9;border-radius:4px;height:8px;min-width:60px}
.pct-bar-fill{height:100%;border-radius:4px}
.pct-bar-fill.red{background:#ef4444}.pct-bar-fill.orange{background:#f97316}
.pct-bar-fill.amber{background:#eab308}.pct-bar-fill.blue{background:#3b82f6}.pct-bar-fill.gray{background:#94a3b8}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:700px){.grid-2{grid-template-columns:1fr}}
.donut-wrap{display:flex;align-items:flex-start;gap:20px;flex-wrap:wrap}
.donut{width:100px;height:100px;border-radius:50%;flex-shrink:0;background:conic-gradient(${donutGrad})}
.perf-table{width:100%;border-collapse:collapse;font-size:.78rem;margin:12px 0}
.perf-table th{background:#f1f5f9;padding:7px 10px;text-align:left;font-size:.72rem;color:#475569;font-weight:600;border-bottom:2px solid #e2e8f0}
.perf-table td{padding:7px 10px;border-bottom:1px solid #f1f5f9;vertical-align:top}
.perf-table tr:hover td{background:#fafafa}
.perf-email{font-size:.68rem;color:#94a3b8;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.perf-time{font-weight:700;color:#0f172a}
.perf-step-max{font-size:.72rem;color:#dc2626;font-weight:600}
.perf-step-ms{font-size:.68rem;color:#f97316;font-weight:400}
.perf-step-detail{font-size:.65rem;color:#64748b;font-family:monospace;white-space:pre-wrap;max-width:220px}
.step-chart{margin:16px 0 4px}
.step-chart-title{font-size:.78rem;font-weight:600;color:#475569;margin-bottom:10px}
.step-row{display:flex;align-items:center;gap:8px;margin-bottom:7px}
.step-label{font-size:.68rem;color:#475569;min-width:160px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;padding-right:4px}
.step-bar-wrap{flex:1;display:flex;align-items:center;gap:8px;min-width:0}
.step-bar{height:16px;border-radius:4px;min-width:4px;flex-shrink:0}
.step-bar.red{background:#ef4444}.step-bar.orange{background:#f97316}.step-bar.amber{background:#eab308}.step-bar.blue{background:#3b82f6}
.step-bar-val{font-size:.65rem;color:#64748b;white-space:nowrap}
.insights-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
.insight-card{border-radius:8px;padding:14px 16px;border-left:4px solid #e2e8f0}
.insight-card.danger{border-color:#ef4444;background:#fff5f5}
.insight-card.warning{border-color:#f97316;background:#fff7ed}
.insight-card.spike{border-color:#eab308;background:#fefce8}
.insight-card.healthy{border-color:#10b981;background:#f0fdf4}
.insight-card .icon{font-size:1.1rem;margin-bottom:6px}
.insight-card h4{font-size:.8rem;font-weight:700;color:#0f172a;margin-bottom:4px}
.insight-card p{font-size:.73rem;color:#475569;line-height:1.5}
.section-sep{height:8px}
.footer{text-align:center;padding:24px;color:#94a3b8;font-size:.72rem}
</style>
</head>
<body>
<div class="page">

<div class="rpt-header">
  <h1>WD Kibana Daily Log Report — ${TODAY}</h1>
  <div class="meta">
    <span>📅 Period: ${YESTERDAY} 09:00 IST → ${TODAY} 09:00 IST</span>
    <span>📊 Index: ${INDICES.replace(/,/g, " / ")}</span>
    <span>⚖️ Compared to: ${DAY_BEFORE} 09:00 IST → ${YESTERDAY} 09:00 IST</span>
    <span>🕐 Generated: ${genUtc} UTC (${genIst} IST)</span>
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>📋 Executive Summary</h2><span class="subtitle">Total docs: ${fmtNum(total)} vs ${fmtNum(prevTotal)} prev day</span></div>
  <div class="card-body">
    <div class="exec-grid">
      <div class="exec-card total"><div class="label">Total Events</div><div class="value">${link(u("total"), fmtNum(total))}</div><div class="change">${vsBadge(total, prevTotal)} vs prev ${fmtNum(prevTotal)}</div></div>
      <div class="exec-card error"><div class="label">Errors</div><div class="value">${link(u("errors"), fmtNum(errors))}</div><div class="change">${vsBadge(errors, prevErrors)} vs prev ${fmtNum(prevErrors)}</div></div>
      <div class="exec-card fatal"><div class="label">Fatals</div><div class="value">${link(u("fatals"), fmtNum(fatals))}</div><div class="change">${vsBadge(fatals, prevFatals)} vs prev ${fmtNum(prevFatals)}</div></div>
      <div class="exec-card warning"><div class="label">Warnings</div><div class="value">${link(u("warnings"), fmtNum(warnings))}</div><div class="change">${vsBadge(warnings, prevWarnings)} vs prev ${fmtNum(prevWarnings)}</div></div>
      <div class="exec-card info"><div class="label">Info</div><div class="value">${link(u("info"), fmtNum(info))}</div><div class="change">${vsBadge(info, prevInfo)} vs prev ${fmtNum(prevInfo)}</div></div>
      <div class="exec-card rate"><div class="label">Error Rate</div><div class="value">${errorRate}%</div><div class="change">${rateBadge} vs prev ${prevErrorRate}%</div></div>
    </div>
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>⏱ Hourly Error Timeline (IST)</h2><span class="subtitle">Peak: ${fmtNum(peakCount)} errors at ${String(peakHour).padStart(2, "0")}:00 IST</span></div>
  <div class="card-body">
    ${errors === 0 ? '<p><em>No error events found in this period</em></p>' : `<div class="bar-chart">${barsHtml}</div>`}
    <div style="font-size:.68rem;color:#94a3b8;margin-top:8px;display:flex;gap:16px;flex-wrap:wrap">
      <span><span style="width:10px;height:10px;background:#cbd5e1;border-radius:2px;display:inline-block"></span> &lt;10% of peak</span>
      <span><span style="width:10px;height:10px;background:#fbbf24;border-radius:2px;display:inline-block"></span> 10-25%</span>
      <span><span style="width:10px;height:10px;background:#f97316;border-radius:2px;display:inline-block"></span> 25-60%</span>
      <span><span style="width:10px;height:10px;background:#ef4444;border-radius:2px;display:inline-block"></span> &gt;60% (peak)</span>
    </div>
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>🔍 Error Breakdown</h2><span class="subtitle">${fmtNum(errors)} total errors</span></div>
  <div class="card-body">
    <div class="grid-2">
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Module</div>
        <table class="tbl"><thead><tr><th>Module</th><th class="r">Count</th><th>% of Errors</th><th>vs Prev</th></tr></thead><tbody>${moduleRows}</tbody></table></div>
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Store</div>
        <table class="tbl"><thead><tr><th>Store</th><th class="r">Count</th><th>%</th><th>vs Prev</th></tr></thead><tbody>${storeRows}</tbody></table></div>
    </div>
    <div class="section-sep"></div>
    <div class="grid-2">
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Tag</div>
        <table class="tbl"><thead><tr><th>Tag</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${tagRows}</tbody></table></div>
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Process</div>
        <table class="tbl"><thead><tr><th>Process</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${procRows}</tbody></table></div>
    </div>
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>⚠️ Top Error Messages</h2><span class="subtitle">Top 15 by frequency</span></div>
  <div class="card-body"><table class="tbl"><thead><tr><th>#</th><th>Message</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${msgRows}</tbody></table></div>
</div>

<div class="card">
  <div class="card-header"><h2>👥 Top Error Subscribers</h2><span class="subtitle">Top 10 by error count</span></div>
  <div class="card-body"><table class="tbl"><thead><tr><th>#</th><th>Subscriber ID</th><th class="r">Error Count</th><th>% of Errors</th><th>vs Prev</th></tr></thead><tbody>${subRows}</tbody></table></div>
</div>

<div class="card">
  <div class="card-header"><h2>💀 Fatal Events</h2><span class="subtitle">${fmtNum(fatals)} fatal events ${vsBadge(fatals, prevFatals, true)}</span></div>
  <div class="card-body">
    <div class="grid-2">
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Message</div>
        <table class="tbl"><thead><tr><th>Message</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${fatalMsgRows}</tbody></table></div>
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Store</div>
        <div class="donut-wrap"><div class="donut"></div></div>
        <table class="tbl" style="margin-top:8px"><thead><tr><th>Store</th><th class="r">Count</th><th>%</th><th>vs Prev</th></tr></thead><tbody>${fatalStoreRows}</tbody></table></div>
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
  <div class="card-header"><h2>🏃 Shopify Payout — Performance Deep-Dive</h2><span class="subtitle">tag=Performance — ${perfPayout.runCount} runs found</span></div>
  <div class="card-body">${buildPerfSection(perfPayout, perfPayoutPrev, "PayoutPosting", "Shopify Payout", "perf_pay")}</div>
</div>

<div class="card">
  <div class="card-header"><h2>🏃 Amazon Settlement — Performance Deep-Dive</h2><span class="subtitle">tag=Performance — ${perfAmazon.runCount} runs found</span></div>
  <div class="card-body">${buildPerfSection(perfAmazon, perfAmazonPrev, "AmazonSettlementReport", "Amazon Settlement", "perf_amz")}</div>
</div>

<div class="card">
  <div class="card-header"><h2>💡 Actionable Insights</h2></div>
  <div class="card-body"><div class="insights-grid">${insightsHtml}</div></div>
</div>

<div class="footer">
  <p>WD Kibana Daily Log Report — Generated by WD ES Kibana automation</p>
  <p>Source: Kibana WD (${KIBANA}) | Indices: ${INDICES} | Period: ${START} → ${END} UTC</p>
  <p>Compared to: ${PREV_START} → ${PREV_END} UTC</p>
</div>

</div>
</body>
</html>`;

const outDir = join(ROOT, "reports/wd-kibana-logs");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `${TODAY}-wd-kibana-daily-report.html`);
writeFileSync(outPath, html, "utf8");
const size = Buffer.byteLength(html);
console.log(`Wrote ${outPath} (${(size / 1024).toFixed(1)} KB)`);

if (size < 30 * 1024) {
  console.error(`ERROR: Report size ${size} bytes < 30 KB minimum`);
  process.exit(1);
}

// Summary for stdout
console.log(JSON.stringify({
  date: TODAY,
  total,
  errors,
  fatals,
  warnings,
  info,
  errorRate,
  prevTotal,
  prevErrors,
  prevFatals,
  peakHour,
  peakCount,
  payProcessed,
  amzTotal,
  perfPayoutRuns: perfPayout.runCount,
  perfAmazonRuns: perfAmazon.runCount,
  outPath,
  sizeKB: (size / 1024).toFixed(1),
}));
