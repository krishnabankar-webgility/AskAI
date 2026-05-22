#!/usr/bin/env node
/**
 * Generate WD Kibana daily HTML report (all 13 sections).
 * Usage: KIBANA_WD_AUTH=user:pass node generate-wd-kibana-daily-report.mjs
 */
import { writeFileSync, unlinkSync, readdirSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KIBANA = "https://kibana-wd.webgility.com";
const INDEX_ID = "61237d60-0ed9-11eb-816a-cde07dc15a1f";
const AUTH = process.env.KIBANA_WD_AUTH;
const REPO_ROOT = resolve(__dirname, "../..");
const REPORTS_DIR = join(REPO_ROOT, "reports/wd-kibana-logs");

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

function fmtDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmtIndex(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `webgilitydesktop-${y}.${m}.${day}`;
}

const now = new Date();
const today9 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 30, 0));
if (now < today9) today9.setUTCDate(today9.getUTCDate() - 1);
const yesterday9 = new Date(today9);
yesterday9.setUTCDate(yesterday9.getUTCDate() - 1);
const dayBefore9 = new Date(yesterday9);
dayBefore9.setUTCDate(dayBefore9.getUTCDate() - 1);

const START = yesterday9.toISOString();
const END = today9.toISOString();
const PREV_START = dayBefore9.toISOString();
const PREV_END = yesterday9.toISOString();

const TODAY = fmtDate(today9);
const YESTERDAY = fmtDate(yesterday9);
const DAY_BEFORE = fmtDate(dayBefore9);
const INDICES = `${fmtIndex(yesterday9)},${fmtIndex(today9)}`;
const PREV_INDICES = `${fmtIndex(dayBefore9)},${fmtIndex(yesterday9)}`;

async function esSearch(indices, body) {
  const path = encodeURIComponent(`${indices}/_search`);
  const url = `${KIBANA}/api/console/proxy?path=${path}&method=POST`;
  const r = await fetch(url, { method: "POST", headers: HDR, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`ES ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
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
        aggs: { by_hour: { date_histogram: { field: "timestamp", fixed_interval: "1h", min_doc_count: 0 } } },
      },
      by_module: {
        filter: { term: { "level.keyword": "Error" } },
        aggs: { items: { terms: { field: "module.keyword", size: 15, missing: "Unknown" } } },
      },
      by_store: {
        filter: { term: { "level.keyword": "Error" } },
        aggs: { items: { terms: { field: "store.keyword", size: 20, missing: "Unknown" } } },
      },
      by_tag: {
        filter: { term: { "level.keyword": "Error" } },
        aggs: { items: { terms: { field: "tag.keyword", size: 15, missing: "Unknown" } } },
      },
      by_process: {
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
        aggs: { items: { terms: { field: "store.keyword", size: 15, missing: "Unknown" } } },
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
        combine_script: "return ['total_time': state.total_time, 'per_record_times': state.per_record_times]",
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
        must: [{ range: { timestamp: { gte, lt } } }, { term: { "module.keyword": "AmazonSettlementReport" } }],
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

function levelMap(aggs) {
  const m = {};
  for (const b of aggs?.by_level?.buckets ?? []) m[b.key] = b.doc_count;
  return m;
}
function buckets(agg, name = "items") {
  return agg?.[name]?.buckets ?? agg?.buckets ?? [];
}
function totalHits(r) {
  const t = r.hits?.total;
  return typeof t === "object" ? t.value : t ?? 0;
}

function pctChange(cur, prev) {
  if (prev == null || prev === undefined) return { cls: "new", text: "NEW" };
  if (prev === 0 && cur === 0) return { cls: "flat", text: "≈" };
  if (prev === 0) return { cls: "new", text: "NEW" };
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) <= 10) return { cls: "flat", text: "≈" };
  const sign = pct > 0 ? "↑" : "↓";
  return { cls: pct > 0 ? "up" : "down", text: `${sign}${Math.abs(pct).toFixed(1)}%` };
}

function badge(b) {
  return `<span class="cb ${b.cls}">${esc(b.text)}</span>`;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtNum(n) {
  return (n ?? 0).toLocaleString("en-US");
}

function fmtDurSec(s) {
  if (s < 60) return `${s.toFixed(1)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
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

function pctBar(pct, thresholds = [50, 20, 10, 5]) {
  const colors = ["red", "orange", "amber", "blue", "gray"];
  let c = "gray";
  if (pct > thresholds[0]) c = "red";
  else if (pct > thresholds[1]) c = "orange";
  else if (pct > thresholds[2]) c = "amber";
  else if (pct > thresholds[3]) c = "blue";
  const label = pct < 0.1 ? "&lt;0.1%" : `${pct.toFixed(1)}%`;
  return `<div class="pct-bar-wrap"><span class="pct-text">${label}</span><div class="pct-bar"><div class="pct-bar-fill ${c}" style="width:${Math.min(pct, 100)}%"></div></div></div>`;
}

function barColor(pctOfMax) {
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

function kqlEsc(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function discoverPath(kql, from, to) {
  const q = kql.replace(/'/g, "\\'");
  return `/app/kibana#/discover?_g=(refreshInterval:(pause:!t,value:0),time:(from:'${from}',to:'${to}'))&_a=(columns:!(timestamp,level,message,store,module,subscriberID),index:'${INDEX_ID}',interval:auto,query:(language:kuery,query:'${q}'),sort:!(!(timestamp,desc)))`;
}

const urlCache = new Map();
async function shortUrl(kql, from = START, to = END) {
  const key = `${from}|${to}|${kql}`;
  if (urlCache.has(key)) return urlCache.get(key);
  const path = discoverPath(kql, from, to);
  try {
    const r = await fetch(`${KIBANA}/api/shorten_url`, {
      method: "POST",
      headers: HDR,
      body: JSON.stringify({ url: path }),
      signal: AbortSignal.timeout(15000),
    });
    if (r.ok) {
      const j = await r.json();
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
  const out = [];
  const batchSize = 15;
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    out.push(...(await Promise.all(chunk.map((it) => shortUrl(it.kql, it.from, it.to)))));
  }
  return out;
}

function parsePerfDoc(src) {
  const detail = src.detail || "";
  const message = src.message || "";
  let totalTime = 0;
  const m1 = detail.match(/Total Time:\s*(\d+)\s*ms/);
  const m2 = message.match(/Total Time:\s*(\d+),\s*ms/);
  if (m1) totalTime = parseInt(m1[1], 10);
  else if (m2) totalTime = parseInt(m2[1], 10);

  const steps = [];
  const stepRe = /^Step\s+(\d+):\s+(.+?):\s+(\d+)\s+ms(?:\s+\|\s+Records:\s+(\d+))?/gm;
  let sm;
  while ((sm = stepRe.exec(detail)) !== null) {
    steps.push({ num: parseInt(sm[1], 10), name: sm[2].trim(), ms: parseInt(sm[3], 10), records: sm[4] ? parseInt(sm[4], 10) : 0 });
  }
  steps.sort((a, b) => a.num - b.num);
  let maxStep = { name: "—", ms: 0 };
  for (const s of steps) if (s.ms > maxStep.ms) maxStep = s;
  return {
    subscriberID: src.subscriberID,
    email: src.email || "",
    processedRecords: src.processedRecords || 0,
    totalTime,
    steps,
    maxStep,
    process: src.process || "",
  };
}

function aggregatePerf(hits) {
  const docs = hits.map((h) => parsePerfDoc(h._source));
  const bySub = new Map();
  for (const d of docs) {
    const id = d.subscriberID;
    if (!bySub.has(id))
      bySub.set(id, { id, email: d.email, runs: 0, totalTime: 0, transactions: 0, maxStep: d.maxStep, allSteps: [] });
    const s = bySub.get(id);
    s.runs++;
    s.totalTime += d.totalTime;
    s.transactions += d.processedRecords;
    if (d.maxStep.ms > s.maxStep.ms) s.maxStep = d.maxStep;
    s.allSteps.push(...d.steps);
    if (!s.email && d.email) s.email = d.email;
  }
  const top5 = [...bySub.values()].sort((a, b) => b.totalTime - a.totalTime).slice(0, 5);
  const stepStats = new Map();
  for (const d of docs) {
    for (const st of d.steps) {
      if (!stepStats.has(st.name)) stepStats.set(st.name, { num: st.num, name: st.name, count: 0, totalMs: 0, maxMs: 0, minMs: Infinity });
      const ss = stepStats.get(st.name);
      ss.count++;
      ss.totalMs += st.ms;
      ss.maxMs = Math.max(ss.maxMs, st.ms);
      ss.minMs = Math.min(ss.minMs, st.ms);
    }
  }
  const stepList = [...stepStats.values()].sort((a, b) => a.num - b.num);
  return { docs, top5, stepList, runCount: docs.length };
}

function shortenMsg(msg, max = 55) {
  if (!msg) return "(empty)";
  if (msg.length <= max) return msg;
  const parts = {
    "The fractional part of the provided time value overflows the scale of the corresponding column.": "Fractional time value overflow",
    "This application is not allowed to log into this QuickBooks company data file automatically.": "App not allowed to log into QB file",
    "There is an invalid use of the QuickBooks company data file.": "QB file open in different mode",
    "QuickBooks does not support multiple users of the same application.": "QB not supported with multiple users",
    "A modal dialog box is showing in the QuickBooks user interface.": "Modal dialog in QB UI",
  };
  for (const [k, v] of Object.entries(parts)) if (msg.includes(k.slice(0, 30))) return v;
  return msg.length > max ? msg.slice(0, max) + "…" : msg;
}

function donutGradient(storeBuckets, total) {
  const colors = {
    Shopify: "#96bf48",
    WooCommerce: "#7f54b3",
    BigCommerce: "#2196F3",
    AmazonMarketPlace: "#ff9900",
    Magento: "#ee672d",
    Magento2: "#ee672d",
    eBay: "#e53238",
    Walmart: "#0071ce",
    Etsy: "#f56400",
  };
  let deg = 0;
  const stops = [];
  const top = storeBuckets.slice(0, 5);
  const topSum = top.reduce((s, b) => s + b.doc_count, 0);
  for (const b of top) {
    const pct = (b.doc_count / total) * 360;
    const c = colors[b.key] || "#94a3b8";
    stops.push(`${c} ${deg}deg ${deg + pct}deg`);
    deg += pct;
  }
  if (deg < 360) stops.push(`#94a3b8 ${deg}deg 360deg`);
  return stops.join(", ");
}

function istHourFromUtc(iso) {
  const d = new Date(iso);
  const ist = new Date(d.getTime() + 5.5 * 3600000);
  return ist.getUTCHours();
}

const CSS = `*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f8fafc;color:#1e293b;font-size:.85rem}
a{color:#2563eb;text-decoration:none}a:hover{text-decoration:underline}
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
.exec-card .value{font-size:1.5rem;font-weight:800;color:#0f172a}.exec-card .value a{color:inherit}
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
.tbl tr:last-child td{border-bottom:none}.tbl tr:hover td{background:#fafafa}.r{text-align:right}
.pct-bar-wrap{display:flex;align-items:center;gap:6px;min-width:100px}
.pct-text{font-size:.7rem;font-weight:600;color:#334155;min-width:38px}
.pct-bar{flex:1;background:#f1f5f9;border-radius:4px;height:8px;min-width:60px}
.pct-bar-fill{height:100%;border-radius:4px}
.pct-bar-fill.red{background:#ef4444}.pct-bar-fill.orange{background:#f97316}.pct-bar-fill.amber{background:#eab308}
.pct-bar-fill.blue{background:#3b82f6}.pct-bar-fill.gray{background:#94a3b8}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:700px){.grid-2{grid-template-columns:1fr}}
.donut-wrap{display:flex;align-items:flex-start;gap:20px;flex-wrap:wrap}
.donut{width:100px;height:100px;border-radius:50%;flex-shrink:0}
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
.nodata{padding:24px;text-align:center;color:#94a3b8;font-size:.85rem}`;

async function main() {
  console.log(`Report: ${TODAY} | Window: ${START} → ${END}`);
  console.log(`Indices: ${INDICES}`);

  const [q1, q2, q3, q3prev, q4, q4prev, q5, q5prev, q6, q6prev] = await Promise.all([
    esSearch(INDICES, mainAgg(START, END)),
    esSearch(PREV_INDICES, mainAgg(PREV_START, PREV_END)),
    esSearch(INDICES, payoutQuery(START, END, true)).catch(() => esSearch(INDICES, payoutQuery(START, END, false))),
    esSearch(PREV_INDICES, payoutQuery(PREV_START, PREV_END, true)).catch(() => esSearch(PREV_INDICES, payoutQuery(PREV_START, PREV_END, false))),
    esSearch(INDICES, amazonQuery(START, END)),
    esSearch(PREV_INDICES, amazonQuery(PREV_START, PREV_END)),
    esSearch(INDICES, perfQuery(START, END, "PayoutPosting", "Payout_PerformanceSummary")).then(async (r) => {
      if ((r.hits?.hits?.length ?? 0) === 0) {
        const fb = {
          query: {
            bool: {
              must: [
                { range: { timestamp: { gte: START, lt: END } } },
                { term: { "module.keyword": "PayoutPosting" } },
                { term: { "tag.keyword": "Performance" } },
              ],
            },
          },
          size: 200,
          sort: [{ timestamp: "desc" }],
          _source: ["timestamp", "subscriberID", "profileId", "email", "detail", "message", "processedRecords", "baseUrl", "process", "methodType", "tag"],
        };
        return esSearch(INDICES, fb);
      }
      return r;
    }),
    esSearch(PREV_INDICES, perfQuery(PREV_START, PREV_END, "PayoutPosting", "Payout_PerformanceSummary")),
    esSearch(INDICES, perfQuery(START, END, "AmazonSettlementReport", "Settlement_PerformanceSummary")).then(async (r) => {
      if ((r.hits?.hits?.length ?? 0) === 0) {
        const fb = {
          query: {
            bool: {
              must: [
                { range: { timestamp: { gte: START, lt: END } } },
                { term: { "module.keyword": "AmazonSettlementReport" } },
                { term: { "tag.keyword": "Performance" } },
              ],
            },
          },
          size: 200,
          sort: [{ timestamp: "desc" }],
          _source: ["timestamp", "subscriberID", "profileId", "email", "detail", "message", "processedRecords", "baseUrl", "process", "methodType", "tag"],
        };
        return esSearch(INDICES, fb);
      }
      return r;
    }),
    esSearch(PREV_INDICES, perfQuery(PREV_START, PREV_END, "AmazonSettlementReport", "Settlement_PerformanceSummary")),
  ]);

  const total = totalHits(q1);
  if (total === 0) {
    console.warn("Q1 returned 0 total hits — proceeding with placeholders");
  }

  const lv = levelMap(q1.aggregations);
  const lvPrev = levelMap(q2.aggregations);
  const errors = lv.Error ?? 0;
  const errorsPrev = lvPrev.Error ?? 0;
  const fatals = lv.Fatal ?? 0;
  const fatalsPrev = lvPrev.Fatal ?? 0;
  const warnings = lv.Warning ?? 0;
  const warningsPrev = lvPrev.Warning ?? 0;
  const info = lv.Info ?? 0;
  const infoPrev = lvPrev.Info ?? 0;
  const errorRate = total ? (errors / total) * 100 : 0;
  const errorRatePrev = totalHits(q2) ? (errorsPrev / totalHits(q2)) * 100 : 0;

  const prevMap = (buckets, keyFn = (b) => b.key) => {
    const m = new Map();
    for (const b of buckets) m.set(keyFn(b), b.doc_count);
    return m;
  };

  const modBuckets = buckets(q1.aggregations.by_module);
  const modPrev = prevMap(buckets(q2.aggregations.by_module));
  const storeBuckets = buckets(q1.aggregations.by_store);
  const storePrev = prevMap(buckets(q2.aggregations.by_store));
  const tagBuckets = buckets(q1.aggregations.by_tag);
  const tagPrev = prevMap(buckets(q2.aggregations.by_tag));
  const procBuckets = buckets(q1.aggregations.by_process);
  const procPrev = prevMap(buckets(q2.aggregations.by_process));
  const msgBuckets = buckets(q1.aggregations.top_messages);
  const msgPrev = prevMap(buckets(q2.aggregations.top_messages));
  const subBuckets = buckets(q1.aggregations.top_subscribers);
  const subPrev = prevMap(buckets(q2.aggregations.top_subscribers), (b) => String(b.key));
  const fatalMsgBuckets = buckets(q1.aggregations.fatals_by_message);
  const fatalMsgPrev = prevMap(buckets(q2.aggregations.fatals_by_message));
  const fatalStoreBuckets = buckets(q1.aggregations.fatals_by_store);
  const fatalStorePrev = prevMap(buckets(q2.aggregations.fatals_by_store));

  // Hourly IST chart — 24 bars from 9..23,0..8
  const hourlyBuckets = q1.aggregations?.errors_hourly?.by_hour?.buckets ?? [];
  const hourCounts = Array(24).fill(0);
  for (const b of hourlyBuckets) {
    const h = istHourFromUtc(b.key_as_string || b.key);
    hourCounts[h] += b.doc_count;
  }
  const istOrder = [...Array(15).keys()].slice(9).concat([...Array(9).keys()]);
  const istLabels = istOrder.map((h) => String(h).padStart(2, "0"));
  const chartCounts = istOrder.map((h) => hourCounts[h]);
  const maxHour = Math.max(...chartCounts, 1);
  const peakIdx = chartCounts.indexOf(Math.max(...chartCounts));
  const peakHour = istLabels[peakIdx];
  const peakCount = chartCounts[peakIdx];

  // Collect all KQL for short URLs
  const linkItems = [];
  const addLink = (id, kql, from = START, to = END) => {
    linkItems.push({ id, kql, from, to });
    return id;
  };

  addLink("total", "");
  addLink("errors", 'level.keyword:"Error"');
  addLink("fatals", 'level.keyword:"Fatal"');
  addLink("warnings", 'level.keyword:"Warning"');
  addLink("info", 'level.keyword:"Info"');

  for (const b of modBuckets)
    addLink(`mod-${b.key}`, `level.keyword:"Error" AND module.keyword:"${kqlEsc(b.key)}"`);
  for (const b of storeBuckets)
    addLink(`store-${b.key}`, `level.keyword:"Error" AND store.keyword:"${kqlEsc(b.key)}"`);
  for (const b of tagBuckets)
    if (b.key !== "Unknown") addLink(`tag-${b.key}`, `level.keyword:"Error" AND tag.keyword:"${kqlEsc(b.key)}"`);
  for (const b of procBuckets)
    if (b.key !== "Unknown") addLink(`proc-${b.key}`, `level.keyword:"Error" AND process.keyword:"${kqlEsc(b.key)}"`);
  for (const b of msgBuckets)
    addLink(`msg-${b.key}`, `level.keyword:"Error" AND message.keyword:"${kqlEsc(b.key)}"`);
  for (const b of subBuckets)
    addLink(`sub-${b.key}`, `level.keyword:"Error" AND subscriberID:${b.key}`);
  for (const b of fatalMsgBuckets)
    addLink(`fmsg-${b.key}`, `level.keyword:"Fatal" AND message.keyword:"${kqlEsc(b.key)}"`);
  for (const b of fatalStoreBuckets)
    addLink(`fstore-${b.key}`, `level.keyword:"Fatal" AND store.keyword:"${kqlEsc(b.key)}"`);

  addLink("payout-all", 'store.keyword:"Shopify" AND module.keyword:"PayoutPosting"');
  const payoutAggs = q3.aggregations ?? {};
  const payoutSubs = payoutAggs.by_subscriber?.buckets ?? [];
  for (const b of payoutSubs)
    addLink(`payout-sub-${b.key}`, `level.keyword:"Info" AND module.keyword:"PayoutPosting" AND subscriberID:${b.key}`);

  addLink("amazon-all", 'module.keyword:"AmazonSettlementReport"');
  addLink("amazon-err", 'level.keyword:"Error" AND module.keyword:"AmazonSettlementReport"');
  const amazonTotal = totalHits(q4);
  const amazonPrevTotal = totalHits(q4prev);
  const amazonLv = levelMap(q4.aggregations);
  const amazonLvPrev = levelMap(q4prev.aggregations);
  const amazonErrMsgs = q4.aggregations?.top_errors?.by_message?.buckets ?? [];
  const amazonSubs = q4.aggregations?.top_subscribers?.buckets ?? [];
  const amazonSubsPrev = new Map((q4prev.aggregations?.top_subscribers?.buckets ?? []).map((b) => [String(b.key), b.doc_count]));
  for (const b of amazonErrMsgs)
    addLink(`amz-msg-${b.key}`, `level.keyword:"Error" AND module.keyword:"AmazonSettlementReport" AND message.keyword:"${kqlEsc(b.key)}"`);
  for (const b of amazonSubs)
    addLink(`amz-sub-${b.key}`, `module.keyword:"AmazonSettlementReport" AND subscriberID:${b.key}`);

  const perfPayout = aggregatePerf(q5.hits?.hits ?? []);
  const perfPayoutPrev = aggregatePerf(q5prev.hits?.hits ?? []);
  const perfAmazon = aggregatePerf(q6.hits?.hits ?? []);
  const perfAmazonPrev = aggregatePerf(q6prev.hits?.hits ?? []);

  for (const s of perfPayout.top5)
    addLink(`perf-pay-${s.id}`, `tag.keyword:"Performance" AND module.keyword:"PayoutPosting" AND subscriberID:${s.id}`);
  for (const s of perfAmazon.top5)
    addLink(`perf-amz-${s.id}`, `tag.keyword:"Performance" AND module.keyword:"AmazonSettlementReport" AND subscriberID:${s.id}`);

  console.log(`Generating ${linkItems.length} short URLs...`);
  const urls = await shortUrlsBatch(linkItems);
  const linkUrl = Object.fromEntries(linkItems.map((it, i) => [it.id, urls[i]]));

  const genAt = new Date();
  const genUtc = genAt.toISOString().slice(0, 16).replace("T", " ");
  const genIstH = genAt.getUTCHours() + 5;
  const genIstM = genAt.getUTCMinutes() + 30;
  const genIst = `${String(Math.floor((genIstH + Math.floor(genIstM / 60)) % 24)).padStart(2, "0")}:${String(genIstM % 60).padStart(2, "0")} IST`;

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WD Kibana Daily Log Report — ${TODAY}</title>
<style>${CSS}</style>
</head>
<body>
<div class="page">

<!-- SECTION 1 -->
<div class="rpt-header">
  <h1>WD Kibana Daily Log Report — ${TODAY}</h1>
  <div class="meta">
    <span>📅 Period: ${YESTERDAY} 09:00 IST → ${TODAY} 09:00 IST</span>
    <span>📊 Index: ${INDICES.replace(/,/g, " / ")}</span>
    <span>⚖️ Compared to: ${DAY_BEFORE} 09:00 IST → ${YESTERDAY} 09:00 IST</span>
    <span>🕐 Generated: ${genUtc} UTC (${genIst})</span>
  </div>
</div>

<!-- SECTION 2 -->
<div class="card">
  <div class="card-header">
    <h2>📋 Executive Summary</h2>
    <span class="subtitle">Total docs: ${fmtNum(total)} vs ${fmtNum(totalHits(q2))} prev day</span>
  </div>
  <div class="card-body">
    <div class="exec-grid">
      <div class="exec-card total">
        <div class="label">Total Events</div>
        <div class="value"><a href="${linkUrl.total}" target="_blank">${fmtNum(total)}</a></div>
        <div class="change">${badge(pctChange(total, totalHits(q2)))} vs prev ${fmtNum(totalHits(q2))}</div>
      </div>
      <div class="exec-card error">
        <div class="label">Errors</div>
        <div class="value"><a href="${linkUrl.errors}" target="_blank">${fmtNum(errors)}</a></div>
        <div class="change">${badge(pctChange(errors, errorsPrev))} vs prev ${fmtNum(errorsPrev)}</div>
      </div>
      <div class="exec-card fatal">
        <div class="label">Fatals</div>
        <div class="value"><a href="${linkUrl.fatals}" target="_blank">${fmtNum(fatals)}</a></div>
        <div class="change">${badge(pctChange(fatals, fatalsPrev))} vs prev ${fmtNum(fatalsPrev)}</div>
      </div>
      <div class="exec-card warning">
        <div class="label">Warnings</div>
        <div class="value"><a href="${linkUrl.warnings}" target="_blank">${fmtNum(warnings)}</a></div>
        <div class="change">${badge(pctChange(warnings, warningsPrev))} vs prev ${fmtNum(warningsPrev)}</div>
      </div>
      <div class="exec-card info">
        <div class="label">Info</div>
        <div class="value"><a href="${linkUrl.info}" target="_blank">${fmtNum(info)}</a></div>
        <div class="change">${badge(pctChange(info, infoPrev))} vs prev ${fmtNum(infoPrev)}</div>
      </div>
      <div class="exec-card rate">
        <div class="label">Error Rate</div>
        <div class="value">${errorRate.toFixed(2)}%</div>
        <div class="change">${badge(pctChange(errorRate, errorRatePrev))} vs prev ${errorRatePrev.toFixed(2)}%</div>
      </div>
    </div>
  </div>
</div>

<!-- SECTION 3 -->
<div class="card">
  <div class="card-header">
    <h2>⏱ Hourly Error Timeline (IST)</h2>
    <span class="subtitle">Peak: ${fmtNum(peakCount)} errors at ${peakHour}:00 IST | 24h window: ${YESTERDAY} 09:00 → ${TODAY} 09:00 IST</span>
  </div>
  <div class="card-body">
`;

  if (errors === 0) {
    html += `<div class="nodata">No error events found in this period</div>`;
  } else {
    html += `<div class="bar-chart">`;
    for (let i = 0; i < 24; i++) {
      const cnt = chartCounts[i];
      const pct = Math.max((cnt / maxHour) * 100, cnt > 0 ? 0.1 : 0.1);
      const cls = barColor((cnt / maxHour) * 100);
      html += `<div class="bar-col"><div class="bar ${cls}" style="height:${pct.toFixed(1)}%" title="${istLabels[i]}:00 IST — ${cnt} errors"></div><div class="bar-lbl">${istLabels[i]}</div></div>`;
    }
    html += `</div>`;
  }

  html += `
  </div>
</div>

<!-- SECTION 4 -->
<div class="card">
  <div class="card-header">
    <h2>🔍 Error Breakdown</h2>
    <span class="subtitle">${fmtNum(errors)} total errors — by Module, Store, Tag, Process</span>
  </div>
  <div class="card-body">
`;

  if (errors === 0) {
    html += `<div class="nodata">No error events found in this period</div>`;
  } else {
    const breakdownRows = (items, prevM, errTotal, prefix, withPct = true) =>
      items
        .map((b) => {
          const pct = (b.doc_count / errTotal) * 100;
          const ch = pctChange(b.doc_count, prevM.get(b.key));
          const url = linkUrl[`${prefix}-${b.key}`] || KIBANA;
          return `<tr><td><a href="${url}" target="_blank">${esc(b.key)}</a></td><td class="r">${fmtNum(b.doc_count)}</td>${withPct ? `<td>${pctBar(pct)}</td>` : ""}<td>${badge(ch)}</td></tr>`;
        })
        .join("");

    html += `<div class="grid-2">
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Module</div>
      <table class="tbl"><thead><tr><th>Module</th><th class="r">Count</th><th>% of Errors</th><th>vs Prev</th></tr></thead><tbody>${breakdownRows(modBuckets, modPrev, errors, "mod")}</tbody></table></div>
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Store</div>
      <table class="tbl"><thead><tr><th>Store</th><th class="r">Count</th><th>% of Errors</th><th>vs Prev</th></tr></thead><tbody>${breakdownRows(storeBuckets, storePrev, errors, "store")}</tbody></table></div>
    </div><div class="section-sep"></div><div class="grid-2" style="margin-top:16px">
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Tag</div>
      <table class="tbl"><thead><tr><th>Tag</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${breakdownRows(tagBuckets.filter((b) => b.key !== "Unknown"), tagPrev, errors, "tag", false)}</tbody></table></div>
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Process</div>
      <table class="tbl"><thead><tr><th>Process</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${breakdownRows(procBuckets.filter((b) => b.key !== "Unknown"), procPrev, errors, "proc", false)}</tbody></table></div>
    </div>`;
  }

  html += `</div></div>`;

  // Section 5
  html += `<div class="card"><div class="card-header"><h2>⚠️ Top Error Messages</h2><span class="subtitle">Top 15 by frequency</span></div><div class="card-body">`;
  if (msgBuckets.length === 0) html += `<div class="nodata">No data found</div>`;
  else {
    html += `<table class="tbl"><thead><tr><th>#</th><th>Message</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>`;
    msgBuckets.forEach((b, i) => {
      const url = linkUrl[`msg-${b.key}`] || KIBANA;
      html += `<tr><td>${i + 1}</td><td><a href="${url}" target="_blank">${esc(b.key)}</a></td><td class="r">${fmtNum(b.doc_count)}</td><td>${badge(pctChange(b.doc_count, msgPrev.get(b.key)))}</td></tr>`;
    });
    html += `</tbody></table>`;
  }
  html += `</div></div>`;

  // Section 6
  html += `<div class="card"><div class="card-header"><h2>👥 Top Error Subscribers</h2><span class="subtitle">Top 10 by error count</span></div><div class="card-body">`;
  if (subBuckets.length === 0) html += `<div class="nodata">No data found</div>`;
  else {
    html += `<table class="tbl"><thead><tr><th>#</th><th>Subscriber ID</th><th class="r">Error Count</th><th>% of Errors</th><th>vs Prev</th></tr></thead><tbody>`;
    subBuckets.forEach((b, i) => {
      const url = linkUrl[`sub-${b.key}`] || KIBANA;
      const pct = (b.doc_count / errors) * 100;
      html += `<tr><td>${i + 1}</td><td><a href="${url}" target="_blank">${b.key}</a></td><td class="r">${fmtNum(b.doc_count)}</td><td>${pctBar(pct)}</td><td>${badge(pctChange(b.doc_count, subPrev.get(String(b.key))))}</td></tr>`;
    });
    html += `</tbody></table>`;
  }
  html += `</div></div>`;

  // Section 7 Fatal
  html += `<div class="card"><div class="card-header"><h2>💀 Fatal Events</h2><span class="subtitle">${fmtNum(fatals)} fatal events ${badge(pctChange(fatals, fatalsPrev))}</span></div><div class="card-body">`;
  if (fatals === 0) html += `<div class="nodata">No fatal events found in this period</div>`;
  else {
    const donut = donutGradient(fatalStoreBuckets, fatals);
    html += `<div class="grid-2">
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Message</div>
      <table class="tbl"><thead><tr><th>Message</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>`;
    for (const b of fatalMsgBuckets) {
      const url = linkUrl[`fmsg-${b.key}`] || KIBANA;
      html += `<tr><td><a href="${url}" target="_blank">${esc(shortenMsg(b.key))}</a></td><td class="r">${fmtNum(b.doc_count)}</td><td>${badge(pctChange(b.doc_count, fatalMsgPrev.get(b.key)))}</td></tr>`;
    }
    html += `</tbody></table></div>
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Store</div>
      <div class="donut-wrap"><div class="donut" style="background:conic-gradient(${donut})"></div></div>
      <table class="tbl" style="margin-top:8px"><thead><tr><th>Store</th><th class="r">Count</th><th>%</th><th>vs Prev</th></tr></thead><tbody>`;
    for (const b of fatalStoreBuckets) {
      const url = linkUrl[`fstore-${b.key}`] || KIBANA;
      const pct = ((b.doc_count / fatals) * 100).toFixed(1);
      html += `<tr><td><a href="${url}" target="_blank">${esc(b.key)}</a></td><td class="r">${fmtNum(b.doc_count)}</td><td>${pct}%</td><td>${badge(pctChange(b.doc_count, fatalStorePrev.get(b.key)))}</td></tr>`;
    }
    html += `</tbody></table></div></div>`;
  }
  html += `</div></div>`;

  // Section 8 Shopify Payout
  const payoutProcessed = payoutAggs.total_processed?.value ?? 0;
  const payoutProcessedPrev = q3prev.aggregations?.total_processed?.value ?? 0;
  const payoutStats = payoutAggs.payout_time_stats?.value ?? {};
  const payoutBatches = payoutSubs.reduce((s, b) => s + (b.batch_count?.value ?? 0), 0) || payoutStats.batch_count || 0;

  html += `<div class="card"><div class="card-header"><h2>💳 Shopify Payout Performance</h2><span class="subtitle">module=PayoutPosting, store=Shopify</span></div><div class="card-body">`;
  if (payoutProcessed === 0 && payoutSubs.length === 0) {
    html += `<div class="nodata">No PayoutPosting data found for this period</div>`;
  } else {
    const minSec = payoutStats.min_per_payout_seconds ?? 0;
    const maxSec = payoutStats.max_per_payout_seconds ?? 0;
    const avgSec = payoutStats.avg_per_payout_seconds ?? 0;
    const totalSec = payoutStats.total_seconds ?? 0;
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px">
      <div class="exec-card" style="border-color:#3b82f6"><div class="label">Records Processed</div><div class="value" style="font-size:1.3rem"><a href="${linkUrl["payout-all"]}" target="_blank">${fmtNum(payoutProcessed)}</a></div><div class="change">${badge(pctChange(payoutProcessed, payoutProcessedPrev))} vs prev ${fmtNum(payoutProcessedPrev)}</div></div>
      <div class="exec-card" style="border-color:#10b981"><div class="label">Batches</div><div class="value" style="font-size:1.3rem">${fmtNum(payoutBatches)}</div></div>
      <div class="exec-card" style="border-color:#f97316"><div class="label">Min Time/Record</div><div class="value" style="font-size:1.1rem">${fmtDurSec(minSec)}</div></div>
      <div class="exec-card" style="border-color:#ef4444"><div class="label">Max Time/Record</div><div class="value" style="font-size:1.1rem">${fmtDurSec(maxSec)}</div></div>
      <div class="exec-card" style="border-color:#8b5cf6"><div class="label">Avg Time/Record</div><div class="value" style="font-size:1.1rem">${fmtDurSec(avgSec)}</div></div>
      <div class="exec-card" style="border-color:#6366f1"><div class="label">Est. Total Time</div><div class="value" style="font-size:1.1rem">${fmtDurSec(totalSec)}</div></div>
    </div>`;
    if (payoutSubs.length) {
      html += `<div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">Top 5 Subscribers by Records Processed</div>
      <table class="tbl"><thead><tr><th>#</th><th>Subscriber ID</th><th class="r">Records</th><th class="r">Batches</th><th>% of Total</th><th>vs Prev</th></tr></thead><tbody>`;
      payoutSubs.forEach((b, i) => {
        const rec = b.processed_sum?.value ?? 0;
        const pct = payoutProcessed ? (rec / payoutProcessed) * 100 : 0;
        const url = linkUrl[`payout-sub-${b.key}`] || KIBANA;
        html += `<tr><td>${i + 1}</td><td><a href="${url}" target="_blank">${b.key}</a></td><td class="r">${fmtNum(rec)}</td><td class="r">${fmtNum(b.batch_count?.value ?? 0)}</td><td>${pctBar(pct)}</td><td>${badge(pctChange(rec, null))}</td></tr>`;
      });
      html += `</tbody></table>`;
    }
  }
  html += `</div></div>`;

  // Section 9 Amazon
  const amzProcessed = q4.aggregations?.total_processed?.value || amazonLv.Info || 0;
  const amzProcessedPrev = q4prev.aggregations?.total_processed?.value || amazonLvPrev.Info || 0;
  const amzErrs = amazonLv.Error ?? 0;
  const amzErrsPrev = amazonLvPrev.Error ?? 0;
  const amzSubsCount = q4.aggregations?.unique_subscribers?.value ?? amazonSubs.length;

  html += `<div class="card"><div class="card-header"><h2>🛒 Amazon Settlement Report</h2><span class="subtitle">module=AmazonSettlementReport</span></div><div class="card-body">`;
  if (amazonTotal === 0) {
    html += `<div class="nodata">No Amazon Settlement activity found for this period</div>`;
  } else {
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px">
      <div class="exec-card" style="border-color:#3b82f6"><div class="label">Total Events</div><div class="value" style="font-size:1.3rem"><a href="${linkUrl["amazon-all"]}" target="_blank">${fmtNum(amazonTotal)}</a></div><div class="change">${badge(pctChange(amazonTotal, amazonPrevTotal))}</div></div>
      <div class="exec-card" style="border-color:#ef4444"><div class="label">Errors</div><div class="value" style="font-size:1.3rem"><a href="${linkUrl["amazon-err"]}" target="_blank">${fmtNum(amzErrs)}</a></div><div class="change">${badge(pctChange(amzErrs, amzErrsPrev))}</div></div>
      <div class="exec-card" style="border-color:#10b981"><div class="label">Settlements Processed</div><div class="value" style="font-size:1.3rem">${fmtNum(amzProcessed)}</div><div class="change">${badge(pctChange(amzProcessed, amzProcessedPrev))}</div></div>
      <div class="exec-card" style="border-color:#f97316"><div class="label">Affected Subscribers</div><div class="value" style="font-size:1.3rem">${fmtNum(amzSubsCount)}</div></div>
    </div>`;
    if (amazonErrMsgs.length) {
      html += `<div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">Top Error Messages</div>
      <table class="tbl"><thead><tr><th>Message</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>`;
      for (const b of amazonErrMsgs) {
        html += `<tr><td><a href="${linkUrl[`amz-msg-${b.key}`]}" target="_blank">${esc(b.key)}</a></td><td class="r">${fmtNum(b.doc_count)}</td><td>${badge(pctChange(b.doc_count, null))}</td></tr>`;
      }
      html += `</tbody></table>`;
    } else {
      html += `<div style="font-size:.75rem;color:#64748b;margin-bottom:12px">No error messages found for this period.</div>`;
    }
    if (amazonSubs.length) {
      html += `<div style="font-size:.78rem;font-weight:700;color:#475569;margin:16px 0 8px">Top 5 Subscribers by Total Events</div>
      <table class="tbl"><thead><tr><th>#</th><th>Subscriber ID</th><th class="r">Total Events</th><th class="r">Errors</th><th class="r">Settlements</th><th>vs Prev</th></tr></thead><tbody>`;
      amazonSubs.forEach((b, i) => {
        const lvB = Object.fromEntries((b.by_level?.buckets ?? []).map((x) => [x.key, x.doc_count]));
        const url = linkUrl[`amz-sub-${b.key}`] || KIBANA;
        html += `<tr><td>${i + 1}</td><td><a href="${url}" target="_blank">${b.key}</a></td><td class="r">${fmtNum(b.doc_count)}</td><td class="r">${fmtNum(lvB.Error ?? 0)}</td><td class="r">${fmtNum(b.processed_sum?.value ?? lvB.Info ?? 0)}</td><td>${badge(pctChange(b.doc_count, amazonSubsPrev.get(String(b.key))))}</td></tr>`;
      });
      html += `</tbody></table>`;
    }
  }
  html += `</div></div>`;

  function renderPerfSection(num, title, module, perf, perfPrev, linkPrefix) {
    let s = `<div class="card"><div class="card-header"><h2>🏃 ${title}</h2><span class="subtitle">tag=Performance — ${perf.runCount} runs found in period</span></div><div class="card-body">`;
    if (perf.runCount === 0) {
      s += `<div class="nodata">No \`${module === "PayoutPosting" ? "Payout_PerformanceSummary" : "Settlement_PerformanceSummary"}\` logs found in this period.</div>`;
    } else {
      const maxT = perf.top5[0]?.totalTime || 1;
      const prevTop = new Map(perfPrev.top5.map((x) => [String(x.id), x.totalTime]));
      s += `<div style="font-size:.8rem;font-weight:700;color:#334155;margin-bottom:12px">Sub-section A: Top 5 Clients by Total Processing Time</div><div style="overflow-x:auto"><table class="perf-table"><thead><tr><th>#</th><th>Subscriber ID</th><th>Email</th><th>Runs</th><th>Transactions</th><th>Total Time</th><th>% of Max</th><th>Slowest Step</th><th>Top 3 Steps by Time</th><th>vs Prev</th></tr></thead><tbody>`;
      perf.top5.forEach((sub, i) => {
        const pct = (sub.totalTime / maxT) * 100;
        const stepLines = [...sub.allSteps]
          .sort((a, b) => b.ms - a.ms)
          .slice(0, 3)
          .map((st) => `S${st.num}: ${fmtDurMs(st.ms)}`)
          .join("<br>");
        const prevT = prevTop.get(String(sub.id));
        const ch = prevT != null ? pctChange(sub.totalTime, prevT) : { cls: "new", text: "NEW" };
        const url = linkUrl[`${linkPrefix}-${sub.id}`] || KIBANA;
        const barC = pct > 80 ? "red" : pct > 50 ? "orange" : pct > 25 ? "amber" : "blue";
        s += `<tr><td>${i + 1}</td><td><a href="${url}" target="_blank">${sub.id}</a></td><td class="perf-email">${esc(sub.email)}</td><td class="r">${sub.runs}</td><td class="r">${fmtNum(sub.transactions)}</td><td class="r perf-time">${fmtDurMs(sub.totalTime)}</td><td><div class="pct-bar-wrap"><span class="pct-text">${pct.toFixed(1)}%</span><div class="pct-bar"><div class="pct-bar-fill ${barC}" style="width:${pct}%"></div></div></div></td><td class="perf-step-max">${esc(sub.maxStep.name)}<br><span class="perf-step-ms">${fmtDurMs(sub.maxStep.ms)}</span></td><td class="perf-step-detail">${stepLines}</td><td>${badge(ch)}</td></tr>`;
      });
      s += `</tbody></table></div>`;
      const maxAvg = Math.max(...perf.stepList.map((x) => x.totalMs / x.count), 1);
      s += `<div style="font-size:.8rem;font-weight:700;color:#334155;margin:20px 0 12px">Sub-section B: Step Performance Bar Chart — Avg Processing Time (${perf.runCount} runs)</div><div class="step-chart"><div class="step-chart-title">Avg Step Processing Time — ${title.split("—")[0].trim()} (${perf.runCount} total runs, ${YESTERDAY} 09:00 → ${TODAY} 09:00 IST)</div>`;
      for (const st of perf.stepList) {
        const avg = st.totalMs / st.count;
        const pctW = (avg / maxAvg) * 100;
        const shortName = st.name.length > 18 ? st.name.slice(0, 16) + "…" : st.name;
        s += `<div class="step-row"><div class="step-label" title="S${st.num}: ${esc(st.name)}">S${st.num}: ${esc(shortName)}</div><div class="step-bar-wrap"><div class="step-bar ${stepBarColor(pctW)}" style="width:${pctW.toFixed(1)}%"></div><span class="step-bar-val">${fmtDurMs(avg)} avg &nbsp;/&nbsp; ${fmtDurMs(st.maxMs)} max &nbsp;(${st.count} runs)</span></div></div>`;
      }
      s += `</div>`;
    }
    s += `</div></div>`;
    return s;
  }

  html += renderPerfSection(10, "Shopify Payout — Performance Deep-Dive", "PayoutPosting", perfPayout, perfPayoutPrev, "perf-pay");
  html += renderPerfSection(11, "Amazon Settlement — Performance Deep-Dive", "AmazonSettlementReport", perfAmazon, perfAmazonPrev, "perf-amz");

  // Section 12 Insights
  const topSub = subBuckets[0];
  const topStore = storeBuckets[0];
  const topMsg = msgBuckets[0];
  const insights = [];
  if (topSub)
    insights.push({
      type: "danger",
      icon: "!",
      title: `Subscriber ${topSub.key} — Top Error Source`,
      text: `${topSub.key} generated ${fmtNum(topSub.doc_count)} errors (${((topSub.doc_count / errors) * 100).toFixed(1)}% of all errors). ${badge(pctChange(topSub.doc_count, subPrev.get(String(topSub.key))))}`,
    });
  if (topStore)
    insights.push({
      type: "warning",
      icon: "↑",
      title: `${topStore.key} — Leading Error Store`,
      text: `${topStore.key} accounts for ${((topStore.doc_count / errors) * 100).toFixed(1)}% of errors (${fmtNum(topStore.doc_count)} events).`,
    });
  if (peakCount > 500)
    insights.push({
      type: "spike",
      icon: "⚡",
      title: `Error Spike at ${peakHour}:00 IST`,
      text: `Peak hour recorded ${fmtNum(peakCount)} errors — monitor scheduler and store connection jobs during overnight window.`,
    });
  if (fatals < fatalsPrev)
    insights.push({
      type: "healthy",
      icon: "✓",
      title: "Fatal Events Reduced",
      text: `Fatal events ${badge(pctChange(fatals, fatalsPrev))} (${fmtNum(fatalsPrev)} → ${fmtNum(fatals)}).`,
    });
  if (payoutProcessed > payoutProcessedPrev)
    insights.push({
      type: "healthy",
      icon: "✓",
      title: "Shopify Payout Volume Up",
      text: `Records processed ${badge(pctChange(payoutProcessed, payoutProcessedPrev))} (${fmtNum(payoutProcessedPrev)} → ${fmtNum(payoutProcessed)}).`,
    });
  if (insights.length < 4 && topMsg)
    insights.push({
      type: "spike",
      icon: "⚡",
      title: "Top Error Message",
      text: `"${topMsg.key}" — ${fmtNum(topMsg.doc_count)} occurrences (${badge(pctChange(topMsg.doc_count, msgPrev.get(topMsg.key)))}).`,
    });

  html += `<div class="card"><div class="card-header"><h2>💡 Actionable Insights</h2><span class="subtitle">Key findings and recommended actions</span></div><div class="card-body"><div class="insights-grid">`;
  for (const ins of insights.slice(0, 8)) {
    html += `<div class="insight-card ${ins.type}"><div class="icon">${ins.icon}</div><h4>${esc(ins.title)}</h4><p>${ins.text}</p></div>`;
  }
  if (!insights.length) html += `<div class="nodata">No significant anomalies detected in this period</div>`;
  html += `</div></div></div>`;

  // Section 13 Footer
  html += `<div class="card" style="background:#f8fafc"><div class="card-body" style="padding:12px 20px;font-size:.72rem;color:#94a3b8;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px">
    <span>📊 Source: Kibana WD — <a href="${KIBANA}" target="_blank">kibana-wd.webgility.com</a> | Index: ${INDICES.replace(/,/g, " / ")}</span>
    <span>⏰ Generated: ${genUtc} UTC | Report Period: ${START} → ${END}</span>
    <span>🤖 Automated by WD ES Kibana Cloud Agent</span>
  </div></div>

</div>
</body>
</html>`;

  const outPath = join(REPORTS_DIR, `${TODAY}-wd-kibana-daily-report.html`);
  writeFileSync(outPath, html, "utf8");
  const size = Buffer.byteLength(html, "utf8");
  console.log(`Wrote ${outPath} (${size} bytes)`);

  if (size < 30000) {
    console.error(`HALT: Report size ${size} < 30KB — likely incomplete`);
    process.exit(1);
  }

  // Cleanup temp files
  for (const f of readdirSync(REPORTS_DIR)) {
    if (/^(gen-|q\d|short-urls|computed)/.test(f) || /-to-.*-daily-log-report\.md$/.test(f)) {
      try {
        unlinkSync(join(REPORTS_DIR, f));
        console.log(`Deleted temp: ${f}`);
      } catch {}
    }
  }

  const branch = process.env.GIT_BRANCH || "cursor/daily-wd-kibana-log-report-5f70";
  const preview = `https://htmlpreview.github.io/?https://github.com/krishnabankar-webgility/AskAI/blob/${branch}/reports/wd-kibana-logs/${TODAY}-wd-kibana-daily-report.html`;
  console.log("PREVIEW_URL:", preview);
  console.log("SUMMARY:", JSON.stringify({ today: TODAY, total, errors, fatals, peakHour, peakCount, sizeKb: (size / 1024).toFixed(1) }));
}

main().catch((e) => {
  console.error("HALT:", e.message);
  process.exit(1);
});
