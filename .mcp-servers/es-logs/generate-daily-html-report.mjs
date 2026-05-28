#!/usr/bin/env node
/**
 * WD Kibana Daily HTML Report Generator
 * Uses Kibana WD HTTPS proxy + shorten_url API
 */
import { writeFileSync, mkdirSync, unlinkSync, readdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KIBANA = "https://kibana-wd.webgility.com";
const INDEX_ID = "61237d60-0ed9-11eb-816a-cde07dc15a1f";
const AUTH = process.env.KIBANA_WD_AUTH;
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

function fmtIdx(d) {
  const [y, m, day] = d.split("-");
  return `webgilitydesktop-${y}.${m}.${day}`;
}

function defaultWindows() {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 30, 0));
  if (now < end) end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 1);
  const prevStart = new Date(start);
  prevStart.setUTCDate(prevStart.getUTCDate() - 1);
  const today = end.toISOString().slice(0, 10);
  const yesterday = start.toISOString().slice(0, 10);
  const dayBefore = prevStart.toISOString().slice(0, 10);
  return {
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
    prevStartUtc: prevStart.toISOString(),
    today,
    yesterday,
    dayBefore,
    indices: `${fmtIdx(yesterday)},${fmtIdx(today)}`,
    prevIndices: `${fmtIdx(dayBefore)},${fmtIdx(yesterday)}`,
    reportDate: today,
  };
}

async function esSearch(indices, body) {
  const path = encodeURIComponent(`${indices}/_search`);
  const url = `${KIBANA}/api/console/proxy?path=${path}&method=POST`;
  const r = await fetch(url, {
    method: "POST",
    headers: HDR,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`ES ${r.status}: ${t.slice(0, 300)}`);
  }
  return r.json();
}

function discoverPath(kql, from, to) {
  const q = kql.replace(/'/g, "\\'");
  return `/app/kibana#/discover?_g=(refreshInterval:(pause:!t,value:0),time:(from:'${from}',to:'${to}'))&_a=(columns:!(timestamp,level,message,store,module,subscriberID),index:'${INDEX_ID}',interval:auto,query:(language:kuery,query:'${q}'),sort:!(!(timestamp,desc)))`;
}

const urlCache = new Map();
async function shortUrl(kql, from, to) {
  const key = `${kql}|${from}|${to}`;
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
  urlCache.set(key, KIBANA);
  return KIBANA;
}

async function shortUrlsBatch(items, from, to, concurrency = 15) {
  const out = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const urls = await Promise.all(batch.map(({ kql }) => shortUrl(kql, from, to)));
    batch.forEach((item, j) => out.push({ ...item, url: urls[j] }));
  }
  return out;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function kqlMsg(msg) {
  const m = String(msg).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `level.keyword:"Error" AND message.keyword:"${m}"`;
}

function pctBadge(curr, prev) {
  if (prev == null || prev === undefined) return '<span class="cb flat">N/A</span>';
  if (prev === 0 && curr > 0) return '<span class="cb new">NEW</span>';
  if (prev === 0 && curr === 0) return '<span class="cb flat">≈</span>';
  const ch = ((curr - prev) / prev) * 100;
  if (Math.abs(ch) <= 10) return '<span class="cb flat">≈</span>';
  const cls = ch < 0 ? "down" : "up";
  const arrow = ch < 0 ? "↓" : "↑";
  return `<span class="cb ${cls}">${arrow}${Math.abs(ch).toFixed(1)}%</span>`;
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

function fmtMs(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.floor((ms % 60000) / 1000);
  const m = Math.floor(ms / 60000);
  if (ms < 3600000) return `${m}m ${s}s`;
  const h = Math.floor(ms / 3600000);
  const rm = Math.floor((ms % 3600000) / 60000);
  const rs = Math.floor((ms % 60000) / 1000);
  return `${h}h ${rm}m ${rs}s`;
}

function fmtSec(sec) {
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (sec < 3600) return `${m}m ${s}s`;
  const h = Math.floor(sec / 3600);
  const rm = Math.floor((sec % 3600) / 60);
  return `${h}h ${rm}m`;
}

function levelCount(aggs, level) {
  const b = aggs?.by_level?.buckets?.find((x) => x.key === level);
  return b?.doc_count ?? 0;
}

function bucketMap(aggs, name) {
  const m = new Map();
  for (const b of aggs?.[name]?.buckets ?? []) m.set(b.key, b.doc_count);
  return m;
}

function mainAggBody(gte, lt) {
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
            date_histogram: { field: "timestamp", fixed_interval: "1h", min_doc_count: 0 },
          },
        },
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
      fatal_by_message: {
        filter: { term: { "level.keyword": "Fatal" } },
        aggs: { items: { terms: { field: "message.keyword", size: 15 } } },
      },
      fatal_by_store: {
        filter: { term: { "level.keyword": "Fatal" } },
        aggs: { items: { terms: { field: "store.keyword", size: 15, missing: "Unknown" } } },
      },
    },
  };
}

function payoutBody(gte, lt, withRate = true) {
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
      payout_time_stats: withRate
        ? {
            scripted_metric: {
              init_script: "state.total_time = 0; state.per_record_times = []",
              map_script:
                "double rate = doc['averagePerSecond'].value; long records = doc['processedRecords'].value; if (rate > 0 && records > 0) { double batch_time = records / rate; state.total_time += batch_time; state.per_record_times.add(1.0 / rate); }",
              combine_script:
                "return ['total_time': state.total_time, 'per_record_times': state.per_record_times]",
              reduce_script:
                "double total = 0; double min_t = Double.MAX_VALUE; double max_t = 0; double sum_t = 0; int count = 0; for (s in states) { total += s.total_time; for (t in s.per_record_times) { if (t < min_t) min_t = t; if (t > max_t) max_t = t; sum_t += t; count++; } } return ['total_seconds': total, 'min_per_payout_seconds': min_t == Double.MAX_VALUE ? 0 : min_t, 'max_per_payout_seconds': max_t, 'avg_per_payout_seconds': count > 0 ? sum_t / count : 0, 'batch_count': count]",
            },
          }
        : undefined,
    },
  };
}

function amazonBody(gte, lt) {
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

function perfBody(gte, lt, module, methodType) {
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

function perfBodyFallback(gte, lt, module) {
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
    ],
  };
}

function parsePerfDoc(src) {
  const detail = src.detail || "";
  let totalTime = 0;
  const m1 = detail.match(/Total Time:\s*(\d+)\s*ms/);
  const m2 = (src.message || "").match(/Total Time:\s*(\d+),\s*ms/);
  if (m1) totalTime = parseInt(m1[1], 10);
  else if (m2) totalTime = parseInt(m2[1], 10);
  const steps = [];
  for (const line of detail.split(/\r?\n/)) {
    const sm = line.match(/^Step\s+(\d+):\s+(.+?):\s+(\d+)\s+ms(?:\s+\|\s+Records:\s+(\d+))?/);
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
    email: src.email || "",
    profileId: src.profileId,
    processedRecords: src.processedRecords || 0,
    totalTime,
    maxStep,
    maxStepMs,
    steps,
    process: src.process || "",
  };
}

function buildPerfSection(docs, module, methodType, title, kqlBase, from, to, prevDocs) {
  const parsed = docs.map((h) => parsePerfDoc(h._source));
  const prevParsed = prevDocs.map((h) => parsePerfDoc(h._source));
  const prevBySub = new Map();
  for (const p of prevParsed) {
    const id = p.subscriberID;
    if (!prevBySub.has(id)) prevBySub.set(id, 0);
    prevBySub.set(id, prevBySub.get(id) + p.totalTime);
  }
  const bySub = new Map();
  for (const p of parsed) {
    const id = p.subscriberID;
    if (!bySub.has(id)) {
      bySub.set(id, {
        subscriberID: id,
        email: p.email,
        runCount: 0,
        transactions: 0,
        totalTime: 0,
        maxStep: "",
        maxStepMs: 0,
        allSteps: [],
      });
    }
    const e = bySub.get(id);
    e.runCount++;
    e.transactions += p.processedRecords;
    e.totalTime += p.totalTime;
    if (p.maxStepMs > e.maxStepMs) {
      e.maxStepMs = p.maxStepMs;
      e.maxStep = p.maxStep;
    }
    e.allSteps.push(...p.steps);
  }
  const top5 = [...bySub.values()].sort((a, b) => b.totalTime - a.totalTime).slice(0, 5);
  const maxTotal = top5[0]?.totalTime || 1;

  const stepStats = new Map();
  for (const p of parsed) {
    for (const s of p.steps) {
      if (!stepStats.has(s.name)) stepStats.set(s.name, { count: 0, totalMs: 0, maxMs: 0, minMs: Infinity, num: s.num });
      const st = stepStats.get(s.name);
      st.count++;
      st.totalMs += s.ms;
      st.maxMs = Math.max(st.maxMs, s.ms);
      st.minMs = Math.min(st.minMs, s.ms);
      st.num = s.num;
    }
  }
  const stepList = [...stepStats.entries()]
    .map(([name, st]) => ({
      name,
      num: st.num,
      avgMs: st.totalMs / st.count,
      maxMs: st.maxMs,
      count: st.count,
    }))
    .sort((a, b) => a.num - b.num);
  const maxAvg = Math.max(...stepList.map((s) => s.avgMs), 1);

  return { parsed, top5, maxTotal, stepList, maxAvg, runCount: parsed.length };
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
.pct-bar-fill.red{background:#ef4444}.pct-bar-fill.orange{background:#f97316}
.pct-bar-fill.amber{background:#eab308}.pct-bar-fill.blue{background:#3b82f6}.pct-bar-fill.gray{background:#94a3b8}
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
.nodata{padding:24px;text-align:center;color:#94a3b8;font-style:italic}`;

async function main() {
  const w = defaultWindows();
  const { startUtc, endUtc, prevStartUtc, indices, prevIndices, reportDate, today, yesterday, dayBefore } = w;
  const from = startUtc.replace(/\.\d{3}Z$/, ".000Z");
  const to = endUtc.replace(/\.\d{3}Z$/, ".000Z");
  const prevFrom = prevStartUtc.replace(/\.\d{3}Z$/, ".000Z");

  console.log(`Report: ${reportDate}, window ${from} → ${to}`);
  console.log(`Indices: ${indices}`);

  const status = await fetch(`${KIBANA}/api/status`, { headers: HDR });
  if (!status.ok) {
    console.error(`HALT: Kibana status ${status.status}`);
    process.exit(1);
  }

  const [q1, q2, q3, q4, q5, q6, q5prev, q6prev, q3prev, q4prev] = await Promise.all([
    esSearch(indices, mainAggBody(from, to)),
    esSearch(prevIndices, mainAggBody(prevFrom, from)),
    esSearch(indices, payoutBody(from, to, true)).catch((e) => ({ error: e.message })),
    esSearch(indices, amazonBody(from, to)),
    esSearch(indices, perfBody(from, to, "PayoutPosting", "Payout_PerformanceSummary")),
    esSearch(indices, perfBody(from, to, "AmazonSettlementReport", "Settlement_PerformanceSummary")),
    esSearch(prevIndices, perfBody(prevFrom, from, "PayoutPosting", "Payout_PerformanceSummary")),
    esSearch(prevIndices, perfBody(prevFrom, from, "AmazonSettlementReport", "Settlement_PerformanceSummary")),
    esSearch(prevIndices, payoutBody(prevFrom, from, true)),
    esSearch(prevIndices, amazonBody(prevFrom, from)),
  ]);

  let payout = q3;
  if (q3.error || (q3.hits?.total?.value ?? q3.hits?.total ?? 0) === 0) {
    payout = await esSearch(indices, payoutBody(from, to, false));
  }

  let perfPayout = q5;
  if ((perfPayout.hits?.hits?.length ?? 0) === 0) {
    perfPayout = await esSearch(indices, perfBodyFallback(from, to, "PayoutPosting"));
  }
  let perfAmazon = q6;
  if ((perfAmazon.hits?.hits?.length ?? 0) === 0) {
    perfAmazon = await esSearch(indices, perfBodyFallback(from, to, "AmazonSettlementReport"));
  }

  const total = q1.hits?.total?.value ?? q1.hits?.total ?? 0;
  if (total === 0 && !q1.aggregations) {
    console.error("HALT: Q1 returned no data and no aggregations — possible auth failure");
    process.exit(1);
  }

  const prevTotal = q2.hits?.total?.value ?? q2.hits?.total ?? 0;
  const ag = q1.aggregations;
  const prevAg = q2.aggregations;
  const errors = levelCount(ag, "Error");
  const fatals = levelCount(ag, "Fatal");
  const warnings = levelCount(ag, "Warning");
  const infos = levelCount(ag, "Info");
  const prevErrors = levelCount(prevAg, "Error");
  const prevFatals = levelCount(prevAg, "Fatal");
  const prevWarnings = levelCount(prevAg, "Warning");
  const prevInfos = levelCount(prevAg, "Info");
  const errorRate = total > 0 ? ((errors / total) * 100).toFixed(2) : "0.00";
  const prevErrorRate = prevTotal > 0 ? ((prevErrors / prevTotal) * 100).toFixed(2) : "0.00";

  const linkItems = [];
  const addLink = (id, kql) => linkItems.push({ id, kql });

  addLink("total", "");
  addLink("errors", 'level.keyword:"Error"');
  addLink("fatals", 'level.keyword:"Fatal"');
  addLink("warnings", 'level.keyword:"Warning"');
  addLink("infos", 'level.keyword:"Info"');

  for (const b of ag?.by_module?.items?.buckets ?? []) {
    const mod = b.key === "Unknown" ? "" : b.key;
    addLink(`mod_${b.key}`, mod ? `level.keyword:"Error" AND module.keyword:"${mod}"` : 'level.keyword:"Error" AND NOT _exists_:module');
  }
  for (const b of ag?.by_store?.items?.buckets ?? []) {
    addLink(`store_${b.key}`, `level.keyword:"Error" AND store.keyword:"${b.key}"`);
  }
  for (const b of ag?.by_tag?.items?.buckets ?? []) {
    if (b.key !== "Unknown") addLink(`tag_${b.key}`, `level.keyword:"Error" AND tag.keyword:"${b.key}"`);
  }
  for (const b of ag?.by_process?.items?.buckets ?? []) {
    if (b.key !== "Unknown") addLink(`proc_${b.key}`, `level.keyword:"Error" AND process.keyword:"${b.key}"`);
  }
  for (const b of ag?.top_messages?.items?.buckets ?? []) {
    addLink(`msg_${b.key.slice(0, 40)}`, kqlMsg(b.key));
  }
  for (const b of ag?.top_subscribers?.items?.buckets ?? []) {
    addLink(`sub_${b.key}`, `level.keyword:"Error" AND subscriberID:${b.key}`);
  }
  for (const b of ag?.fatal_by_message?.items?.buckets ?? []) {
    addLink(`fmsg_${b.key.slice(0, 30)}`, `level.keyword:"Fatal" AND message.keyword:"${String(b.key).replace(/"/g, '\\"')}"`);
  }
  for (const b of ag?.fatal_by_store?.items?.buckets ?? []) {
    addLink(`fstore_${b.key}`, `level.keyword:"Fatal" AND store.keyword:"${b.key}"`);
  }

  addLink("payout_all", 'level.keyword:"Info" AND module.keyword:"PayoutPosting" AND store.keyword:"Shopify"');
  addLink("amazon_all", 'module.keyword:"AmazonSettlementReport"');
  addLink("amazon_err", 'level.keyword:"Error" AND module.keyword:"AmazonSettlementReport"');

  const linked = await shortUrlsBatch(linkItems, from, to);
  const urlMap = Object.fromEntries(linked.map((x) => [x.id, x.url]));

  const lnk = (id, text) => `<a href="${urlMap[id] || KIBANA}" target="_blank">${text}</a>`;

  // Hourly bars (IST)
  const hourBuckets = ag?.errors_hourly?.by_hour?.buckets ?? [];
  const hourCounts = new Array(24).fill(0);
  const startMs = new Date(from).getTime();
  for (const b of hourBuckets) {
    const hUtc = new Date(b.key);
    const istHour = (hUtc.getUTCHours() + 5.5 + 24) % 24;
    const idx = Math.floor(istHour) % 24;
    const offsetH = Math.round((hUtc.getTime() - startMs) / 3600000);
    const slot = offsetH >= 0 && offsetH < 24 ? offsetH : idx;
    if (slot >= 0 && slot < 24) hourCounts[slot] += b.doc_count;
  }
  const maxHour = Math.max(...hourCounts, 1);
  let peakHour = 0;
  let peakCount = 0;
  hourCounts.forEach((c, i) => {
    if (c > peakCount) {
      peakCount = c;
      peakHour = i;
    }
  });
  const hourLabels = [];
  for (let i = 0; i < 24; i++) {
    const h = (9 + i) % 24;
    hourLabels.push(String(h).padStart(2, "0"));
  }

  const prevMod = bucketMap(prevAg?.by_module, "items");
  const prevStore = bucketMap(prevAg?.by_store, "items");
  const prevTag = bucketMap(prevAg?.by_tag, "items");
  const prevProc = bucketMap(prevAg?.by_process, "items");
  const prevMsg = bucketMap(prevAg?.top_messages, "items");
  const prevSub = bucketMap(prevAg?.top_subscribers, "items");
  const prevFmsg = bucketMap(prevAg?.fatal_by_message, "items");
  const prevFstore = bucketMap(prevAg?.fatal_by_store, "items");

  const genAt = new Date().toISOString().replace("T", " ").slice(0, 19);

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WD Kibana Daily Log Report — ${reportDate}</title>
<style>${CSS}</style>
</head>
<body>
<div class="page">

<div class="rpt-header">
  <h1>WD Kibana Daily Log Report — ${reportDate}</h1>
  <div class="meta">
    <span>📅 Period: ${yesterday} 09:00 IST → ${today} 09:00 IST</span>
    <span>📊 Index: ${indices.replace(/,/g, " / ")}</span>
    <span>⚖️ Compared to: ${dayBefore} 09:00 IST → ${yesterday} 09:00 IST</span>
    <span>🕐 Generated: ${genAt} UTC</span>
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>📋 Executive Summary</h2><span class="subtitle">Total docs: ${total.toLocaleString()} vs ${prevTotal.toLocaleString()} prev day</span></div>
  <div class="card-body">
    <div class="exec-grid">
      <div class="exec-card total"><div class="label">Total Events</div><div class="value">${lnk("total", total.toLocaleString())}</div><div class="change">${pctBadge(total, prevTotal)} vs prev ${prevTotal.toLocaleString()}</div></div>
      <div class="exec-card error"><div class="label">Errors</div><div class="value">${lnk("errors", errors.toLocaleString())}</div><div class="change">${pctBadge(errors, prevErrors)} vs prev ${prevErrors.toLocaleString()}</div></div>
      <div class="exec-card fatal"><div class="label">Fatals</div><div class="value">${lnk("fatals", fatals.toLocaleString())}</div><div class="change">${pctBadge(fatals, prevFatals)} vs prev ${prevFatals.toLocaleString()}</div></div>
      <div class="exec-card warning"><div class="label">Warnings</div><div class="value">${lnk("warnings", warnings.toLocaleString())}</div><div class="change">${pctBadge(warnings, prevWarnings)} vs prev ${prevWarnings.toLocaleString()}</div></div>
      <div class="exec-card info"><div class="label">Info</div><div class="value">${lnk("infos", infos.toLocaleString())}</div><div class="change">${pctBadge(infos, prevInfos)} vs prev ${prevInfos.toLocaleString()}</div></div>
      <div class="exec-card rate"><div class="label">Error Rate</div><div class="value">${errorRate}%</div><div class="change">${pctBadge(parseFloat(errorRate), parseFloat(prevErrorRate))} vs prev ${prevErrorRate}%</div></div>
    </div>
  </div>
</div>

<div class="card">
  <div class="card-header"><h2>⏱ Hourly Error Timeline (IST)</h2><span class="subtitle">Peak: ${peakCount.toLocaleString()} errors at ${String(peakHour).padStart(2, "0")}:00 IST</span></div>
  <div class="card-body">
    <div class="bar-chart">`;

  for (let i = 0; i < 24; i++) {
    const c = hourCounts[i];
    const pct = maxHour > 0 ? Math.max((c / maxHour) * 100, c > 0 ? 0.5 : 0.1) : 0.1;
    const lbl = hourLabels[i];
    html += `<div class="bar-col"><div class="bar ${barColorClass((c / maxHour) * 100)}" style="height:${pct.toFixed(1)}%" title="${lbl}:00 IST — ${c} errors"></div><div class="bar-lbl">${lbl}</div></div>`;
  }

  html += `</div></div></div>`;

  // Error breakdown
  const modBuckets = ag?.by_module?.items?.buckets ?? [];
  const storeBuckets = ag?.by_store?.items?.buckets ?? [];
  const tagBuckets = ag?.by_tag?.items?.buckets ?? [];
  const procBuckets = ag?.by_process?.items?.buckets ?? [];

  html += `<div class="card"><div class="card-header"><h2>🔍 Error Breakdown</h2><span class="subtitle">${errors.toLocaleString()} total errors</span></div><div class="card-body"><div class="grid-2">`;

  const renderTermsTable = (title, buckets, prevMap, idPrefix, withPct = true) => {
    let t = `<div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">${title}</div><table class="tbl"><thead><tr><th>Name</th><th class="r">Count</th>`;
    if (withPct) t += `<th>% of Errors</th>`;
    t += `<th>vs Prev</th></tr></thead><tbody>`;
    if (!buckets.length) t += `<tr><td colspan="4" class="nodata">No ${title.toLowerCase()} events found in this period</td></tr>`;
    for (const b of buckets) {
      const pct = errors > 0 ? ((b.doc_count / errors) * 100).toFixed(1) : "0";
      const prev = prevMap.get(b.key) ?? 0;
      const id = `${idPrefix}_${b.key}`;
      t += `<tr><td>${lnk(id, esc(b.key))}</td><td class="r">${b.doc_count.toLocaleString()}</td>`;
      if (withPct)
        t += `<td><div class="pct-bar-wrap"><span class="pct-text">${pct}%</span><div class="pct-bar"><div class="pct-bar-fill ${pctBarColor(parseFloat(pct))}" style="width:${pct}%"></div></div></div></td>`;
      t += `<td>${pctBadge(b.doc_count, prev)}</td></tr>`;
    }
    return t + `</tbody></table></div>`;
  };

  html += renderTermsTable("By Module", modBuckets, prevMod, "mod");
  html += renderTermsTable("By Store", storeBuckets, prevStore, "store");
  html += `</div><div class="section-sep"></div><div class="grid-2" style="margin-top:16px">`;
  html += renderTermsTable("By Tag", tagBuckets, prevTag, "tag", false);
  html += renderTermsTable("By Process", procBuckets, prevProc, "proc", false);
  html += `</div></div></div>`;

  // Top messages
  const msgBuckets = ag?.top_messages?.items?.buckets ?? [];
  html += `<div class="card"><div class="card-header"><h2>⚠️ Top Error Messages</h2></div><div class="card-body"><table class="tbl"><thead><tr><th>#</th><th>Message</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>`;
  if (!msgBuckets.length) html += `<tr><td colspan="4" class="nodata">No error messages found in this period</td></tr>`;
  msgBuckets.forEach((b, i) => {
    const id = `msg_${b.key.slice(0, 40)}`;
    html += `<tr><td>${i + 1}</td><td>${lnk(id, esc(b.key.length > 80 ? b.key.slice(0, 80) + "…" : b.key))}</td><td class="r">${b.doc_count.toLocaleString()}</td><td>${pctBadge(b.doc_count, prevMsg.get(b.key))}</td></tr>`;
  });
  html += `</tbody></table></div></div>`;

  // Top subscribers
  const subBuckets = ag?.top_subscribers?.items?.buckets ?? [];
  html += `<div class="card"><div class="card-header"><h2>👥 Top Error Subscribers</h2></div><div class="card-body"><table class="tbl"><thead><tr><th>#</th><th>Subscriber ID</th><th class="r">Error Count</th><th>% of Errors</th><th>vs Prev</th></tr></thead><tbody>`;
  if (!subBuckets.length) html += `<tr><td colspan="5" class="nodata">No error subscribers found in this period</td></tr>`;
  subBuckets.forEach((b, i) => {
    const pct = errors > 0 ? ((b.doc_count / errors) * 100).toFixed(1) : "0";
    const id = `sub_${b.key}`;
    html += `<tr><td>${i + 1}</td><td>${lnk(id, String(b.key))}</td><td class="r">${b.doc_count.toLocaleString()}</td><td><div class="pct-bar-wrap"><span class="pct-text">${pct}%</span><div class="pct-bar"><div class="pct-bar-fill ${pctBarColor(parseFloat(pct))}" style="width:${pct}%"></div></div></div></td><td>${pctBadge(b.doc_count, prevSub.get(b.key))}</td></tr>`;
  });
  html += `</tbody></table></div></div>`;

  // Fatals
  const fmsgBuckets = ag?.fatal_by_message?.items?.buckets ?? [];
  const fstoreBuckets = ag?.fatal_by_store?.items?.buckets ?? [];
  const fatalTotal = fatals;
  const donutColors = ["#96bf48", "#7f54b3", "#2196F3", "#ff9900", "#ee672d", "#94a3b8"];
  let donutCss = "background:conic-gradient(#e2e8f0 0deg 360deg)";
  if (fstoreBuckets.length) {
    let deg = 0;
    const parts = [];
    fstoreBuckets.slice(0, 6).forEach((b, i) => {
      const pct = fatalTotal > 0 ? (b.doc_count / fatalTotal) * 360 : 0;
      parts.push(`${donutColors[i % donutColors.length]} ${deg}deg ${deg + pct}deg`);
      deg += pct;
    });
    if (deg < 360) parts.push(`#94a3b8 ${deg}deg 360deg`);
    donutCss = `background:conic-gradient(${parts.join(",")})`;
  }

  html += `<div class="card"><div class="card-header"><h2>💀 Fatal Events</h2><span class="subtitle">${fatalTotal.toLocaleString()} fatal events ${pctBadge(fatals, prevFatals)}</span></div><div class="card-body"><div class="grid-2">`;
  html += `<div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Message</div><table class="tbl"><thead><tr><th>Message</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>`;
  if (!fmsgBuckets.length) html += `<tr><td colspan="3" class="nodata">No fatal messages found in this period</td></tr>`;
  for (const b of fmsgBuckets) {
    const id = `fmsg_${b.key.slice(0, 30)}`;
    html += `<tr><td>${lnk(id, esc(b.key.length > 60 ? b.key.slice(0, 60) + "…" : b.key))}</td><td class="r">${b.doc_count}</td><td>${pctBadge(b.doc_count, prevFmsg.get(b.key))}</td></tr>`;
  }
  html += `</tbody></table></div><div><div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">By Store</div><div class="donut-wrap"><div class="donut" style="${donutCss}"></div></div><table class="tbl" style="margin-top:8px"><thead><tr><th>Store</th><th class="r">Count</th><th>%</th><th>vs Prev</th></tr></thead><tbody>`;
  if (!fstoreBuckets.length) html += `<tr><td colspan="4" class="nodata">No fatal store data found</td></tr>`;
  for (const b of fstoreBuckets) {
    const pct = fatalTotal > 0 ? ((b.doc_count / fatalTotal) * 100).toFixed(1) : "0";
    const id = `fstore_${b.key}`;
    html += `<tr><td>${lnk(id, esc(b.key))}</td><td class="r">${b.doc_count}</td><td>${pct}%</td><td>${pctBadge(b.doc_count, prevFstore.get(b.key))}</td></tr>`;
  }
  html += `</tbody></table></div></div></div></div>`;

  // Shopify Payout
  const pAg = payout.aggregations ?? {};
  const pPrevAg = q3prev.aggregations ?? {};
  const recordsProcessed = pAg.total_processed?.value ?? 0;
  const prevRecords = pPrevAg.total_processed?.value ?? 0;
  const batches = pAg.batch_count?.value ?? pAg.payout_time_stats?.value?.batch_count ?? 0;
  const prevBatches = pPrevAg.batch_count?.value ?? 0;
  const pts = pAg.payout_time_stats?.value ?? {};
  const minPer = pts.min_per_payout_seconds ?? 0;
  const maxPer = pts.max_per_payout_seconds ?? 0;
  const avgPer = pts.avg_per_payout_seconds ?? 0;
  const totalSec = pts.total_seconds ?? 0;

  const payoutSubLinks = [];
  for (const b of pAg.by_subscriber?.buckets ?? []) {
    payoutSubLinks.push({
      id: `psub_${b.key}`,
      kql: `level.keyword:"Info" AND module.keyword:"PayoutPosting" AND subscriberID:${b.key}`,
    });
  }
  const pSubUrls = await shortUrlsBatch(
    [{ id: "payout_rec", kql: 'level.keyword:"Info" AND module.keyword:"PayoutPosting" AND store.keyword:"Shopify"' }, ...payoutSubLinks],
    from,
    to
  );
  const pUrlMap = Object.fromEntries(pSubUrls.map((x) => [x.id, x.url]));

  html += `<div class="card"><div class="card-header"><h2>💳 Shopify Payout Performance</h2><span class="subtitle">module=PayoutPosting, store=Shopify</span></div><div class="card-body">`;
  if (recordsProcessed === 0 && batches === 0) {
    html += `<p class="nodata">No PayoutPosting data found for this period</p>`;
  } else {
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px">
      <div class="exec-card" style="border-color:#3b82f6"><div class="label">Records Processed</div><div class="value" style="font-size:1.3rem"><a href="${pUrlMap.payout_rec || KIBANA}" target="_blank">${Math.round(recordsProcessed).toLocaleString()}</a></div><div class="change">${pctBadge(recordsProcessed, prevRecords)} vs prev ${Math.round(prevRecords).toLocaleString()}</div></div>
      <div class="exec-card" style="border-color:#10b981"><div class="label">Batches</div><div class="value" style="font-size:1.3rem">${Math.round(batches)}</div><div class="change">${pctBadge(batches, prevBatches)} vs prev ${Math.round(prevBatches)}</div></div>
      <div class="exec-card" style="border-color:#f97316"><div class="label">Min Time/Record</div><div class="value" style="font-size:1.1rem">${minPer > 0 ? fmtSec(minPer) : "N/A"}</div></div>
      <div class="exec-card" style="border-color:#ef4444"><div class="label">Max Time/Record</div><div class="value" style="font-size:1.1rem">${maxPer > 0 ? fmtSec(maxPer) : "N/A"}</div></div>
      <div class="exec-card" style="border-color:#8b5cf6"><div class="label">Avg Time/Record</div><div class="value" style="font-size:1.1rem">${avgPer > 0 ? fmtSec(avgPer) : "N/A"}</div></div>
      <div class="exec-card" style="border-color:#6366f1"><div class="label">Est. Total Time</div><div class="value" style="font-size:1.1rem">${totalSec > 0 ? fmtSec(totalSec) : "N/A"}</div></div>
    </div>`;
    html += `<div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">Top 5 Subscribers by Records Processed</div><table class="tbl"><thead><tr><th>#</th><th>Subscriber ID</th><th class="r">Records</th><th class="r">Batches</th><th>% of Total</th><th>vs Prev</th></tr></thead><tbody>`;
    const pSubs = pAg.by_subscriber?.buckets ?? [];
    if (!pSubs.length) html += `<tr><td colspan="6" class="nodata">No subscriber payout data</td></tr>`;
    pSubs.forEach((b, i) => {
      const rec = b.processed_sum?.value ?? 0;
      const pct = recordsProcessed > 0 ? ((rec / recordsProcessed) * 100).toFixed(1) : "0";
      html += `<tr><td>${i + 1}</td><td><a href="${pUrlMap[`psub_${b.key}`] || KIBANA}" target="_blank">${b.key}</a></td><td class="r">${Math.round(rec).toLocaleString()}</td><td class="r">${b.batch_count?.value ?? 0}</td><td>${pct}%</td><td><span class="cb new">NEW</span></td></tr>`;
    });
    html += `</tbody></table>`;
  }
  html += `</div></div>`;

  // Amazon Settlement
  const aAg = q4.aggregations ?? {};
  const aPrevAg = q4prev.aggregations ?? {};
  const aTotal = q4.hits?.total?.value ?? q4.hits?.total ?? 0;
  const aPrevTotal = q4prev.hits?.total?.value ?? q4prev.hits?.total ?? 0;
  const aErrors = levelCount(aAg, "Error");
  const aPrevErrors = levelCount(aPrevAg, "Error");
  const aInfo = levelCount(aAg, "Info");
  const aPrevInfo = levelCount(aPrevAg, "Info");
  const aSubs = aAg.unique_subscribers?.value ?? 0;
  const aPrevSubs = aPrevAg.unique_subscribers?.value ?? 0;
  const aErrMsgs = aAg.top_errors?.by_message?.buckets ?? [];

  const amzLinks = await shortUrlsBatch(
    [
      { id: "amz_all", kql: 'module.keyword:"AmazonSettlementReport"' },
      { id: "amz_err", kql: 'level.keyword:"Error" AND module.keyword:"AmazonSettlementReport"' },
      ...(aAg.top_subscribers?.buckets ?? []).map((b) => ({
        id: `amzsub_${b.key}`,
        kql: `module.keyword:"AmazonSettlementReport" AND subscriberID:${b.key}`,
      })),
      ...aErrMsgs.map((b) => ({
        id: `amzmsg_${b.key.slice(0, 30)}`,
        kql: `level.keyword:"Error" AND module.keyword:"AmazonSettlementReport" AND message.keyword:"${String(b.key).replace(/"/g, '\\"')}"`,
      })),
    ],
    from,
    to
  );
  const aUrlMap = Object.fromEntries(amzLinks.map((x) => [x.id, x.url]));

  html += `<div class="card"><div class="card-header"><h2>🛒 Amazon Settlement Report</h2><span class="subtitle">module=AmazonSettlementReport</span></div><div class="card-body">`;
  if (aTotal === 0) {
    html += `<p class="nodata">No Amazon Settlement activity found for this period</p>`;
  } else {
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px">
      <div class="exec-card" style="border-color:#3b82f6"><div class="label">Total Events</div><div class="value" style="font-size:1.3rem"><a href="${aUrlMap.amz_all}" target="_blank">${aTotal.toLocaleString()}</a></div><div class="change">${pctBadge(aTotal, aPrevTotal)} vs prev ${aPrevTotal.toLocaleString()}</div></div>
      <div class="exec-card" style="border-color:#ef4444"><div class="label">Errors</div><div class="value" style="font-size:1.3rem"><a href="${aUrlMap.amz_err}" target="_blank">${aErrors}</a></div><div class="change">${pctBadge(aErrors, aPrevErrors)}</div></div>
      <div class="exec-card" style="border-color:#10b981"><div class="label">Settlements (Info)</div><div class="value" style="font-size:1.3rem">${aInfo}</div><div class="change">${pctBadge(aInfo, aPrevInfo)}</div></div>
      <div class="exec-card" style="border-color:#f97316"><div class="label">Affected Subscribers</div><div class="value" style="font-size:1.3rem">${aSubs}</div><div class="change">${pctBadge(aSubs, aPrevSubs)}</div></div>
    </div>`;
    if (aErrMsgs.length) {
      html += `<div style="font-size:.78rem;font-weight:700;color:#475569;margin-bottom:8px">Top Error Messages</div><table class="tbl"><thead><tr><th>Message</th><th class="r">Count</th><th>vs Prev</th></tr></thead><tbody>`;
      for (const b of aErrMsgs) {
        html += `<tr><td><a href="${aUrlMap[`amzmsg_${b.key.slice(0, 30)}`] || KIBANA}" target="_blank">${esc(b.key)}</a></td><td class="r">${b.doc_count}</td><td>${pctBadge(b.doc_count, 0)}</td></tr>`;
      }
      html += `</tbody></table>`;
    } else {
      html += `<div style="font-size:.75rem;color:#64748b;margin-bottom:12px">No error messages found for this period.</div>`;
    }
    html += `<div style="font-size:.78rem;font-weight:700;color:#475569;margin:16px 0 8px">Top 5 Subscribers by Total Events</div><table class="tbl"><thead><tr><th>#</th><th>Subscriber ID</th><th class="r">Total Events</th><th class="r">Errors</th><th class="r">Settlements</th><th>vs Prev</th></tr></thead><tbody>`;
    const aTopSubs = aAg.top_subscribers?.buckets ?? [];
    if (!aTopSubs.length) html += `<tr><td colspan="6" class="nodata">No subscriber data</td></tr>`;
    aTopSubs.forEach((b, i) => {
      const errs = b.by_level?.buckets?.find((x) => x.key === "Error")?.doc_count ?? 0;
      const info = b.by_level?.buckets?.find((x) => x.key === "Info")?.doc_count ?? 0;
      html += `<tr><td>${i + 1}</td><td><a href="${aUrlMap[`amzsub_${b.key}`] || KIBANA}" target="_blank">${b.key}</a></td><td class="r">${b.doc_count}</td><td class="r">${errs}</td><td class="r">${info}</td><td><span class="cb new">NEW</span></td></tr>`;
    });
    html += `</tbody></table>`;
  }
  html += `</div></div>`;

  // Performance sections
  async function renderPerfSection(hits, prevHits, module, methodType, title, emoji) {
    const docs = hits.hits?.hits ?? [];
    const prevDocs = prevHits.hits?.hits ?? [];
    const sec = buildPerfSection(docs, module, methodType, title, "", from, to, prevDocs);
    const perfLinks = sec.top5.map((s) => ({
      id: `perf_${module}_${s.subscriberID}`,
      kql: `tag.keyword:"Performance" AND module.keyword:"${module}" AND subscriberID:${s.subscriberID}`,
    }));
    const perfUrls = await shortUrlsBatch(perfLinks, from, to);
    const perfMap = Object.fromEntries(perfUrls.map((x) => [x.id, x.url]));

    let h = `<div class="card"><div class="card-header"><h2>${emoji} ${title} — Performance Deep-Dive</h2><span class="subtitle">${sec.runCount} runs found in period</span></div><div class="card-body">`;
    if (!sec.runCount) {
      h += `<p class="nodata">No ${methodType} logs found in this period.</p>`;
    } else {
      h += `<div style="font-size:.8rem;font-weight:700;color:#334155;margin-bottom:12px">Sub-section A: Top 5 Clients by Total Processing Time</div><div style="overflow-x:auto"><table class="perf-table"><thead><tr><th>#</th><th>Subscriber ID</th><th>Email</th><th>Runs</th><th>Transactions</th><th>Total Time</th><th>% of Max</th><th>Slowest Step</th><th>Top 3 Steps by Time</th><th>vs Prev</th></tr></thead><tbody>`;
      sec.top5.forEach((s, i) => {
        const pct = sec.maxTotal > 0 ? ((s.totalTime / sec.maxTotal) * 100).toFixed(1) : 0;
        const barCls = pct > 80 ? "red" : pct > 50 ? "orange" : pct > 25 ? "amber" : "blue";
        const stepAgg = new Map();
        for (const st of s.allSteps) {
          if (!stepAgg.has(st.name)) stepAgg.set(st.name, { ms: 0, num: st.num });
          stepAgg.get(st.name).ms += st.ms;
        }
        const top3 = [...stepAgg.entries()]
          .sort((a, b) => b[1].ms - a[1].ms)
          .slice(0, 3)
          .map(([name, v]) => `S${v.num}: ${name.slice(0, 20)}: ${fmtMs(v.ms)}`)
          .join("<br>");
        const prevT = prevDocs.length
          ? [...prevDocs.map((h) => parsePerfDoc(h._source))]
              .filter((p) => p.subscriberID === s.subscriberID)
              .reduce((a, p) => a + p.totalTime, 0)
          : null;
        h += `<tr><td>${i + 1}</td><td><a href="${perfMap[`perf_${module}_${s.subscriberID}`] || KIBANA}" target="_blank">${s.subscriberID}</a></td><td class="perf-email">${esc(s.email)}</td><td class="r">${s.runCount}</td><td class="r">${s.transactions}</td><td class="r perf-time">${fmtMs(s.totalTime)}</td><td><div class="pct-bar-wrap"><span class="pct-text">${pct}%</span><div class="pct-bar"><div class="pct-bar-fill ${barCls}" style="width:${pct}%"></div></div></div></td><td class="perf-step-max">${esc(s.maxStep)}<br><span class="perf-step-ms">${fmtMs(s.maxStepMs)}</span></td><td class="perf-step-detail">${top3}</td><td>${pctBadge(s.totalTime, prevT || 0)}</td></tr>`;
      });
      h += `</tbody></table></div>`;
      h += `<div class="step-chart"><div class="step-chart-title">Avg Step Processing Time — ${title} (${sec.runCount} total runs)</div>`;
      for (const st of sec.stepList) {
        const pctW = sec.maxAvg > 0 ? (st.avgMs / sec.maxAvg) * 100 : 0;
        const cls = pctW > 80 ? "red" : pctW > 50 ? "orange" : pctW > 25 ? "amber" : "blue";
        const shortName = st.name.length > 20 ? st.name.slice(0, 20) + "…" : st.name;
        h += `<div class="step-row"><div class="step-label" title="${esc(st.name)}">S${st.num}: ${esc(shortName)}</div><div class="step-bar-wrap"><div class="step-bar ${cls}" style="width:${pctW.toFixed(1)}%"></div><span class="step-bar-val">${fmtMs(st.avgMs)} avg / ${fmtMs(st.maxMs)} max (${st.count} runs)</span></div></div>`;
      }
      h += `</div>`;
    }
    return h + `</div></div>`;
  }

  html += await renderPerfSection(
    perfPayout,
    q5prev,
    "PayoutPosting",
    "Payout_PerformanceSummary",
    "Shopify Payout",
    "🏃"
  );
  html += await renderPerfSection(
    perfAmazon,
    q6prev,
    "AmazonSettlementReport",
    "Settlement_PerformanceSummary",
    "Amazon Settlement",
    "🏃"
  );

  // Insights
  const insights = [];
  if (errors > prevErrors * 1.1)
    insights.push({
      type: "danger",
      icon: "!",
      title: "Error volume increased",
      text: `Errors rose to ${errors.toLocaleString()} (${pctBadge(errors, prevErrors).replace(/<[^>]+>/g, "")}) vs previous day ${prevErrors.toLocaleString()}.`,
    });
  else if (errors < prevErrors * 0.9)
    insights.push({
      type: "healthy",
      icon: "✓",
      title: "Error volume decreased",
      text: `Errors dropped to ${errors.toLocaleString()} from ${prevErrors.toLocaleString()} previous day.`,
    });
  if (parseFloat(errorRate) > parseFloat(prevErrorRate) + 2)
    insights.push({
      type: "warning",
      icon: "↑",
      title: "Error rate elevated",
      text: `Error rate is ${errorRate}% vs ${prevErrorRate}% previous day.`,
    });
  if (peakCount > 500)
    insights.push({
      type: "spike",
      icon: "⚡",
      title: `Peak hour: ${String(peakHour).padStart(2, "0")}:00 IST`,
      text: `${peakCount.toLocaleString()} errors in the peak hour — review hourly timeline.`,
    });
  const topMod = modBuckets[0];
  if (topMod)
    insights.push({
      type: "warning",
      icon: "↑",
      title: `Top module: ${topMod.key}`,
      text: `${topMod.doc_count.toLocaleString()} errors (${((topMod.doc_count / errors) * 100).toFixed(1)}% of all errors).`,
    });
  if (recordsProcessed > 0)
    insights.push({
      type: "healthy",
      icon: "✓",
      title: "Shopify Payout activity",
      text: `${Math.round(recordsProcessed).toLocaleString()} payout records processed across ${Math.round(batches)} batches.`,
    });
  if (!insights.length)
    insights.push({
      type: "healthy",
      icon: "✓",
      title: "Stable period",
      text: "No major anomalies detected vs previous day.",
    });

  html += `<div class="card"><div class="card-header"><h2>💡 Actionable Insights</h2></div><div class="card-body"><div class="insights-grid">`;
  for (const ins of insights.slice(0, 6)) {
    html += `<div class="insight-card ${ins.type}"><div class="icon">${ins.icon}</div><h4>${esc(ins.title)}</h4><p>${esc(ins.text)}</p></div>`;
  }
  html += `</div></div></div>`;

  html += `<div class="card"><div class="card-body" style="text-align:center;color:#94a3b8;font-size:.72rem;padding:20px">
    <p>Source: Kibana WD (<a href="https://kibana-wd.webgility.com" target="_blank">kibana-wd.webgility.com</a>) · Indices: ${esc(indices)} · Report generated by WD ES Kibana automation</p>
    <p style="margin-top:4px">Webgility Desktop Production Logs · ${reportDate}</p>
  </div></div>

</div>
</body>
</html>`;

  const outDir = resolve(__dirname, "../../reports/wd-kibana-logs");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${reportDate}-wd-kibana-daily-report.html`);
  writeFileSync(outPath, html, "utf8");
  const size = Buffer.byteLength(html, "utf8");
  console.log(`Wrote ${outPath} (${(size / 1024).toFixed(1)} KB)`);

  if (size < 30 * 1024) {
    console.error(`ERROR: Report size ${size} bytes < 30 KB minimum`);
    process.exit(1);
  }

  // Cleanup temp files
  for (const f of readdirSync(outDir)) {
    if (/^(gen-short-urls|short-urls|q\d|computed)/.test(f) || /-to-.*-daily-log-report\.md$/.test(f)) {
      try {
        unlinkSync(join(outDir, f));
        console.log(`Deleted temp: ${f}`);
      } catch {}
    }
  }

  console.log(JSON.stringify({ reportDate, outPath, sizeBytes: size, total, errors, fatals }));
}

main().catch((e) => {
  console.error("HALT:", e.message);
  process.exit(1);
});
