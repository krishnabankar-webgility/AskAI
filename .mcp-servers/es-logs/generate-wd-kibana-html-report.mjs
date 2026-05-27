#!/usr/bin/env node
/**
 * WD Kibana Daily HTML Report Generator
 * Queries Kibana WD HTTPS API and writes reports/wd-kibana-logs/{date}-wd-kibana-daily-report.html
 */
import { writeFileSync, unlinkSync, readdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KIBANA_BASE = "https://kibana-wd.webgility.com";
const INDEX_ID = "61237d60-0ed9-11eb-816a-cde07dc15a1f";
const AUTH = process.env.KIBANA_WD_AUTH;

if (!AUTH) {
  console.error("HALT: KIBANA_WD_AUTH not set");
  process.exit(1);
}

const AUTH_B64 = Buffer.from(AUTH).toString("base64");
const HEADERS = {
  Authorization: `Basic ${AUTH_B64}`,
  "kbn-xsrf": "true",
  "Content-Type": "application/json",
};

function defaultWindows() {
  const now = new Date();
  const today930 = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 30, 0)
  );
  if (now < today930) today930.setUTCDate(today930.getUTCDate() - 1);
  const yesterday930 = new Date(today930);
  yesterday930.setUTCDate(yesterday930.getUTCDate() - 1);
  const dayBefore930 = new Date(yesterday930);
  dayBefore930.setUTCDate(dayBefore930.getUTCDate() - 1);

  const fmt = (d) => d.toISOString().slice(0, 10);
  const idxFmt = (d) => {
    const s = fmt(d);
    return `webgilitydesktop-${s.replace(/-/g, ".")}`;
  };

  const today = fmt(today930);
  const yesterday = fmt(yesterday930);
  const dayBefore = fmt(dayBefore930);

  return {
    reportDate: today,
    startUtc: yesterday930.toISOString(),
    endUtc: today930.toISOString(),
    prevStartUtc: dayBefore930.toISOString(),
    prevEndUtc: yesterday930.toISOString(),
    indices: `${idxFmt(yesterday930)},${idxFmt(today930)}`,
    prevIndices: `${idxFmt(dayBefore930)},${idxFmt(yesterday930)}`,
    periodIst: `${yesterday} 09:00 IST → ${today} 09:00 IST`,
    compareIst: `${dayBefore} 09:00 IST → ${yesterday} 09:00 IST`,
    indexLabel: `${idxFmt(yesterday930).replace("webgilitydesktop-", "")} / ${idxFmt(today930).replace("webgilitydesktop-", "")}`,
  };
}

async function esSearch(indices, body) {
  const path = encodeURIComponent(`${indices}/_search`);
  const url = `${KIBANA_BASE}/api/console/proxy?path=${path}&method=POST`;
  const resp = await fetch(url, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ES ${resp.status}: ${text.slice(0, 300)}`);
  }
  return resp.json();
}

function mainAggQuery(start, end) {
  return {
    query: { bool: { must: [{ range: { timestamp: { gte: start, lt: end } } }] } },
    size: 0,
    track_total_hits: true,
    aggs: {
      by_level: { terms: { field: "level.keyword", size: 10 } },
      errors_only: {
        filter: { term: { "level.keyword": "Error" } },
        aggs: {
          by_hour: {
            date_histogram: {
              field: "timestamp",
              fixed_interval: "1h",
              time_zone: "+05:30",
              min_doc_count: 0,
              extended_bounds: { min: start, max: end },
            },
          },
          by_module: { terms: { field: "module.keyword", size: 20, missing: "Unknown" } },
          by_store: { terms: { field: "store.keyword", size: 20, missing: "Unknown" } },
          by_tag: { terms: { field: "tag.keyword", size: 20, missing: "Unknown" } },
          by_process: { terms: { field: "process.keyword", size: 10, missing: "Unknown" } },
          top_messages: { terms: { field: "message.keyword", size: 15 } },
          top_subscribers: { terms: { field: "subscriberID", size: 10 } },
        },
      },
      fatals: {
        filter: { term: { "level.keyword": "Fatal" } },
        aggs: {
          by_message: { terms: { field: "message.keyword", size: 15 } },
          by_store: { terms: { field: "store.keyword", size: 15, missing: "Unknown" } },
        },
      },
    },
  };
}

function payoutQuery(start, end, withRate = true) {
  const must = [
    { range: { timestamp: { gte: start, lt: end } } },
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
  return { query: { bool: { must } }, size: 0, track_total_hits: true, aggs };
}

function amazonQuery(start, end) {
  return {
    query: {
      bool: {
        must: [
          { range: { timestamp: { gte: start, lt: end } } },
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
      unique_subscribers: { cardinality: { field: "subscriberID" } },
    },
  };
}

function perfQuery(start, end, module, methodType) {
  return {
    query: {
      bool: {
        must: [
          { range: { timestamp: { gte: start, lt: end } } },
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

function perfQueryFallback(start, end, module) {
  return {
    query: {
      bool: {
        must: [
          { range: { timestamp: { gte: start, lt: end } } },
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

function bucketMap(buckets) {
  const m = new Map();
  for (const b of buckets ?? []) m.set(String(b.key), b.doc_count);
  return m;
}

function pctChange(cur, prev) {
  if (prev == null || prev === undefined) return { cls: "new", text: "NEW" };
  if (prev === 0) return cur === 0 ? { cls: "flat", text: "≈" } : { cls: "new", text: "NEW" };
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) <= 10) return { cls: "flat", text: "≈" };
  const sign = pct > 0 ? "↑" : "↓";
  const cls = pct > 0 ? "up" : "down";
  return { cls, text: `${sign}${Math.abs(pct).toFixed(1)}%` };
}

function execChange(cur, prev, lowerIsBetter = true) {
  const b = pctChange(cur, prev);
  if (b.text === "NEW") return b;
  if (b.text === "≈") return b;
  // For exec summary: down in errors is green (down class), up in errors is red (up class)
  return b;
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
  return Number(n ?? 0).toLocaleString("en-US");
}

function fmtMs(ms) {
  ms = Number(ms) || 0;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.floor((ms / 1000) % 60);
  const m = Math.floor(ms / 60000) % 60;
  const h = Math.floor(ms / 3600000);
  if (ms < 3600000) return `${m}m ${s}s`;
  return `${h}h ${m}m ${s}s`;
}

function fmtSec(sec) {
  sec = Number(sec) || 0;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  if (sec < 3600) return `${m}m ${s}s`;
  return `${h}h ${m}m`;
}

function pctBarFill(pct) {
  if (pct > 50) return "red";
  if (pct > 20) return "orange";
  if (pct > 10) return "amber";
  if (pct > 5) return "blue";
  return "gray";
}

function stepBarColor(pct) {
  if (pct > 80) return "red";
  if (pct > 50) return "orange";
  if (pct > 25) return "amber";
  return "blue";
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
    steps.push({
      num: parseInt(sm[1], 10),
      name: sm[2].trim(),
      ms: parseInt(sm[3], 10),
      records: sm[4] ? parseInt(sm[4], 10) : 0,
    });
  }
  steps.sort((a, b) => a.num - b.num);
  let maxStep = { name: "—", ms: 0 };
  for (const st of steps) {
    if (st.ms > maxStep.ms) maxStep = { name: st.name, ms: st.ms };
  }
  return {
    subscriberID: src.subscriberID,
    email: src.email || "—",
    processedRecords: src.processedRecords || 0,
    totalTime,
    steps,
    maxStep,
  };
}

function aggregatePerf(docs) {
  const bySub = new Map();
  const stepStats = new Map();

  for (const hit of docs) {
    const p = parsePerfDoc(hit._source);
    if (!p.subscriberID) continue;
    const sid = String(p.subscriberID);
    if (!bySub.has(sid)) {
      bySub.set(sid, {
        subscriberID: sid,
        email: p.email,
        runCount: 0,
        processedRecords: 0,
        totalTime: 0,
        maxStep: { name: "—", ms: 0 },
        allSteps: [],
      });
    }
    const rec = bySub.get(sid);
    rec.runCount++;
    rec.processedRecords += p.processedRecords;
    rec.totalTime += p.totalTime;
    if (p.maxStep.ms > rec.maxStep.ms) rec.maxStep = { ...p.maxStep };
    rec.allSteps.push(...p.steps);

    for (const st of p.steps) {
      const key = `${st.num}:${st.name}`;
      if (!stepStats.has(key))
        stepStats.set(key, { num: st.num, name: st.name, count: 0, totalMs: 0, maxMs: 0, minMs: Infinity });
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

  const maxTotal = top5[0]?.totalTime || 1;
  for (const t of top5) {
    t.pct = (t.totalTime / maxTotal) * 100;
    const stepTotals = new Map();
    for (const st of t.allSteps) {
      const k = st.num;
      stepTotals.set(k, (stepTotals.get(k) || 0) + st.ms);
    }
    t.top3 = [...stepTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([num, ms]) => {
        const name = t.allSteps.find((s) => s.num === num)?.name || "";
        return { num, name, ms };
      });
  }

  const stepsOrdered = [...stepStats.values()].sort((a, b) => a.num - b.num);
  const maxAvg = Math.max(...stepsOrdered.map((s) => s.totalMs / s.count), 1);

  return { top5, stepsOrdered, maxAvg, runCount: docs.length };
}

const DONUT_COLORS = ["#96bf48", "#7f54b3", "#2196F3", "#ff9900", "#ee672d", "#94a3b8"];

function buildDonut(buckets, total) {
  if (!total) return { gradient: "conic-gradient(#e2e8f0 0deg 360deg)", legend: "" };
  let deg = 0;
  const parts = [];
  const legend = [];
  buckets.slice(0, 5).forEach((b, i) => {
    const pct = (b.doc_count / total) * 100;
    const span = (b.doc_count / total) * 360;
    const color = DONUT_COLORS[i % DONUT_COLORS.length];
    parts.push(`${color} ${deg}deg ${deg + span}deg`);
    deg += span;
    legend.push(
      `<span style="display:flex;align-items:center;gap:3px"><span style="width:8px;height:8px;background:${color};border-radius:50%;display:inline-block"></span>${esc(b.key)}</span>`
    );
  });
  if (deg < 360) parts.push(`${DONUT_COLORS[5]} ${deg}deg 360deg`);
  return {
    gradient: `conic-gradient(${parts.join(", ")})`,
    legend: legend.join("\n"),
  };
}

// Short URL cache
const urlCache = new Map();
let urlQueue = Promise.resolve();

function buildDiscoverPath(kql, from, to) {
  const q = kql.replace(/'/g, "\\'");
  return `/app/kibana#/discover?_g=(refreshInterval:(pause:!t,value:0),time:(from:'${from}',to:'${to}'))&_a=(columns:!(timestamp,level,message,store,module,subscriberID),index:'${INDEX_ID}',interval:auto,query:(language:kuery,query:'${q}'),sort:!(!(timestamp,desc)))`;
}

async function shortenUrl(kql, from, to) {
  const key = `${kql}|${from}|${to}`;
  if (urlCache.has(key)) return urlCache.get(key);
  const path = buildDiscoverPath(kql, from, to);
  const task = urlQueue.then(async () => {
    try {
      const resp = await fetch(`${KIBANA_BASE}/api/shorten_url`, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ url: path }),
        signal: AbortSignal.timeout(15_000),
      });
      if (resp.ok) {
        const j = await resp.json();
        const u = `https://kibana-wd.webgility.com/goto/${j.urlId}`;
        urlCache.set(key, u);
        return u;
      }
    } catch {}
    const fallback = `https://kibana-wd.webgility.com`;
    urlCache.set(key, fallback);
    return fallback;
  });
  urlQueue = task.catch(() => {});
  return task;
}

async function link(kql, from, to, text) {
  const u = await shortenUrl(kql, from, to);
  return `<a href="${u}" target="_blank" title="${esc(kql)}">${text}</a>`;
}

const CSS = `*{box-sizing:border-box;margin:0;padding:0}
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
.exec-card.total{border-color:#3b82f6}
.exec-card.error{border-color:#ef4444}
.exec-card.fatal{border-color:#7c3aed}
.exec-card.warning{border-color:#f59e0b}
.exec-card.info{border-color:#10b981}
.exec-card.rate{border-color:#f97316}
.exec-card .label{font-size:.68rem;font-weight:600;text-transform:uppercase;color:#64748b;letter-spacing:.05em;margin-bottom:6px}
.exec-card .value{font-size:1.5rem;font-weight:800;color:#0f172a}
.exec-card .value a{color:inherit}
.exec-card .change{font-size:.7rem;margin-top:4px}
.cb{display:inline-flex;align-items:center;gap:2px;padding:2px 7px;border-radius:9999px;font-size:.68rem;font-weight:600}
.cb.down{background:#dcfce7;color:#166534}
.cb.up{background:#fef2f2;color:#991b1b}
.cb.new{background:#eff6ff;color:#1e40af}
.cb.flat{background:#f3f4f6;color:#6b7280}
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
.pct-bar-fill.red{background:#ef4444}
.pct-bar-fill.orange{background:#f97316}
.pct-bar-fill.amber{background:#eab308}
.pct-bar-fill.blue{background:#3b82f6}
.pct-bar-fill.gray{background:#94a3b8}
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
.step-bar.red{background:#ef4444}
.step-bar.orange{background:#f97316}
.step-bar.amber{background:#eab308}
.step-bar.blue{background:#3b82f6}
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
.placeholder{color:#64748b;font-style:italic;padding:12px 0}`;

async function main() {
  const w = defaultWindows();
  console.log(`Report date: ${w.reportDate}`);
  console.log(`Window: ${w.startUtc} → ${w.endUtc}`);

  // Connectivity
  const status = await fetch(`${KIBANA_BASE}/api/status`, { headers: HEADERS });
  if (!status.ok) {
    console.error(`HALT: Kibana status ${status.status}`);
    process.exit(1);
  }

  console.log("Running queries...");
  const [q1, q2, q3, q4, q5raw, q6raw] = await Promise.all([
    esSearch(w.indices, mainAggQuery(w.startUtc, w.endUtc)),
    esSearch(w.prevIndices, mainAggQuery(w.prevStartUtc, w.prevEndUtc)),
    esSearch(w.indices, payoutQuery(w.startUtc, w.endUtc, true)).catch(() => null),
    esSearch(w.indices, amazonQuery(w.startUtc, w.endUtc)),
    esSearch(w.indices, perfQuery(w.startUtc, w.endUtc, "PayoutPosting", "Payout_PerformanceSummary")),
    esSearch(w.indices, perfQuery(w.startUtc, w.endUtc, "AmazonSettlementReport", "Settlement_PerformanceSummary")),
  ]);

  let q3prev = null,
    q4prev = null,
    q5prev = null,
    q6prev = null;
  try {
    [q3prev, q4prev, q5prev, q6prev] = await Promise.all([
      esSearch(w.prevIndices, payoutQuery(w.prevStartUtc, w.prevEndUtc, true)).catch(() =>
        esSearch(w.prevIndices, payoutQuery(w.prevStartUtc, w.prevEndUtc, false))
      ),
      esSearch(w.prevIndices, amazonQuery(w.prevStartUtc, w.prevEndUtc)),
      esSearch(w.prevIndices, perfQuery(w.prevStartUtc, w.prevEndUtc, "PayoutPosting", "Payout_PerformanceSummary")),
      esSearch(w.prevIndices, perfQuery(w.prevStartUtc, w.prevEndUtc, "AmazonSettlementReport", "Settlement_PerformanceSummary")),
    ]);
  } catch (e) {
    console.warn("Prev specialty queries partial fail:", e.message);
  }

  if (q3 && (q3.hits?.total?.value ?? 0) === 0) {
    q3 = await esSearch(w.indices, payoutQuery(w.startUtc, w.endUtc, false));
  }

  let q5 = q5raw;
  if ((q5.hits?.hits?.length ?? 0) === 0) {
    q5 = await esSearch(w.indices, perfQueryFallback(w.startUtc, w.endUtc, "PayoutPosting"));
  }
  let q6 = q6raw;
  if ((q6.hits?.hits?.length ?? 0) === 0) {
    q6 = await esSearch(w.indices, perfQueryFallback(w.startUtc, w.endUtc, "AmazonSettlementReport"));
  }

  const total = q1.hits?.total?.value ?? q1.hits?.total ?? 0;
  if (total === 0 && !q1.aggregations) {
    console.error("HALT: Q1 returned no data and no aggregations — possible auth failure");
    process.exit(1);
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
  const totalPrev = q2.hits?.total?.value ?? q2.hits?.total ?? 0;
  const errorRate = total ? ((errors / total) * 100).toFixed(2) : "0.00";
  const errorRatePrev = totalPrev ? ((errorsPrev / totalPrev) * 100).toFixed(2) : "0.00";

  const errAggs = q1.aggregations?.errors_only ?? {};
  const errAggsPrev = q2.aggregations?.errors_only ?? {};
  const modPrev = bucketMap(errAggsPrev.by_module?.buckets);
  const storePrev = bucketMap(errAggsPrev.by_store?.buckets);
  const tagPrev = bucketMap(errAggsPrev.by_tag?.buckets);
  const procPrev = bucketMap(errAggsPrev.by_process?.buckets);
  const msgPrev = bucketMap(errAggsPrev.top_messages?.buckets);
  const subPrev = bucketMap(errAggsPrev.top_subscribers?.buckets);

  const fatalAggs = q1.aggregations?.fatals ?? {};
  const fatalAggsPrev = q2.aggregations?.fatals ?? {};
  const fatalMsgPrev = bucketMap(fatalAggsPrev.by_message?.buckets);
  const fatalStorePrev = bucketMap(fatalAggsPrev.by_store?.buckets);

  const from = w.startUtc;
  const to = w.endUtc;
  const generated = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";

  console.log("Generating short URLs (batched)...");

  // Pre-generate key URLs
  const kqlTotal = "*";
  const kqlError = 'level.keyword:"Error"';
  const kqlFatal = 'level.keyword:"Fatal"';
  const kqlWarning = 'level.keyword:"Warning"';
  const kqlInfo = 'level.keyword:"Info"';

  const [urlTotal, urlError, urlFatal, urlWarning, urlInfo] = await Promise.all([
    shortenUrl(kqlTotal, from, to),
    shortenUrl(kqlError, from, to),
    shortenUrl(kqlFatal, from, to),
    shortenUrl(kqlWarning, from, to),
    shortenUrl(kqlInfo, from, to),
  ]);

  // Hourly chart
  const hourBuckets = errAggs.by_hour?.buckets ?? [];
  const hourCounts = hourBuckets.map((b) => ({
    hour: new Date(b.key).getUTCHours(),
    label: String(new Date(b.key).getUTCHours()).padStart(2, "0"),
    count: b.doc_count,
  }));
  const maxHour = Math.max(...hourCounts.map((h) => h.count), 1);
  let peakHour = hourCounts[0];
  for (const h of hourCounts) if (h.count > (peakHour?.count ?? 0)) peakHour = h;

  const hourBars = hourCounts
    .map((h) => {
      const pct = Math.max((h.count / maxHour) * 100, 0.1);
      const rel = (h.count / maxHour) * 100;
      const cls = rel > 60 ? "c4" : rel > 25 ? "c3" : rel > 10 ? "c2" : "c1";
      return `<div class="bar-col"><div class="bar ${cls}" style="height:${pct.toFixed(1)}%" title="${h.label}:00 IST — ${h.count} errors"></div><div class="bar-lbl">${h.label}</div></div>`;
    })
    .join("\n");

  async function breakdownTable(buckets, prevMap, type) {
    const rows = [];
    for (const b of buckets ?? []) {
      const key = String(b.key);
      let kql;
      if (type === "module")
        kql = key === "Unknown" ? 'level.keyword:"Error" AND NOT _exists_:module' : `level.keyword:"Error" AND module.keyword:"${key}"`;
      else if (type === "store")
        kql = `level.keyword:"Error" AND store.keyword:"${key}"`;
      else if (type === "tag")
        kql = key === "Unknown" ? 'level.keyword:"Error" AND NOT _exists_:tag' : `level.keyword:"Error" AND tag.keyword:"${key}"`;
      else kql = `level.keyword:"Error" AND process.keyword:"${key}"`;

      const pctOfErr = errors ? ((b.doc_count / errors) * 100).toFixed(1) : "0";
      const nameLink = await link(kql, from, to, esc(key));
      const vs = badge(pctChange(b.doc_count, prevMap.get(key)));
      const pctBar =
        type === "module" || type === "store"
          ? `<td><div class="pct-bar-wrap"><span class="pct-text">${pctOfErr}%</span><div class="pct-bar"><div class="pct-bar-fill ${pctBarFill(parseFloat(pctOfErr))}" style="width:${Math.min(parseFloat(pctOfErr), 100)}%"></div></div></div></td>`
          : "";
      rows.push(
        `<tr><td>${nameLink}</td><td class="r">${fmtNum(b.doc_count)}</td>${pctBar}<td>${vs}</td></tr>`
      );
    }
    return rows.join("\n");
  }

  const modRows = await breakdownTable(errAggs.by_module?.buckets, modPrev, "module");
  const storeRows = await breakdownTable(errAggs.by_store?.buckets, storePrev, "store");
  const tagRows = await breakdownTable(errAggs.by_tag?.buckets, tagPrev, "tag");
  const procRows = await breakdownTable(errAggs.by_process?.buckets, procPrev, "process");

  // Top messages
  const msgRows = [];
  let mi = 1;
  for (const b of errAggs.top_messages?.buckets ?? []) {
    const kql = `level.keyword:"Error" AND message.keyword:"${String(b.key).replace(/"/g, '\\"')}"`;
    const l = await link(kql, from, to, esc(b.key.length > 80 ? b.key.slice(0, 80) + "…" : b.key));
    msgRows.push(
      `<tr><td>${mi++}</td><td>${l}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${badge(pctChange(b.doc_count, msgPrev.get(String(b.key))))}</td></tr>`
    );
  }

  // Top subscribers
  const subRows = [];
  let si = 1;
  for (const b of errAggs.top_subscribers?.buckets ?? []) {
    const kql = `level.keyword:"Error" AND subscriberID:${b.key}`;
    const l = await link(kql, from, to, String(b.key));
    const pctE = errors ? ((b.doc_count / errors) * 100).toFixed(1) : "0";
    subRows.push(
      `<tr><td>${si++}</td><td>${l}</td><td class="r">${fmtNum(b.doc_count)}</td><td><div class="pct-bar-wrap"><span class="pct-text">${pctE}%</span><div class="pct-bar"><div class="pct-bar-fill ${pctBarFill(parseFloat(pctE))}" style="width:${Math.min(parseFloat(pctE), 100)}%"></div></div></div></td><td>${badge(pctChange(b.doc_count, subPrev.get(String(b.key))))}</td></tr>`
    );
  }

  // Fatals
  const fatalTotal = fatalAggs.doc_count ?? fatals;
  const fatalMsgRows = [];
  for (const b of fatalAggs.by_message?.buckets ?? []) {
    const kql = `level.keyword:"Fatal" AND message.keyword:"${String(b.key).replace(/"/g, '\\"')}"`;
    const l = await link(kql, from, to, esc(b.key.length > 60 ? b.key.slice(0, 60) + "…" : b.key));
    fatalMsgRows.push(
      `<tr><td>${l}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${badge(pctChange(b.doc_count, fatalMsgPrev.get(String(b.key))))}</td></tr>`
    );
  }

  const fatalStoreBuckets = fatalAggs.by_store?.buckets ?? [];
  const donut = buildDonut(fatalStoreBuckets, fatalTotal);
  const fatalStoreRows = [];
  for (const b of fatalStoreBuckets) {
    const kql = `level.keyword:"Fatal" AND store.keyword:"${b.key}"`;
    const pctF = fatalTotal ? ((b.doc_count / fatalTotal) * 100).toFixed(1) : "0";
    const l = await link(kql, from, to, esc(b.key));
    fatalStoreRows.push(
      `<tr><td>${l}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${pctF}%</td><td>${badge(pctChange(b.doc_count, fatalStorePrev.get(String(b.key))))}</td></tr>`
    );
  }

  // Shopify payout
  let payoutSection = "";
  const pHits = q3?.hits?.total?.value ?? 0;
  const pAggs = q3?.aggregations ?? {};
  const pPrevAggs = q3prev?.aggregations ?? {};
  const totalProcessed = pAggs.total_processed?.value ?? 0;
  const totalProcessedPrev = pPrevAggs.total_processed?.value ?? 0;
  const pStats = pAggs.payout_time_stats?.value ?? {};

  if (pHits === 0 && totalProcessed === 0) {
    payoutSection = `<div class="card"><div class="card-header"><h2>💳 Shopify Payout Performance</h2></div><div class="card-body"><p class="placeholder">No PayoutPosting data found for this period</p></div></div>`;
  } else {
    const urlPayout = await shortenUrl(
      'level.keyword:"Info" AND module.keyword:"PayoutPosting" AND store.keyword:"Shopify"',
      from,
      to
    );
    const subRowsP = [];
    let pi = 1;
    for (const b of pAggs.by_subscriber?.buckets ?? []) {
      const rec = b.processed_sum?.value ?? 0;
      const pctT = totalProcessed ? ((rec / totalProcessed) * 100).toFixed(1) : "0";
      const prevB = pPrevAggs.by_subscriber?.buckets?.find((x) => String(x.key) === String(b.key));
      const prevRec = prevB?.processed_sum?.value ?? 0;
      const u = await shortenUrl(
        `level.keyword:"Info" AND module.keyword:"PayoutPosting" AND subscriberID:${b.key}`,
        from,
        to
      );
      subRowsP.push(
        `<tr><td>${pi++}</td><td><a href="${u}" target="_blank">${b.key}</a></td><td class="r">${fmtNum(rec)}</td><td class="r">${b.batch_count?.value ?? b.doc_count}</td><td><div class="pct-bar-wrap"><span class="pct-text">${pctT}%</span><div class="pct-bar"><div class="pct-bar-fill ${pctBarFill(parseFloat(pctT))}" style="width:${pctT}%"></div></div></div></td><td>${badge(pctChange(rec, prevRec))}</td></tr>`
      );
    }
    const minT = pStats.min_per_payout_seconds ?? 0;
    const maxT = pStats.max_per_payout_seconds ?? 0;
    const avgT = pStats.avg_per_payout_seconds ?? 0;
    const totalSec = pStats.total_seconds ?? 0;
    payoutSection = `<div class="card"><div class="card-header"><h2>💳 Shopify Payout Performance</h2><span class="subtitle">module=PayoutPosting, store=Shopify</span></div><div class="card-body">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px">
      <div class="exec-card" style="border-color:#3b82f6"><div class="label">Records Processed</div><div class="value" style="font-size:1.3rem"><a href="${urlPayout}" target="_blank">${fmtNum(totalProcessed)}</a></div><div class="change">${badge(pctChange(totalProcessed, totalProcessedPrev))} vs prev ${fmtNum(totalProcessedPrev)}</div></div>
      <div class="exec-card" style="border-color:#10b981"><div class="label">Batches</div><div class="value" style="font-size:1.1rem">${pStats.batch_count ?? pAggs.by_subscriber?.buckets?.length ?? "—"}</div></div>
      <div class="exec-card" style="border-color:#f97316"><div class="label">Min Time/Record</div><div class="value" style="font-size:1.1rem">${fmtSec(minT)}</div></div>
      <div class="exec-card" style="border-color:#ef4444"><div class="label">Max Time/Record</div><div class="value" style="font-size:1.1rem">${fmtSec(maxT)}</div></div>
      <div class="exec-card" style="border-color:#8b5cf6"><div class="label">Avg Time/Record</div><div class="value" style="font-size:1.1rem">${fmtSec(avgT)}</div></div>
      <div class="exec-card" style="border-color:#6366f1"><div class="label">Est. Total Time</div><div class="value" style="font-size:1.1rem">${fmtSec(totalSec)}</div></div>
    </div>
    <div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">Top 5 Subscribers by Records Processed</div>
    <table class="tbl"><thead><tr><th>#</th><th>Subscriber ID</th><th class="r">Records</th><th class="r">Batches</th><th>% of Total</th><th>vs Prev</th></tr></thead><tbody>${subRowsP || '<tr><td colspan="6" class="placeholder">No subscriber breakdown</td></tr>'}</tbody></table>
    </div></div>`;
  }

  // Amazon
  const aTotal = q4.hits?.total?.value ?? 0;
  const aLv = levelMap(q4.aggregations);
  const aLvPrev = levelMap(q4prev?.aggregations);
  const aErrors = aLv.Error ?? 0;
  const aErrorsPrev = aLvPrev.Error ?? 0;
  const aInfo = aLv.Info ?? 0;
  const aInfoPrev = aLvPrev.Info ?? 0;
  const aSubs = q4.aggregations?.unique_subscribers?.value ?? q4.aggregations?.top_subscribers?.buckets?.length ?? 0;
  const aSubsPrev = q4prev?.aggregations?.unique_subscribers?.value ?? 0;
  const aProcessed = q4.aggregations?.total_processed?.value || aInfo;

  let amazonSection = "";
  if (aTotal === 0) {
    amazonSection = `<div class="card"><div class="card-header"><h2>🛒 Amazon Settlement Report</h2></div><div class="card-body"><p class="placeholder">No Amazon Settlement activity found for this period</p></div></div>`;
  } else {
    const urlAll = await shortenUrl('module.keyword:"AmazonSettlementReport"', from, to);
    const urlErr = await shortenUrl(
      'level.keyword:"Error" AND module.keyword:"AmazonSettlementReport"',
      from,
      to
    );
    const errMsgs = q4.aggregations?.top_errors?.by_message?.buckets ?? [];
    const errMsgRows = [];
    for (const b of errMsgs) {
      const kql = `level.keyword:"Error" AND module.keyword:"AmazonSettlementReport" AND message.keyword:"${String(b.key).replace(/"/g, '\\"')}"`;
      const l = await link(kql, from, to, esc(b.key));
      errMsgRows.push(`<tr><td>${l}</td><td class="r">${fmtNum(b.doc_count)}</td><td>${badge(pctChange(b.doc_count, 0))}</td></tr>`);
    }
    const aSubRows = [];
    let ai = 1;
    for (const b of q4.aggregations?.top_subscribers?.buckets ?? []) {
      const lvls = {};
      for (const lb of b.by_level?.buckets ?? []) lvls[lb.key] = lb.doc_count;
      const u = await shortenUrl(`module.keyword:"AmazonSettlementReport" AND subscriberID:${b.key}`, from, to);
      aSubRows.push(
        `<tr><td>${ai++}</td><td><a href="${u}" target="_blank">${b.key}</a></td><td class="r">${fmtNum(b.doc_count)}</td><td class="r">${fmtNum(lvls.Error ?? 0)}</td><td class="r">${fmtNum(b.processed_sum?.value ?? lvls.Info ?? 0)}</td><td>${badge(pctChange(b.doc_count, 0))}</td></tr>`
      );
    }
    amazonSection = `<div class="card"><div class="card-header"><h2>🛒 Amazon Settlement Report</h2><span class="subtitle">module=AmazonSettlementReport</span></div><div class="card-body">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px">
      <div class="exec-card" style="border-color:#3b82f6"><div class="label">Total Events</div><div class="value" style="font-size:1.3rem"><a href="${urlAll}" target="_blank">${fmtNum(aTotal)}</a></div><div class="change">${badge(pctChange(aTotal, q4prev?.hits?.total?.value ?? 0))}</div></div>
      <div class="exec-card" style="border-color:#ef4444"><div class="label">Errors</div><div class="value" style="font-size:1.3rem"><a href="${urlErr}" target="_blank">${fmtNum(aErrors)}</a></div><div class="change">${badge(pctChange(aErrors, aErrorsPrev))}</div></div>
      <div class="exec-card" style="border-color:#10b981"><div class="label">Settlements Processed</div><div class="value" style="font-size:1.3rem">${fmtNum(aProcessed)}</div><div class="change">${badge(pctChange(aInfo, aInfoPrev))}</div></div>
      <div class="exec-card" style="border-color:#f97316"><div class="label">Affected Subscribers</div><div class="value" style="font-size:1.3rem">${fmtNum(aSubs)}</div><div class="change">${badge(pctChange(aSubs, aSubsPrev))}</div></div>
    </div>
    ${errMsgRows.length ? `<div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">Top Error Messages</div><table class="tbl"><thead><tr><th>Message</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${errMsgRows.join("")}</tbody></table>` : '<p style="font-size:.75rem;color:#64748b;margin-bottom:12px">No error messages found for this period.</p>'}
    <div style="font-size:.78rem;font-weight:700;color:#475569;margin:16px 0 8px">Top 5 Subscribers by Total Events</div>
    <table class="tbl"><thead><tr><th>#</th><th>Subscriber ID</th><th class="r">Total Events</th><th class="r">Errors</th><th class="r">Settlements</th><th>vs Prev</th></tr></thead><tbody>${aSubRows.join("") || '<tr><td colspan="6" class="placeholder">No data</td></tr>'}</tbody></table>
    </div></div>`;
  }

  async function perfSection(title, module, methodLabel, qPerf, qPerfPrev) {
    const docs = qPerf.hits?.hits ?? [];
    const agg = aggregatePerf(docs);
    const aggPrev = aggregatePerf(qPerfPrev?.hits?.hits ?? []);
    const prevTopMap = new Map(aggPrev.top5.map((t) => [t.subscriberID, t.totalTime]));

    if (!docs.length) {
      return `<div class="card"><div class="card-header"><h2>${title}</h2></div><div class="card-body"><p class="placeholder">No <code>${methodLabel}</code> logs found in this period.</p></div></div>`;
    }

    const rows = [];
    let rank = 1;
    for (const t of agg.top5) {
      const u = await shortenUrl(
        `tag.keyword:"Performance" AND module.keyword:"${module}" AND subscriberID:${t.subscriberID}`,
        from,
        to
      );
      const top3html = t.top3
        .map((s) => `S${s.num}: ${esc(s.name)}: ${fmtMs(s.ms)}`)
        .join("<br>");
      const barColor = stepBarColor(t.pct);
      rows.push(`<tr>
        <td>${rank++}</td>
        <td><a href="${u}" target="_blank">${t.subscriberID}</a></td>
        <td class="perf-email">${esc(t.email)}</td>
        <td class="r">${t.runCount}</td>
        <td class="r">${fmtNum(t.processedRecords)}</td>
        <td class="r perf-time">${fmtMs(t.totalTime)}</td>
        <td><div class="pct-bar-wrap"><span class="pct-text">${t.pct.toFixed(1)}%</span><div class="pct-bar"><div class="pct-bar-fill ${barColor}" style="width:${t.pct}%"></div></div></div></td>
        <td class="perf-step-max">${esc(t.maxStep.name)}<br><span class="perf-step-ms">${fmtMs(t.maxStep.ms)}</span></td>
        <td class="perf-step-detail">${top3html}</td>
        <td>${badge(pctChange(t.totalTime, prevTopMap.get(t.subscriberID)))}</td>
      </tr>`);
    }

    const stepBars = agg.stepsOrdered
      .map((s) => {
        const avg = s.totalMs / s.count;
        const pct = (avg / agg.maxAvg) * 100;
        const shortName = s.name.length > 14 ? s.name.slice(0, 14) + "." : s.name;
        return `<div class="step-row"><div class="step-label" title="S${s.num}: ${esc(s.name)}">S${s.num}: ${esc(shortName)}</div><div class="step-bar-wrap"><div class="step-bar ${stepBarColor(pct)}" style="width:${Math.max(pct, 1).toFixed(1)}%"></div><span class="step-bar-val">${fmtMs(avg)} avg &nbsp;/&nbsp; ${fmtMs(s.maxMs)} max &nbsp;(${s.count} runs)</span></div></div>`;
      })
      .join("\n");

    return `<div class="card"><div class="card-header"><h2>${title}</h2><span class="subtitle">tag=Performance — ${agg.runCount} runs in period</span></div><div class="card-body">
    <div style="font-size:.8rem;font-weight:700;color:#334155;margin-bottom:12px">Sub-section A: Top 5 Clients by Total Processing Time</div>
    <div style="overflow-x:auto"><table class="perf-table"><thead><tr><th>#</th><th>Subscriber ID</th><th>Email</th><th>Runs</th><th>Transactions</th><th>Total Time</th><th>% of Max</th><th>Slowest Step</th><th>Top 3 Steps by Time</th><th>vs Prev</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>
    <div style="font-size:.8rem;font-weight:700;color:#334155;margin:20px 0 12px">Sub-section B: Step Performance Bar Chart (${agg.runCount} runs)</div>
    <div class="step-chart"><div class="step-chart-title">Avg Step Processing Time — ${module} (${w.periodIst})</div>${stepBars}</div>
    </div></div>`;
  }

  const perfPayout = await perfSection(
    "🏃 Shopify Payout — Performance Deep-Dive",
    "PayoutPosting",
    "Payout_PerformanceSummary",
    q5,
    q5prev
  );
  const perfAmazon = await perfSection(
    "🏃 Amazon Settlement — Performance Deep-Dive",
    "AmazonSettlementReport",
    "Settlement_PerformanceSummary",
    q6,
    q6prev
  );

  // Insights
  const topMod = errAggs.by_module?.buckets?.[0];
  const topSub = errAggs.top_subscribers?.buckets?.[0];
  const topMsg = errAggs.top_messages?.buckets?.[0];
  const insights = [];

  if (topSub)
    insights.push({
      type: "danger",
      icon: "!",
      title: `Subscriber ${topSub.key} — Top Error Source`,
      text: `${topSub.key} generated ${fmtNum(topSub.doc_count)} errors (${((topSub.doc_count / errors) * 100).toFixed(1)}% of all errors). ${badge(pctChange(topSub.doc_count, subPrev.get(String(topSub.key))))} vs previous day.`,
    });
  if (topMod)
    insights.push({
      type: "warning",
      icon: "↑",
      title: `Top Module: ${topMod.key}`,
      text: `${topMod.key} accounts for ${fmtNum(topMod.doc_count)} errors (${((topMod.doc_count / errors) * 100).toFixed(1)}% of total).`,
    });
  if (parseFloat(errorRate) > parseFloat(errorRatePrev))
    insights.push({
      type: "warning",
      icon: "↑",
      title: "Error Rate Increased",
      text: `Error rate is ${errorRate}% vs ${errorRatePrev}% previous period despite ${badge(pctChange(total, totalPrev))} total volume change.`,
    });
  else
    insights.push({
      type: "healthy",
      icon: "✓",
      title: "Error Rate Stable or Improved",
      text: `Error rate ${errorRate}% vs ${errorRatePrev}% previous period.`,
    });
  if (fatals < fatalsPrev)
    insights.push({
      type: "healthy",
      icon: "✓",
      title: "Fatal Events Reduced",
      text: `Fatals ${fmtNum(fatals)} vs ${fmtNum(fatalsPrev)} previous day (${badge(pctChange(fatals, fatalsPrev))}).`,
    });
  if (topMsg)
    insights.push({
      type: "spike",
      icon: "⚡",
      title: `Top Error: ${String(topMsg.key).slice(0, 50)}`,
      text: `${fmtNum(topMsg.doc_count)} occurrences. ${badge(pctChange(topMsg.doc_count, msgPrev.get(String(topMsg.key))))} vs prev.`,
    });
  if (totalProcessed > 0)
    insights.push({
      type: "healthy",
      icon: "✓",
      title: "Shopify Payout Activity",
      text: `Processed ${fmtNum(totalProcessed)} payout records. ${badge(pctChange(totalProcessed, totalProcessedPrev))} vs prev.`,
    });
  if (aTotal > 0)
    insights.push({
      type: "healthy",
      icon: "✓",
      title: "Amazon Settlement Activity",
      text: `${fmtNum(aTotal)} settlement events across ${fmtNum(aSubs)} subscribers.`,
    });

  const insightHtml = insights
    .map(
      (i) =>
        `<div class="insight-card ${i.type}"><div class="icon">${i.icon}</div><h4>${esc(i.title)}</h4><p>${i.text}</p></div>`
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WD Kibana Daily Log Report — ${w.reportDate}</title>
<style>${CSS}</style>
</head>
<body>
<div class="page">

<div class="rpt-header">
  <h1>WD Kibana Daily Log Report — ${w.reportDate}</h1>
  <div class="meta">
    <span>📅 Period: ${w.periodIst}</span>
    <span>📊 Index: ${w.indexLabel}</span>
    <span>⚖️ Compared to: ${w.compareIst}</span>
    <span>🕐 Generated: ${generated}</span>
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>📋 Executive Summary</h2><span class="subtitle">Total docs: ${fmtNum(total)} vs ${fmtNum(totalPrev)} prev day</span></div>
  <div class="card-body">
    <div class="exec-grid">
      <div class="exec-card total"><div class="label">Total Events</div><div class="value"><a href="${urlTotal}" target="_blank">${fmtNum(total)}</a></div><div class="change">${badge(pctChange(total, totalPrev))} vs prev ${fmtNum(totalPrev)}</div></div>
      <div class="exec-card error"><div class="label">Errors</div><div class="value"><a href="${urlError}" target="_blank">${fmtNum(errors)}</a></div><div class="change">${badge(pctChange(errors, errorsPrev))} vs prev ${fmtNum(errorsPrev)}</div></div>
      <div class="exec-card fatal"><div class="label">Fatals</div><div class="value"><a href="${urlFatal}" target="_blank">${fmtNum(fatals)}</a></div><div class="change">${badge(pctChange(fatals, fatalsPrev))} vs prev ${fmtNum(fatalsPrev)}</div></div>
      <div class="exec-card warning"><div class="label">Warnings</div><div class="value"><a href="${urlWarning}" target="_blank">${fmtNum(warnings)}</a></div><div class="change">${badge(pctChange(warnings, warningsPrev))} vs prev ${fmtNum(warningsPrev)}</div></div>
      <div class="exec-card info"><div class="label">Info</div><div class="value"><a href="${urlInfo}" target="_blank">${fmtNum(info)}</a></div><div class="change">${badge(pctChange(info, infoPrev))} vs prev ${fmtNum(infoPrev)}</div></div>
      <div class="exec-card rate"><div class="label">Error Rate</div><div class="value">${errorRate}%</div><div class="change">${badge(pctChange(parseFloat(errorRate), parseFloat(errorRatePrev)))} vs prev ${errorRatePrev}%</div></div>
    </div>
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>⏱ Hourly Error Timeline (IST)</h2><span class="subtitle">Peak: ${fmtNum(peakHour?.count ?? 0)} errors at ${peakHour?.label ?? "—"}:00 IST | ${w.periodIst}</span></div>
  <div class="card-body">
    ${hourCounts.length ? `<div class="bar-chart">${hourBars}</div>` : '<p class="placeholder">No error events found in this period</p>'}
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
    ${errors ? `<div class="grid-2">
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Module</div>
      <table class="tbl"><thead><tr><th>Module</th><th class="r">Count</th><th>% of Errors</th><th>vs Prev</th></tr></thead><tbody>${modRows || '<tr><td colspan="4" class="placeholder">No data found</td></tr>'}</tbody></table></div>
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Store</div>
      <table class="tbl"><thead><tr><th>Store</th><th class="r">Count</th><th>%</th><th>vs Prev</th></tr></thead><tbody>${storeRows || '<tr><td colspan="4" class="placeholder">No data found</td></tr>'}</tbody></table></div>
    </div>
    <div class="section-sep"></div>
    <div class="grid-2" style="margin-top:16px">
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Tag</div>
      <table class="tbl"><thead><tr><th>Tag</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${tagRows || '<tr><td colspan="3" class="placeholder">No data found</td></tr>'}</tbody></table></div>
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Process</div>
      <table class="tbl"><thead><tr><th>Process</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${procRows || '<tr><td colspan="3" class="placeholder">No data found</td></tr>'}</tbody></table></div>
    </div>` : '<p class="placeholder">No error events found in this period</p>'}
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>⚠️ Top Error Messages</h2><span class="subtitle">Top 15 by frequency</span></div>
  <div class="card-body">
    ${msgRows.length ? `<table class="tbl"><thead><tr><th>#</th><th>Message</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${msgRows}</tbody></table>` : '<p class="placeholder">No error messages found in this period</p>'}
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>👥 Top Error Subscribers</h2><span class="subtitle">Top 10 by error count</span></div>
  <div class="card-body">
    ${subRows.length ? `<table class="tbl"><thead><tr><th>#</th><th>Subscriber ID</th><th class="r">Error Count</th><th>% of Errors</th><th>vs Prev</th></tr></thead><tbody>${subRows}</tbody></table>` : '<p class="placeholder">No error subscribers found in this period</p>'}
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>💀 Fatal Events</h2><span class="subtitle">${fmtNum(fatalTotal)} fatal events ${badge(pctChange(fatals, fatalsPrev))}</span></div>
  <div class="card-body">
    ${fatalTotal ? `<div class="grid-2">
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Message</div>
      <table class="tbl"><thead><tr><th>Message</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>${fatalMsgRows.join("") || '<tr><td colspan="3" class="placeholder">No data found</td></tr>'}</tbody></table></div>
      <div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Store</div>
      <div class="donut-wrap"><div class="donut" style="background:${donut.gradient}"></div><div style="flex:1;display:flex;flex-wrap:wrap;gap:4px;font-size:.65rem">${donut.legend}</div></div>
      <table class="tbl" style="margin-top:8px"><thead><tr><th>Store</th><th class="r">Count</th><th>%</th><th>vs Prev</th></tr></thead><tbody>${fatalStoreRows.join("")}</tbody></table></div>
    </div>` : '<p class="placeholder">No fatal events found in this period</p>'}
  </div>
</div>

${payoutSection}
${amazonSection}
${perfPayout}
${perfAmazon}

<div class="card">
  <div class="card-header"><h2>💡 Actionable Insights</h2><span class="subtitle">Key findings and recommended actions</span></div>
  <div class="card-body"><div class="insights-grid">${insightHtml || '<p class="placeholder">No insights generated</p>'}</div></div>
</div>

<div class="card" style="background:#f8fafc">
  <div class="card-body" style="padding:12px 20px;font-size:.72rem;color:#94a3b8;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px">
    <span>📊 Source: Kibana WD — <a href="https://kibana-wd.webgility.com" target="_blank">kibana-wd.webgility.com</a> | Index: ${w.indexLabel}</span>
    <span>⏰ Generated: ${generated} | Report Period: ${w.startUtc} → ${w.endUtc}</span>
    <span>🤖 Automated by WD ES Kibana Cloud Agent</span>
  </div>
</div>

</div>
</body>
</html>`;

  const outPath = resolve(
    __dirname,
    `../../reports/wd-kibana-logs/${w.reportDate}-wd-kibana-daily-report.html`
  );
  writeFileSync(outPath, html, "utf8");
  const size = Buffer.byteLength(html, "utf8");
  console.log(`Written: ${outPath} (${(size / 1024).toFixed(1)} KB)`);

  if (size < 30 * 1024) {
    console.error(`ERROR: Report size ${size} bytes is below 30 KB minimum`);
    process.exit(1);
  }

  // Cleanup temp files
  const reportDir = dirname(outPath);
  for (const f of readdirSync(reportDir)) {
    if (/^(gen-|q\d|short-urls|computed)/.test(f) && /\.(json|ps1)$/.test(f)) {
      try {
        unlinkSync(join(reportDir, f));
        console.log(`Cleaned: ${f}`);
      } catch {}
    }
    if (/-to-.*-daily-log-report\.md$/.test(f)) {
      try {
        unlinkSync(join(reportDir, f));
        console.log(`Cleaned: ${f}`);
      } catch {}
    }
  }

  // Summary for Slack
  const summary = {
    reportDate: w.reportDate,
    total,
    errors,
    fatals,
    totalPrev,
    errorsPrev,
    fatalsPrev,
    peakHour: peakHour?.label,
    peakCount: peakHour?.count,
    periodIst: w.periodIst,
    outPath,
    sizeKb: (size / 1024).toFixed(1),
  };
  writeFileSync(join(reportDir, ".last-report-summary.json"), JSON.stringify(summary, null, 2));
  console.log("SUMMARY_JSON:" + JSON.stringify(summary));
}

main().catch((e) => {
  console.error("HALT:", e.message);
  process.exit(1);
});
