#!/usr/bin/env node
/**
 * Generate WD Kibana daily HTML report via Kibana WD HTTPS API.
 * Usage: KIBANA_WD_AUTH=user:pass node generate-daily-html-report.mjs [report-date YYYY-MM-DD]
 */
import { mkdirSync, writeFileSync, unlinkSync, readdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = resolve(__dirname, "../../reports/wd-kibana-logs");
const KIBANA = "https://kibana-wd.webgility.com";
const INDEX_ID = "61237d60-0ed9-11eb-816a-cde07dc15a1f";
const AUTH = process.env.KIBANA_WD_AUTH;

if (!AUTH) {
  console.error("HALT: KIBANA_WD_AUTH not set");
  process.exit(1);
}

const b64 = Buffer.from(AUTH).toString("base64");
const HDR = {
  Authorization: `Basic ${b64}`,
  "kbn-xsrf": "true",
  "Content-Type": "application/json",
};

function parseReportDate() {
  const arg = process.argv[2];
  if (arg) return arg;
  const now = new Date();
  const today930 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 30, 0));
  if (now < today930) today930.setUTCDate(today930.getUTCDate() - 1);
  return today930.toISOString().slice(0, 10);
}

const REPORT_DATE = parseReportDate();
const [y, m, d] = REPORT_DATE.split("-").map(Number);
const endUtc = new Date(Date.UTC(y, m - 1, d, 3, 30, 0));
const startUtc = new Date(endUtc);
startUtc.setUTCDate(startUtc.getUTCDate() - 1);
const prevEndUtc = new Date(startUtc);
const prevStartUtc = new Date(startUtc);
prevStartUtc.setUTCDate(prevStartUtc.getUTCDate() - 1);

const START = startUtc.toISOString();
const END = endUtc.toISOString();
const PREV_START = prevStartUtc.toISOString();
const PREV_END = prevEndUtc.toISOString();

function idxDate(dt) {
  const x = new Date(dt);
  return `webgilitydesktop-${x.getUTCFullYear()}.${String(x.getUTCMonth() + 1).padStart(2, "0")}.${String(x.getUTCDate()).padStart(2, "0")}`;
}

const idxEnd = idxDate(endUtc);
const idxStart = idxDate(startUtc);
const idxPrevStart = idxDate(prevStartUtc);
const INDICES_TODAY = `${idxStart},${idxEnd}`;
const INDICES_PREV = `${idxPrevStart},${idxStart}`;

async function esSearch(indices, body) {
  const esPath = `${indices}/_search?ignore_unavailable=true&allow_no_indices=true`;
  const url = `${KIBANA}/api/console/proxy?path=${encodeURIComponent(esPath)}&method=POST`;
  const resp = await fetch(url, {
    method: "POST",
    headers: HDR,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  const data = await resp.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data;
}

function mainAggQuery(gte, lt) {
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
            date_histogram: {
              field: "timestamp",
              fixed_interval: "1h",
              min_doc_count: 0,
              extended_bounds: { min: gte, max: lt },
            },
          },
        },
      },
      by_module: {
        filter: { term: { "level.keyword": "Error" } },
        aggs: { modules: { terms: { field: "module.keyword", size: 25 } } },
      },
      by_store: {
        filter: { term: { "level.keyword": "Error" } },
        aggs: { stores: { terms: { field: "store.keyword", size: 25 } } },
      },
      by_tag: {
        filter: { term: { "level.keyword": "Error" } },
        aggs: { tags: { terms: { field: "tag.keyword", size: 25 } } },
      },
      by_process: {
        filter: { term: { "level.keyword": "Error" } },
        aggs: { processes: { terms: { field: "process.keyword", size: 10 } } },
      },
      top_messages: {
        filter: { term: { "level.keyword": "Error" } },
        aggs: { msgs: { terms: { field: "message.keyword", size: 15 } } },
      },
      top_subscribers: {
        filter: { term: { "level.keyword": "Error" } },
        aggs: { subs: { terms: { field: "subscriberID", size: 10 } } },
      },
      fatals_by_msg: {
        filter: { term: { "level.keyword": "Fatal" } },
        aggs: { msgs: { terms: { field: "message.keyword", size: 15 } } },
      },
      fatals_by_store: {
        filter: { term: { "level.keyword": "Fatal" } },
        aggs: { stores: { terms: { field: "store.keyword", size: 15 } } },
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

function levelCount(aggs, level) {
  const b = aggs?.by_level?.buckets?.find((x) => x.key === level);
  return b?.doc_count ?? 0;
}

function bucketMap(buckets) {
  const m = new Map();
  for (const b of buckets ?? []) m.set(b.key, b.doc_count);
  return m;
}

function pctChange(cur, prev) {
  if (prev === 0 && cur === 0) return { cls: "flat", text: "≈" };
  if (prev === 0) return { cls: "new", text: "NEW" };
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) <= 10) return { cls: "flat", text: "≈" };
  const sign = pct > 0 ? "↑" : "↓";
  const cls = pct > 0 ? "up" : "down";
  return { cls, text: `${sign}${Math.abs(pct).toFixed(1)}%` };
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

function fmtDurationMs(ms) {
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

function fmtDurationSec(sec) {
  if (sec < 60) return `${sec.toFixed(1)}s`;
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}m ${s}s`;
  }
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
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

function stepBarColor(pct) {
  if (pct > 80) return "red";
  if (pct > 50) return "orange";
  if (pct > 25) return "amber";
  return "blue";
}

function buildDiscoverPath(kql, from, to) {
  const q = kql.replace(/'/g, "\\'");
  return `/app/kibana#/discover?_g=(refreshInterval:(pause:!t,value:0),time:(from:'${from}',to:'${to}'))&_a=(columns:!(timestamp,level,message,store,module,subscriberID),index:'${INDEX_ID}',interval:auto,query:(language:kuery,query:'${q}'),sort:!(!(timestamp,desc)))`;
}

const shortUrlCache = new Map();

async function shortUrl(kql, from = START, to = END) {
  const key = `${from}|${to}|${kql}`;
  if (shortUrlCache.has(key)) return shortUrlCache.get(key);
  const path = buildDiscoverPath(kql, from, to);
  try {
    const resp = await fetch(`${KIBANA}/api/shorten_url`, {
      method: "POST",
      headers: HDR,
      body: JSON.stringify({ url: path }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await resp.json();
    if (data.urlId) {
      const url = `${KIBANA}/goto/${data.urlId}`;
      shortUrlCache.set(key, url);
      return url;
    }
  } catch {}
  const fallback = `${KIBANA}`;
  shortUrlCache.set(key, fallback);
  return fallback;
}

async function shortUrlsBatch(items) {
  const results = [];
  const batchSize = 15;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const urls = await Promise.all(batch.map((it) => shortUrl(it.kql, it.from, it.to)));
    results.push(...urls);
  }
  return results;
}

function parsePerfDetail(detail, message) {
  let totalTime = 0;
  const m1 = (detail || "").match(/Total Time:\s*(\d+)\s*ms/);
  const m2 = (message || "").match(/Total Time:\s*(\d+),\s*ms/);
  if (m1) totalTime = parseInt(m1[1], 10);
  else if (m2) totalTime = parseInt(m2[1], 10);

  const steps = [];
  const lines = (detail || "").split(/\r?\n/);
  for (const line of lines) {
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
  let maxStep = null;
  let maxStepMs = 0;
  for (const s of steps) {
    if (s.ms > maxStepMs) {
      maxStepMs = s.ms;
      maxStep = s.name;
    }
  }
  return { totalTime, steps, maxStep, maxStepMs };
}

function aggregatePerf(hits) {
  const docs = hits.map((h) => {
    const s = h._source;
    const parsed = parsePerfDetail(s.detail, s.message);
    return { ...s, ...parsed };
  });

  const stepStats = new Map();
  for (const doc of docs) {
    for (const step of doc.steps) {
      if (!stepStats.has(step.name)) {
        stepStats.set(step.name, { num: step.num, count: 0, totalMs: 0, maxMs: 0, minMs: Infinity });
      }
      const st = stepStats.get(step.name);
      st.count++;
      st.totalMs += step.ms;
      st.maxMs = Math.max(st.maxMs, step.ms);
      st.minMs = Math.min(st.minMs, step.ms);
    }
  }

  const stepList = [...stepStats.values()].sort((a, b) => a.num - b.num);
  const maxAvg = Math.max(...stepList.map((s) => (s.count ? s.totalMs / s.count : 0)), 1);

  const bySub = new Map();
  for (const doc of docs) {
    const id = doc.subscriberID;
    if (!bySub.has(id)) {
      bySub.set(id, {
        subscriberID: id,
        email: doc.email || "",
        runCount: 0,
        totalTime: 0,
        processedRecords: 0,
        maxStep: "",
        maxStepMs: 0,
        topSteps: [],
      });
    }
    const rec = bySub.get(id);
    rec.runCount++;
    rec.totalTime += doc.totalTime;
    rec.processedRecords += doc.processedRecords || 0;
    if (doc.maxStepMs > rec.maxStepMs) {
      rec.maxStepMs = doc.maxStepMs;
      rec.maxStep = doc.maxStep;
    }
    if (!rec.email && doc.email) rec.email = doc.email;
    for (const step of doc.steps) {
      const existing = rec.topSteps.find((t) => t.num === step.num);
      if (!existing) rec.topSteps.push({ ...step });
      else existing.ms = Math.max(existing.ms, step.ms);
    }
  }

  for (const rec of bySub.values()) {
    rec.topSteps.sort((a, b) => b.ms - a.ms);
    rec.top3 = rec.topSteps.slice(0, 3);
  }

  const top5 = [...bySub.values()].sort((a, b) => b.totalTime - a.totalTime).slice(0, 5);
  const topMax = top5[0]?.totalTime || 1;

  return { docs, stepList, maxAvg, top5, topMax, runCount: docs.length };
}

function conicGradient(buckets, total) {
  if (!total) return "#e2e8f0";
  const colors = ["#96bf48", "#7f54b3", "#2196F3", "#ff9900", "#ee672d", "#94a3b8", "#10b981", "#f59e0b"];
  let deg = 0;
  const parts = [];
  for (let i = 0; i < buckets.length; i++) {
    const pct = (buckets[i].doc_count / total) * 360;
    const end = deg + pct;
    parts.push(`${colors[i % colors.length]} ${deg}deg ${end}deg`);
    deg = end;
  }
  return `conic-gradient(${parts.join(", ")})`;
}

const CSS = `*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f8fafc;color:#1e293b;font-size:.85rem}
a{color:#2563eb;text-decoration:none}a:hover{text-decoration:underline}
.page{max-width:1280px;margin:0 auto;padding:24px 16px}
.rpt-header{background:linear-gradient(135deg,#1e3a5f 0%,#2d5a8e 100%);color:#fff;border-radius:12px;padding:24px 32px;margin-bottom:24px}
.rpt-header h1{font-size:1.4rem;font-weight:700;margin-bottom:4px}
.rpt-header .meta{font-size:.78rem;opacity:.8;display:flex;gap:24px;flex-wrap:wrap;margin-top:8px}
.card{background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:20px;overflow:hidden}
.card-header{padding:14px 20px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
.card-header h2{font-size:.92rem;font-weight:700;color:#0f172a}
.card-header .subtitle{font-size:.72rem;color:#64748b}
.card-body{padding:16px 20px}
.exec-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.exec-card{border-radius:8px;padding:14px 16px;border-left:4px solid #e2e8f0;background:#fafafa}
.exec-card.total{border-color:#3b82f6}.exec-card.error{border-color:#ef4444}.exec-card.fatal{border-color:#7c3aed}
.exec-card.warning{border-color:#f59e0b}.exec-card.info{border-color:#10b981}.exec-card.rate{border-color:#f97316}
.exec-card .label{font-size:.68rem;font-weight:600;text-transform:uppercase;color:#64748b;margin-bottom:6px}
.exec-card .value{font-size:1.5rem;font-weight:800;color:#0f172a}.exec-card .change{font-size:.7rem;margin-top:4px}
.cb{display:inline-flex;padding:2px 7px;border-radius:9999px;font-size:.68rem;font-weight:600}
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
.tbl tr:hover td{background:#fafafa}.r{text-align:right}
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
.perf-email{font-size:.68rem;color:#94a3b8;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.perf-time{font-weight:700;color:#0f172a}.perf-step-max{font-size:.72rem;color:#dc2626;font-weight:600}
.perf-step-ms{font-size:.68rem;color:#f97316}.perf-step-detail{font-size:.65rem;color:#64748b;font-family:monospace}
.step-chart{margin:16px 0 4px}.step-chart-title{font-size:.78rem;font-weight:600;color:#475569;margin-bottom:10px}
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
.insight-card h4{font-size:.8rem;font-weight:700;margin-bottom:4px}
.insight-card p{font-size:.73rem;color:#475569;line-height:1.5}
.section-sep{height:8px}
.metrics-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px}
.metric-box{background:#f8fafc;border-radius:8px;padding:12px;text-align:center}
.metric-box .mv{font-size:1.2rem;font-weight:800}.metric-box .ml{font-size:.65rem;color:#64748b;margin-top:4px}
.nodata{padding:24px;text-align:center;color:#94a3b8;font-style:italic}
.footer{text-align:center;padding:24px;color:#94a3b8;font-size:.72rem}`;

async function main() {
  console.log(`Report date: ${REPORT_DATE}`);
  console.log(`Window: ${START} → ${END}`);
  console.log(`Indices: ${INDICES_TODAY}`);

  const health = await fetch(`${KIBANA}/api/status`, { headers: HDR, signal: AbortSignal.timeout(10_000) });
  if (!health.ok) {
    console.error("HALT: Kibana unreachable");
    process.exit(1);
  }

  const [q1, q2, q3a, q4, q5a, q6a] = await Promise.all([
    esSearch(INDICES_TODAY, mainAggQuery(START, END)),
    esSearch(INDICES_PREV, mainAggQuery(PREV_START, PREV_END)),
    esSearch(INDICES_TODAY, payoutQuery(START, END, true)),
    esSearch(INDICES_TODAY, amazonQuery(START, END)),
    esSearch(INDICES_TODAY, perfQuery(START, END, "PayoutPosting", "Payout_PerformanceSummary")),
    esSearch(INDICES_TODAY, perfQuery(START, END, "AmazonSettlementReport", "Settlement_PerformanceSummary")),
  ]);

  let q3 = q3a;
  if ((q3a.hits?.total?.value ?? 0) === 0) {
    q3 = await esSearch(INDICES_TODAY, payoutQuery(START, END, false));
  }

  let q5 = q5a;
  if (!(q5a.hits?.hits?.length)) {
    q5 = await esSearch(INDICES_TODAY, perfQueryFallback(START, END, "PayoutPosting"));
  }
  let q6 = q6a;
  if (!(q6a.hits?.hits?.length)) {
    q6 = await esSearch(INDICES_TODAY, perfQueryFallback(START, END, "AmazonSettlementReport"));
  }

  let q3prevResolved = await esSearch(INDICES_PREV, payoutQuery(PREV_START, PREV_END, true));
  if ((q3prevResolved.hits?.total?.value ?? 0) === 0) {
    q3prevResolved = await esSearch(INDICES_PREV, payoutQuery(PREV_START, PREV_END, false));
  }

  const [q4prev, q5prev, q6prev] = await Promise.all([
    esSearch(INDICES_PREV, amazonQuery(PREV_START, PREV_END)),
    esSearch(INDICES_PREV, perfQuery(PREV_START, PREV_END, "PayoutPosting", "Payout_PerformanceSummary")),
    esSearch(INDICES_PREV, perfQuery(PREV_START, PREV_END, "AmazonSettlementReport", "Settlement_PerformanceSummary")),
  ]);

  const total = q1.hits.total.value;
  const errors = levelCount(q1.aggregations, "Error");
  const fatals = levelCount(q1.aggregations, "Fatal");
  const warnings = levelCount(q1.aggregations, "Warning");
  const info = levelCount(q1.aggregations, "Info");
  const errorRate = total ? ((errors / total) * 100).toFixed(2) : "0.00";

  const prevTotal = q2.hits.total.value;
  const prevErrors = levelCount(q2.aggregations, "Error");
  const prevFatals = levelCount(q2.aggregations, "Fatal");
  const prevWarnings = levelCount(q2.aggregations, "Warning");
  const prevInfo = levelCount(q2.aggregations, "Info");
  const prevErrorRate = prevTotal ? (prevErrors / prevTotal) * 100 : 0;

  const prevModuleMap = bucketMap(q2.aggregations?.by_module?.modules?.buckets);
  const prevStoreMap = bucketMap(q2.aggregations?.by_store?.stores?.buckets);
  const prevTagMap = bucketMap(q2.aggregations?.by_tag?.tags?.buckets);
  const prevProcessMap = bucketMap(q2.aggregations?.by_process?.processes?.buckets);
  const prevMsgMap = bucketMap(q2.aggregations?.top_messages?.msgs?.buckets);
  const prevSubMap = bucketMap(q2.aggregations?.top_subscribers?.subs?.buckets);
  const prevFatalMsgMap = bucketMap(q2.aggregations?.fatals_by_msg?.msgs?.buckets);
  const prevFatalStoreMap = bucketMap(q2.aggregations?.fatals_by_store?.stores?.buckets);

  // Build short URL requests
  const linkItems = [];
  const addLink = (id, kql, from = START, to = END) => {
    linkItems.push({ id, kql, from, to });
  };

  addLink("exec-total", "*");
  addLink("exec-error", 'level.keyword:"Error"');
  addLink("exec-fatal", 'level.keyword:"Fatal"');
  addLink("exec-warning", 'level.keyword:"Warning"');
  addLink("exec-info", 'level.keyword:"Info"');

  const modules = q1.aggregations?.by_module?.modules?.buckets ?? [];
  const stores = q1.aggregations?.by_store?.stores?.buckets ?? [];
  const tags = q1.aggregations?.by_tag?.tags?.buckets ?? [];
  const processes = q1.aggregations?.by_process?.processes?.buckets ?? [];
  const messages = q1.aggregations?.top_messages?.msgs?.buckets ?? [];
  const subscribers = q1.aggregations?.top_subscribers?.subs?.buckets ?? [];
  const fatalMsgs = q1.aggregations?.fatals_by_msg?.msgs?.buckets ?? [];
  const fatalStores = q1.aggregations?.fatals_by_store?.stores?.buckets ?? [];

  for (const b of modules) {
    const mod = b.key === "Unknown" || !b.key ? "" : ` AND module.keyword:"${esc(b.key).replace(/"/g, '\\"')}"`;
    addLink(`mod-${b.key}`, `level.keyword:"Error"${b.key && b.key !== "Unknown" ? ` AND module.keyword:"${b.key}"` : ""}`);
  }
  for (const b of stores) {
    addLink(`store-${b.key}`, `level.keyword:"Error" AND store.keyword:"${b.key}"`);
  }
  for (const b of tags) {
    addLink(`tag-${b.key}`, `level.keyword:"Error" AND tag.keyword:"${b.key}"`);
  }
  for (const b of processes) {
    addLink(`proc-${b.key}`, `level.keyword:"Error" AND process.keyword:"${b.key}"`);
  }
  for (const b of messages) {
    const msg = b.key.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    addLink(`msg-${b.key.slice(0, 40)}`, `level.keyword:"Error" AND message.keyword:"${b.key}"`);
  }
  for (const b of subscribers) {
    addLink(`sub-${b.key}`, `level.keyword:"Error" AND subscriberID:${b.key}`);
  }
  for (const b of fatalMsgs) {
    addLink(`fmsg-${b.key.slice(0, 30)}`, `level.keyword:"Fatal" AND message.keyword:"${b.key}"`);
  }
  for (const b of fatalStores) {
    addLink(`fstore-${b.key}`, `level.keyword:"Fatal" AND store.keyword:"${b.key}"`);
  }

  addLink("payout-all", 'module.keyword:"PayoutPosting"');
  addLink("amazon-all", 'module.keyword:"AmazonSettlementReport"');

  console.log(`Generating ${linkItems.length} short URLs...`);
  const urls = await shortUrlsBatch(linkItems);
  const linkMap = new Map();
  linkItems.forEach((it, i) => linkMap.set(it.id, urls[i]));

  const badge = (cur, prev) => {
    const c = pctChange(cur, prev);
    return `<span class="cb ${c.cls}">${c.text}</span>`;
  };

  const link = (id, text) => `<a href="${linkMap.get(id) || KIBANA}" target="_blank">${esc(text)}</a>`;

  // Hourly chart — 24 slots from report start, assign ES hour buckets by offset
  const hourlyBuckets = q1.aggregations?.errors_hourly?.by_hour?.buckets ?? [];
  const startMs = new Date(START).getTime();
  const hourlyCounts = Array.from({ length: 24 }, (_, i) => {
    const slotMs = startMs + i * 3600000;
    const label = String(new Date(slotMs + 5.5 * 3600000).getUTCHours()).padStart(2, "0");
    return { label, count: 0 };
  });
  for (const b of hourlyBuckets) {
    const t = new Date(b.key).getTime();
    const idx = Math.floor((t - startMs) / 3600000);
    if (idx >= 0 && idx < 24) hourlyCounts[idx].count += b.doc_count;
  }
  const maxHourly = Math.max(...hourlyCounts.map((h) => h.count), 1);
  const peakHour = hourlyCounts.reduce((a, b) => (b.count > a.count ? b : a), hourlyCounts[0]);

  let hourlyHtml = "";
  for (const h of hourlyCounts) {
    const pct = Math.max((h.count / maxHourly) * 100, 0.1);
    const cls = barColorClass((h.count / maxHourly) * 100);
    hourlyHtml += `<div class="bar-col"><div class="bar ${cls}" style="height:${pct.toFixed(1)}%" title="${h.label}:00 IST — ${h.count} errors"></div><div class="bar-lbl">${h.label}</div></div>`;
  }

  const errRateChg = pctChange(parseFloat(errorRate), prevErrorRate);

  // Module table
  let moduleRows = "";
  for (const b of modules) {
    const pct = errors ? ((b.doc_count / errors) * 100).toFixed(1) : 0;
    const col = pctBarColor(parseFloat(pct));
    moduleRows += `<tr><td>${link(`mod-${b.key}`, b.key || "Unknown")}</td><td class="r">${fmtNum(b.doc_count)}</td><td><div class="pct-bar-wrap"><span class="pct-text">${pct}%</span><div class="pct-bar"><div class="pct-bar-fill ${col}" style="width:${Math.min(pct, 100)}%"></div></div></div></td><td>${badge(b.doc_count, prevModuleMap.get(b.key) ?? 0)}</td></tr>`;
  }
  if (!moduleRows) moduleRows = `<tr><td colspan="4" class="nodata">No data found</td></tr>`;

  let storeRows = "";
  for (const b of stores) {
    const pct = errors ? ((b.doc_count / errors) * 100).toFixed(1) : 0;
    const col = pctBarColor(parseFloat(pct));
    storeRows += `<tr><td>${link(`store-${b.key}`, b.key)}</td><td class="r">${fmtNum(b.doc_count)}</td><td><div class="pct-bar-wrap"><span class="pct-text">${pct}%</span><div class="pct-bar"><div class="pct-bar-fill ${col}" style="width:${Math.min(pct, 100)}%"></div></div></div></td><td>${badge(b.doc_count, prevStoreMap.get(b.key) ?? 0)}</td></tr>`;
  }
  if (!storeRows) storeRows = `<tr><td colspan="4" class="nodata">No data found</td></tr>`;

  let tagRows = "";
  for (const b of tags) {
    tagRows += `<tr><td>${link(`tag-${b.key}`, b.key)}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${badge(b.doc_count, prevTagMap.get(b.key) ?? 0)}</td></tr>`;
  }
  if (!tagRows) tagRows = `<tr><td colspan="3" class="nodata">No data found</td></tr>`;

  let procRows = "";
  for (const b of processes) {
    procRows += `<tr><td>${link(`proc-${b.key}`, b.key)}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${badge(b.doc_count, prevProcessMap.get(b.key) ?? 0)}</td></tr>`;
  }
  if (!procRows) procRows = `<tr><td colspan="3" class="nodata">No data found</td></tr>`;

  let msgRows = "";
  messages.forEach((b, i) => {
    const shortKey = b.key.slice(0, 40);
    msgRows += `<tr><td>${i + 1}</td><td>${link(`msg-${shortKey}`, b.key.length > 90 ? b.key.slice(0, 90) + "…" : b.key)}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${badge(b.doc_count, prevMsgMap.get(b.key) ?? 0)}</td></tr>`;
  });
  if (!msgRows) msgRows = `<tr><td colspan="4" class="nodata">No data found</td></tr>`;

  let subRows = "";
  subscribers.forEach((b, i) => {
    const pct = errors ? ((b.doc_count / errors) * 100).toFixed(1) : 0;
    const col = pctBarColor(parseFloat(pct));
    subRows += `<tr><td>${i + 1}</td><td>${link(`sub-${b.key}`, b.key)}</td><td class="r">${fmtNum(b.doc_count)}</td><td><div class="pct-bar-wrap"><span class="pct-text">${pct}%</span><div class="pct-bar"><div class="pct-bar-fill ${col}" style="width:${Math.min(pct, 100)}%"></div></div></div></td><td>${badge(b.doc_count, prevSubMap.get(b.key) ?? 0)}</td></tr>`;
  });
  if (!subRows) subRows = `<tr><td colspan="5" class="nodata">No data found</td></tr>`;

  let fatalMsgRows = "";
  for (const b of fatalMsgs) {
    fatalMsgRows += `<tr><td>${link(`fmsg-${b.key.slice(0, 30)}`, b.key.length > 60 ? b.key.slice(0, 60) + "…" : b.key)}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${badge(b.doc_count, prevFatalMsgMap.get(b.key) ?? 0)}</td></tr>`;
  }
  if (!fatalMsgRows) fatalMsgRows = `<tr><td colspan="3" class="nodata">No data found</td></tr>`;

  const fatalTotal = fatals || 1;
  let fatalStoreRows = "";
  for (const b of fatalStores) {
    fatalStoreRows += `<tr><td>${link(`fstore-${b.key}`, b.key)}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${badge(b.doc_count, prevFatalStoreMap.get(b.key) ?? 0)}</td></tr>`;
  }
  if (!fatalStoreRows) fatalStoreRows = `<tr><td colspan="3" class="nodata">No data found</td></tr>`;
  const donutBg = conicGradient(fatalStores, fatals);

  // Payout section
  const payoutProcessed = q3.aggregations?.total_processed?.value ?? 0;
  const prevPayoutProcessed = q3prevResolved.aggregations?.total_processed?.value ?? 0;
  const payoutStats = q3.aggregations?.payout_time_stats?.value ?? {};
  const payoutSubs = q3.aggregations?.by_subscriber?.buckets ?? [];

  let payoutSection = "";
  if (payoutProcessed === 0 && payoutSubs.length === 0) {
    payoutSection = `<div class="nodata">No PayoutPosting data found for this period</div>`;
  } else {
    const batches = payoutStats.batch_count ?? payoutSubs.reduce((s, b) => s + (b.batch_count?.value ?? 0), 0);
    payoutSection = `<div class="metrics-grid">
      <div class="metric-box"><div class="mv">${link("payout-all", fmtNum(payoutProcessed))}</div><div class="ml">Records Processed ${badge(payoutProcessed, prevPayoutProcessed)}</div></div>
      <div class="metric-box"><div class="mv">${fmtNum(batches)}</div><div class="ml">Batches</div></div>
      <div class="metric-box"><div class="mv">${fmtDurationSec(payoutStats.min_per_payout_seconds || 0)}</div><div class="ml">Min Time/Record</div></div>
      <div class="metric-box"><div class="mv">${payoutStats.max_per_payout_seconds ? (1 / payoutStats.min_per_payout_seconds).toFixed(2) + "/s" : "N/A"}</div><div class="ml">Max Rate</div></div>
      <div class="metric-box"><div class="mv">${fmtDurationSec(payoutStats.avg_per_payout_seconds || 0)}</div><div class="ml">Avg Time/Record</div></div>
      <div class="metric-box"><div class="mv">${fmtDurationSec(payoutStats.total_seconds || 0)}</div><div class="ml">Est. Total Time</div></div>
    </div>`;
    if (payoutSubs.length) {
      payoutSection += `<table class="tbl"><thead><tr><th>Subscriber ID</th><th class="r">Records</th><th class="r">Batches</th><th>% of Total</th><th>vs Prev</th></tr></thead><tbody>`;
      for (const b of payoutSubs) {
        const rec = b.processed_sum?.value ?? 0;
        const pct = payoutProcessed ? ((rec / payoutProcessed) * 100).toFixed(1) : 0;
        const pid = `payout-sub-${b.key}`;
        if (!linkMap.has(pid)) {
          const u = await shortUrl(`level.keyword:"Info" AND module.keyword:"PayoutPosting" AND subscriberID:${b.key}`);
          linkMap.set(pid, u);
        }
        payoutSection += `<tr><td><a href="${linkMap.get(pid)}" target="_blank">${b.key}</a></td><td class="r">${fmtNum(rec)}</td><td class="r">${fmtNum(b.batch_count?.value ?? 0)}</td><td>${pct}%</td><td>${badge(rec, 0)}</td></tr>`;
      }
      payoutSection += `</tbody></table>`;
    }
  }

  // Amazon section
  const amzTotal = q4.hits?.total?.value ?? 0;
  const prevAmzTotal = q4prev.hits?.total?.value ?? 0;
  const amzErrors = (q4.aggregations?.by_level?.buckets ?? []).find((x) => x.key === "Error")?.doc_count ?? 0;
  const prevAmzErrors = (q4prev.aggregations?.by_level?.buckets ?? []).find((x) => x.key === "Error")?.doc_count ?? 0;
  const amzProcessed = q4.aggregations?.total_processed?.value ?? 0;
  const prevAmzProcessed = q4prev.aggregations?.total_processed?.value ?? 0;
  const amzErrMsgs = q4.aggregations?.top_errors?.by_message?.buckets ?? [];
  const amzSubs = q4.aggregations?.top_subscribers?.buckets ?? [];
  const amzUniqueSubs = amzSubs.length;

  let amazonSection = "";
  if (amzTotal === 0) {
    amazonSection = `<div class="nodata">No Amazon Settlement activity found for this period</div>`;
  } else {
    amazonSection = `<div class="metrics-grid">
      <div class="metric-box"><div class="mv">${link("amazon-all", fmtNum(amzTotal))}</div><div class="ml">Total Events</div></div>
      <div class="metric-box"><div class="mv">${fmtNum(amzErrors)}</div><div class="ml">Errors ${badge(amzErrors, prevAmzErrors)}</div></div>
      <div class="metric-box"><div class="mv">${fmtNum(amzProcessed || amzTotal)}</div><div class="ml">Settlements ${badge(amzProcessed || amzTotal, prevAmzProcessed || prevAmzTotal)}</div></div>
      <div class="metric-box"><div class="mv">${amzUniqueSubs}</div><div class="ml">Affected Subscribers</div></div>
    </div>`;
    if (amzErrMsgs.length) {
      amazonSection += `<div style="font-size:.78rem;font-weight:700;margin:12px 0 8px">Top Error Messages</div><table class="tbl"><thead><tr><th>Message</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>`;
      for (const b of amzErrMsgs) {
        const aid = `amz-msg-${b.key.slice(0, 30)}`;
        if (!linkMap.has(aid)) {
          linkMap.set(aid, await shortUrl(`level.keyword:"Error" AND module.keyword:"AmazonSettlementReport" AND message.keyword:"${b.key}"`));
        }
        amazonSection += `<tr><td><a href="${linkMap.get(aid)}" target="_blank">${esc(b.key)}</a></td><td class="r">${fmtNum(b.doc_count)}</td><td>${badge(b.doc_count, 0)}</td></tr>`;
      }
      amazonSection += `</tbody></table>`;
    }
    if (amzSubs.length) {
      amazonSection += `<div style="font-size:.78rem;font-weight:700;margin:12px 0 8px">Top 5 Subscribers</div><table class="tbl"><thead><tr><th>Subscriber ID</th><th class="r">Events</th><th class="r">Errors</th><th class="r">Settlements</th><th>vs Prev</th></tr></thead><tbody>`;
      for (const b of amzSubs) {
        const errCt = (b.by_level?.buckets ?? []).find((x) => x.key === "Error")?.doc_count ?? 0;
        const sid = `amz-sub-${b.key}`;
        if (!linkMap.has(sid)) {
          linkMap.set(sid, await shortUrl(`module.keyword:"AmazonSettlementReport" AND subscriberID:${b.key}`));
        }
        amazonSection += `<tr><td><a href="${linkMap.get(sid)}" target="_blank">${b.key}</a></td><td class="r">${fmtNum(b.doc_count)}</td><td class="r">${fmtNum(errCt)}</td><td class="r">${fmtNum(b.processed_sum?.value ?? 0)}</td><td>${badge(b.doc_count, 0)}</td></tr>`;
      }
      amazonSection += `</tbody></table>`;
    }
  }

  // Performance sections
  async function renderPerfSection(title, module, methodType, qPerf, qPerfPrev, placeholder) {
    const agg = aggregatePerf(qPerf.hits?.hits ?? []);
    const aggPrev = aggregatePerf(qPerfPrev.hits?.hits ?? []);
    const prevTopMap = new Map(aggPrev.top5.map((t) => [t.subscriberID, t.totalTime]));

    if (!agg.runCount) {
      return `<div class="card"><div class="card-header"><h2>${title}</h2></div><div class="card-body"><div class="nodata">${placeholder}</div></div></div>`;
    }

    let tableRows = "";
    let rank = 1;
    for (const rec of agg.top5) {
      const pct = ((rec.totalTime / agg.topMax) * 100).toFixed(1);
      const barCol = stepBarColor(parseFloat(pct));
      const sid = `perf-${module}-${rec.subscriberID}`;
      if (!linkMap.has(sid)) {
        linkMap.set(sid, await shortUrl(`tag.keyword:"Performance" AND module.keyword:"${module}" AND subscriberID:${rec.subscriberID}`));
      }
      const top3html = rec.top3.map((s) => `S${s.num}: ${fmtDurationMs(s.ms)}`).join("<br>");
      const prevT = prevTopMap.get(rec.subscriberID);
      tableRows += `<tr><td>${rank}</td><td><a href="${linkMap.get(sid)}" target="_blank">${rec.subscriberID}</a></td><td class="perf-email">${esc(rec.email)}</td><td class="r">${rec.runCount}</td><td class="r">${fmtNum(rec.processedRecords)}</td><td class="r perf-time">${fmtDurationMs(rec.totalTime)}</td><td><div class="pct-bar-wrap"><span class="pct-text">${pct}%</span><div class="pct-bar"><div class="pct-bar-fill ${barCol}" style="width:${pct}%"></div></div></div></td><td class="perf-step-max">${esc(rec.maxStep)}<br><span class="perf-step-ms">${fmtDurationMs(rec.maxStepMs)}</span></td><td class="perf-step-detail">${top3html}</td><td>${prevT != null ? badge(rec.totalTime, prevT) : '<span class="cb new">NEW</span>'}</td></tr>`;
      rank++;
    }
    while (rank <= 5) {
      tableRows += `<tr><td>${rank}</td><td colspan="9" class="nodata">—</td></tr>`;
      rank++;
    }

    let stepBars = "";
    for (const st of agg.stepList) {
      const avg = st.count ? st.totalMs / st.count : 0;
      const pct = (avg / agg.maxAvg) * 100;
      const col = stepBarColor(pct);
      const shortName = (st.name || "").slice(0, 20);
      stepBars += `<div class="step-row"><div class="step-label" title="${esc(st.name)}">S${st.num}: ${esc(shortName)}</div><div class="step-bar-wrap"><div class="step-bar ${col}" style="width:${Math.max(pct, 2).toFixed(1)}%"></div><span class="step-bar-val">${fmtDurationMs(avg)} avg / ${fmtDurationMs(st.maxMs)} max (${st.count} runs)</span></div></div>`;
    }
    if (!stepBars) stepBars = `<div class="nodata">No step data found</div>`;

    const ymd = REPORT_DATE;
    return `<div class="card"><div class="card-header"><h2>${title}</h2><span class="subtitle">${agg.runCount} performance runs in period</span></div><div class="card-body">
<table class="perf-table"><thead><tr><th>#</th><th>Subscriber ID</th><th>Email</th><th>Runs</th><th>Transactions</th><th>Total Time</th><th>% of Max</th><th>Slowest Step</th><th>Top 3 Steps</th><th>vs Prev</th></tr></thead><tbody>${tableRows}</tbody></table>
<div class="step-chart"><div class="step-chart-title">Avg Step Processing Time — ${module} (${agg.runCount} runs)</div>${stepBars}</div>
</div></div>`;
  }

  const perfPayoutHtml = await renderPerfSection(
    "🏃 Shopify Payout — Performance Deep-Dive",
    "PayoutPosting",
    "Payout_PerformanceSummary",
    q5,
    q5prev,
    'No <code>Payout_PerformanceSummary</code> logs found in this period.'
  );
  const perfAmzHtml = await renderPerfSection(
    "🏃 Amazon Settlement — Performance Deep-Dive",
    "AmazonSettlementReport",
    "Settlement_PerformanceSummary",
    q6,
    q6prev,
    'No <code>Settlement_PerformanceSummary</code> logs found in this period.'
  );

  // Insights
  const topMsg = messages[0];
  const insights = [];
  if (errors > prevErrors * 1.1) {
    insights.push({ type: "spike", title: "Error volume elevated", desc: `Errors at ${fmtNum(errors)} (${badge(errors, prevErrors).replace(/<[^>]+>/g, "")} vs previous ${fmtNum(prevErrors)}).` });
  } else if (errors < prevErrors * 0.9) {
    insights.push({ type: "healthy", title: "Error volume improved", desc: `Errors decreased to ${fmtNum(errors)} from ${fmtNum(prevErrors)}.` });
  }
  if (topMsg) {
    insights.push({ type: "danger", title: `Top error: ${topMsg.key.slice(0, 50)}`, desc: `${fmtNum(topMsg.doc_count)} occurrences (${((topMsg.doc_count / errors) * 100).toFixed(1)}% of all errors).` });
  }
  const storeConn = tags.find((t) => t.key === "StoreConnectionError");
  if (storeConn && storeConn.doc_count > 500) {
    insights.push({ type: "warning", title: "Store connection failures", desc: `${fmtNum(storeConn.doc_count)} StoreConnectionError events — check channel API health.` });
  }
  if (parseFloat(errorRate) > prevErrorRate * 1.2) {
    insights.push({ type: "spike", title: "Error rate spike", desc: `Error rate ${errorRate}% vs ${prevErrorRate.toFixed(2)}% prior day.` });
  }
  if (!insights.length) {
    insights.push({ type: "healthy", title: "Stable log profile", desc: "No major anomalies detected in this reporting window." });
  }

  let insightsHtml = "";
  for (const ins of insights) {
    const icon = ins.type === "danger" ? "!" : ins.type === "warning" ? "↑" : ins.type === "spike" ? "⚡" : "✓";
    insightsHtml += `<div class="insight-card ${ins.type}"><div class="icon">${icon}</div><h4>${esc(ins.title)}</h4><p>${esc(ins.desc)}</p></div>`;
  }

  const genTime = new Date().toISOString().replace("T", " ").slice(0, 19);
  const periodIst = `${startUtc.toISOString().slice(0, 10)} 09:00 IST → ${REPORT_DATE} 09:00 IST`;
  const compareIst = `${prevStartUtc.toISOString().slice(0, 10)} 09:00 IST → ${startUtc.toISOString().slice(0, 10)} 09:00 IST`;

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WD Kibana Daily Log Report — ${REPORT_DATE}</title><style>${CSS}</style></head><body><div class="page">
<div class="rpt-header"><h1>WD Kibana Daily Log Report — ${REPORT_DATE}</h1><div class="meta">
<span>📅 Period: ${periodIst}</span><span>📊 Index: ${INDICES_TODAY}</span>
<span>⚖️ Compared to: ${compareIst}</span><span>🕐 Generated: ${genTime} UTC</span></div></div>

<div class="card"><div class="card-header"><h2>📋 Executive Summary</h2><span class="subtitle">Total docs: ${fmtNum(total)} vs ${fmtNum(prevTotal)} prev</span></div><div class="card-body"><div class="exec-grid">
<div class="exec-card total"><div class="label">Total Events</div><div class="value">${link("exec-total", fmtNum(total))}</div><div class="change">${badge(total, prevTotal)} vs prev ${fmtNum(prevTotal)}</div></div>
<div class="exec-card error"><div class="label">Errors</div><div class="value">${link("exec-error", fmtNum(errors))}</div><div class="change">${badge(errors, prevErrors)} vs prev ${fmtNum(prevErrors)}</div></div>
<div class="exec-card fatal"><div class="label">Fatals</div><div class="value">${link("exec-fatal", fmtNum(fatals))}</div><div class="change">${badge(fatals, prevFatals)} vs prev ${fmtNum(prevFatals)}</div></div>
<div class="exec-card warning"><div class="label">Warnings</div><div class="value">${link("exec-warning", fmtNum(warnings))}</div><div class="change">${badge(warnings, prevWarnings)} vs prev ${fmtNum(prevWarnings)}</div></div>
<div class="exec-card info"><div class="label">Info</div><div class="value">${link("exec-info", fmtNum(info))}</div><div class="change">${badge(info, prevInfo)} vs prev ${fmtNum(prevInfo)}</div></div>
<div class="exec-card rate"><div class="label">Error Rate</div><div class="value">${errorRate}%</div><div class="change"><span class="cb ${errRateChg.cls}">${errRateChg.text}</span> vs prev ${prevErrorRate.toFixed(2)}%</div></div>
</div></div></div>

<div class="card"><div class="card-header"><h2>⏱ Hourly Error Timeline (IST)</h2><span class="subtitle">Peak: ${fmtNum(peakHour.count)} errors at ${peakHour.label}:00 IST</span></div><div class="card-body"><div class="bar-chart">${hourlyHtml}</div></div></div>

<div class="card"><div class="card-header"><h2>🔍 Error Breakdown</h2><span class="subtitle">${fmtNum(errors)} total errors</span></div><div class="card-body"><div class="grid-2">
<div><div style="font-size:.78rem;font-weight:700;margin-bottom:8px">By Module</div><table class="tbl"><thead><tr><th>Module</th><th class="r">Count</th><th>% of Errors</th><th>vs Prev</th></tr></thead><tbody>${moduleRows}</tbody></table></div>
<div><div style="font-size:.78rem;font-weight:700;margin-bottom:8px">By Store</div><table class="tbl"><thead><tr><th>Store</th><th class="r">Count</th><th>%</th><th>vs Prev</th></tr></thead><tbody>${storeRows}</tbody></table></div>
</div><div class="section-sep"></div><div class="grid-2">
<div><div style="font-size:.78rem;font-weight:700;margin-bottom:8px">By Tag</div><table class="tbl"><thead><tr><th>Tag</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${tagRows}</tbody></table></div>
<div><div style="font-size:.78rem;font-weight:700;margin-bottom:8px">By Process</div><table class="tbl"><thead><tr><th>Process</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${procRows}</tbody></table></div>
</div></div></div>

<div class="card"><div class="card-header"><h2>⚠️ Top Error Messages</h2></div><div class="card-body"><table class="tbl"><thead><tr><th>#</th><th>Message</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${msgRows}</tbody></table></div></div>

<div class="card"><div class="card-header"><h2>👥 Top Error Subscribers</h2></div><div class="card-body"><table class="tbl"><thead><tr><th>#</th><th>Subscriber ID</th><th class="r">Errors</th><th>%</th><th>vs Prev</th></tr></thead><tbody>${subRows}</tbody></table></div></div>

<div class="card"><div class="card-header"><h2>💀 Fatal Events</h2><span class="subtitle">${fmtNum(fatals)} fatals</span></div><div class="card-body"><div class="grid-2">
<div><div style="font-size:.78rem;font-weight:700;margin-bottom:8px">By Message</div><table class="tbl"><thead><tr><th>Message</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${fatalMsgRows}</tbody></table></div>
<div><div class="donut-wrap"><div class="donut" style="background:${donutBg}"></div><table class="tbl"><thead><tr><th>Store</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${fatalStoreRows}</tbody></table></div>
</div></div></div>

<div class="card"><div class="card-header"><h2>💳 Shopify Payout Performance</h2></div><div class="card-body">${payoutSection}</div></div>

<div class="card"><div class="card-header"><h2>🛒 Amazon Settlement Report</h2></div><div class="card-body">${amazonSection}</div></div>

${perfPayoutHtml}
${perfAmzHtml}

<div class="card"><div class="card-header"><h2>💡 Actionable Insights</h2></div><div class="card-body"><div class="insights-grid">${insightsHtml}</div></div></div>

<div class="footer">Source: Kibana WD (<a href="https://kibana-wd.webgility.com" target="_blank">kibana-wd.webgility.com</a>) · Indices: ${INDICES_TODAY} · Report: ${REPORT_DATE}-wd-kibana-daily-report.html</div>
</div></body></html>`;

  mkdirSync(REPORT_DIR, { recursive: true });
  const outPath = join(REPORT_DIR, `${REPORT_DATE}-wd-kibana-daily-report.html`);
  writeFileSync(outPath, html, "utf8");
  const size = Buffer.byteLength(html, "utf8");
  console.log(`Wrote ${outPath} (${(size / 1024).toFixed(1)} KB)`);

  if (size < 30 * 1024) {
    console.error(`ERROR: Report size ${size} bytes < 30 KB minimum`);
    process.exit(1);
  }

  // Cleanup temp files
  for (const f of readdirSync(REPORT_DIR)) {
    if (/^(q[0-9]|short-urls|computed|gen-).*\.(json|ps1)$/.test(f) || /-to-.*-daily-log-report\.md$/.test(f)) {
      try {
        unlinkSync(join(REPORT_DIR, f));
        console.log(`Deleted temp: ${f}`);
      } catch {}
    }
  }

  console.log("SECTIONS_OK");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
