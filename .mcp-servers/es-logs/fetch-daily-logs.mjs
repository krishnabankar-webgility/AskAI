#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

/**
 * Daily ES Log Report — Fetches error/warning summaries from all indices.
 * 
 * Usage:
 *   node fetch-daily-logs.mjs                          # Direct ES (VPN required)
 *   KIBANA_WD_AUTH=user:pass node fetch-daily-logs.mjs # Via Kibana HTTPS proxy
 * 
 * Time window: yesterday 9:00 AM IST → today 9:00 AM IST (default)
 * Override:    node fetch-daily-logs.mjs "2026-04-28T03:30:00Z" "2026-04-29T03:30:00Z"
 */

const __dirname = dirname(fileURLToPath(import.meta.url));

const CIS_ES = process.env.ES_URL ?? "http://172.31.66.65:9200";
const WO_ES  = process.env.WO_ES_URL ?? "http://kibana-wo.webgility.com:9200";
const KIBANA_CIS = "https://kibana-cis.webgility.com";
const KIBANA_AUTH = process.env.KIBANA_WD_AUTH ?? process.env.KIBANA_AUTH; // user:pass
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_MY_DAILY_UPDATE;
const SLACK_CHANNEL = process.env.SLACK_CHANNEL ?? "wd_performance";

// --- Time window (default: yesterday 9 AM IST → today 9 AM IST) ---
function defaultTimeRange() {
  const now = new Date();
  const todayIST9AM = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 30, 0
  ));
  if (now < todayIST9AM) todayIST9AM.setUTCDate(todayIST9AM.getUTCDate() - 1);
  const yesterdayIST9AM = new Date(todayIST9AM);
  yesterdayIST9AM.setUTCDate(yesterdayIST9AM.getUTCDate() - 1);
  return { gte: yesterdayIST9AM.toISOString(), lt: todayIST9AM.toISOString() };
}

const [,, argGte, argLt] = process.argv;
const TIME = argGte && argLt ? { gte: argGte, lt: argLt } : defaultTimeRange();

function defaultReportPath() {
  const start = TIME.gte.slice(0, 10);
  const end = TIME.lt.slice(0, 10);
  return resolve(__dirname, "../../reports/wd-kibana-logs", `${start}-to-${end}-daily-log-report.md`);
}

const REPORT_PATH = process.env.REPORT_PATH ?? defaultReportPath();

// --- ES Query Helper ---
async function esQuery(baseUrl, index, queryBody, label) {
  const url = `${baseUrl}/${encodeURIComponent(index)}/_search`;
  const headers = { "Content-Type": "application/json" };

  // If using Kibana proxy with auth
  if (baseUrl.startsWith("https://") && KIBANA_AUTH) {
    headers["Authorization"] = "Basic " + Buffer.from(KIBANA_AUTH).toString("base64");
  }

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(queryBody),
      signal: AbortSignal.timeout(20_000),
    });
    if (!resp.ok) {
      const text = await resp.text();
      return { error: `${resp.status} — ${text.substring(0, 200)}`, label };
    }
    return await resp.json();
  } catch (e) {
    return { error: e.cause?.code || e.message, label };
  }
}

async function pickBaseUrl(primary, fallbackKibana) {
  try {
    const r = await fetch(`${primary}/_cluster/health`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) return { url: primary, via: "direct" };
  } catch {}
  if (KIBANA_AUTH && fallbackKibana) {
    const authHeader = { Authorization: "Basic " + Buffer.from(KIBANA_AUTH).toString("base64") };
    // Try multiple proxy path patterns (Apache/Nginx reverse proxy variations)
    for (const proxyPath of ["/elasticsearch", "/es", "/api/console/proxy", ""]) {
      try {
        const testUrl = `${fallbackKibana}${proxyPath}/_cluster/health`;
        const r = await fetch(testUrl, {
          signal: AbortSignal.timeout(5000),
          headers: authHeader,
        });
        if (r.ok) return { url: `${fallbackKibana}${proxyPath}`, via: `kibana-proxy(${proxyPath || "/"})` };
      } catch {}
    }
    // Even if health check fails, if we get 200 on base URL, try it
    try {
      const r = await fetch(fallbackKibana, {
        signal: AbortSignal.timeout(5000),
        headers: authHeader,
      });
      if (r.ok) return { url: `${fallbackKibana}/elasticsearch`, via: "kibana-proxy(assumed)" };
    } catch {}
  }
  return null;
}

// --- Aggregation Queries ---
function errorSummaryQuery(level = "Error") {
  return {
    query: {
      bool: {
        must: [
          { term: { "@l": level } },
          { range: { "@timestamp": { gte: TIME.gte, lt: TIME.lt } } },
        ],
      },
    },
    size: 0,
    aggs: {
      by_application: { terms: { field: "Application.keyword", size: 30 } },
      by_provider: { terms: { field: "ProviderType.keyword", size: 20 } },
      by_job_type: { terms: { field: "JobType.keyword", size: 20 } },
      errors_over_time: {
        date_histogram: { field: "@timestamp", fixed_interval: "1h" },
      },
    },
  };
}

function topErrorsQuery() {
  return {
    query: {
      bool: {
        must: [
          { term: { "@l": "Error" } },
          { range: { "@timestamp": { gte: TIME.gte, lt: TIME.lt } } },
        ],
      },
    },
    size: 0,
    aggs: {
      top_errors: { terms: { field: "@mt.keyword", size: 15 } },
    },
  };
}

function sampleErrorsQuery() {
  return {
    query: {
      bool: {
        must: [
          { term: { "@l": "Error" } },
          { range: { "@timestamp": { gte: TIME.gte, lt: TIME.lt } } },
        ],
      },
    },
    sort: [{ "@timestamp": "desc" }],
    size: 10,
    _source: ["@timestamp", "@l", "@m", "@mt", "@x", "SubscriberId", "ProviderType", "JobType", "Application"],
  };
}

function totalCountQuery(level = "Error") {
  return {
    query: {
      bool: {
        must: [
          { term: { "@l": level } },
          { range: { "@timestamp": { gte: TIME.gte, lt: TIME.lt } } },
        ],
      },
    },
    size: 0,
    track_total_hits: true,
  };
}

// --- Formatting helpers ---
function utcToIST(utcStr) {
  const d = new Date(utcStr);
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

function getTotal(result) {
  if (result?.error) return "N/A";
  const t = result?.hits?.total;
  return typeof t === "object" ? t.value : (t ?? 0);
}

function getBuckets(result, aggName) {
  if (result?.error) return [];
  return result?.aggregations?.[aggName]?.buckets ?? [];
}

// --- Main ---
async function main() {
  console.log("Checking ES connectivity...\n");

  const cisAccess = await pickBaseUrl(CIS_ES, KIBANA_CIS);
  const woAccess = await pickBaseUrl(WO_ES, null);

  console.log(`CIS ES: ${cisAccess ? `✓ via ${cisAccess.via} (${cisAccess.url})` : "✗ UNREACHABLE"}`);
  console.log(`WO ES:  ${woAccess ? `✓ via ${woAccess.via} (${woAccess.url})` : "✗ UNREACHABLE"}`);

  if (!cisAccess && !woAccess) {
    console.error("\n❌ Cannot reach any Elasticsearch endpoint.");
    console.error("Fix: Connect to VPN or set KIBANA_WD_AUTH=user:pass for Kibana proxy.");
    process.exit(1);
  }

  const istGte = utcToIST(TIME.gte);
  const istLt = utcToIST(TIME.lt);
  console.log(`\nTime window: ${istGte} IST → ${istLt} IST`);
  console.log(`             ${TIME.gte} → ${TIME.lt} UTC\n`);

  // Define sources
  const sources = [];
  if (cisAccess) {
    sources.push({ name: "CIS", index: "cis-*", base: cisAccess.url });
    sources.push({ name: "CNS Publisher", index: "cns-*", base: cisAccess.url });
    sources.push({ name: "CNS Receiver", index: "cnsrcv-*", base: cisAccess.url });
  }
  if (woAccess) {
    sources.push({ name: "WO", index: "wo-*", base: woAccess.url });
  }

  // Collect all data in parallel
  const results = {};
  const promises = [];

  for (const src of sources) {
    const key = src.name;
    results[key] = {};

    promises.push(
      esQuery(src.base, src.index, totalCountQuery("Error"), `${key} errors`)
        .then(r => results[key].errorCount = r),
      esQuery(src.base, src.index, totalCountQuery("Warning"), `${key} warnings`)
        .then(r => results[key].warningCount = r),
      esQuery(src.base, src.index, errorSummaryQuery("Error"), `${key} error aggs`)
        .then(r => results[key].errorAggs = r),
      esQuery(src.base, src.index, topErrorsQuery(), `${key} top errors`)
        .then(r => results[key].topErrors = r),
      esQuery(src.base, src.index, sampleErrorsQuery(), `${key} samples`)
        .then(r => results[key].samples = r),
    );
  }

  await Promise.all(promises);

  // --- Build Report ---
  let report = `# Daily Log Report\n`;
  report += `**Period:** ${istGte} IST → ${istLt} IST (${TIME.gte} → ${TIME.lt} UTC)\n\n`;

  // Summary table
  report += `## Summary\n`;
  report += `| Source | Index | Total Errors | Total Warnings |\n`;
  report += `|--------|-------|-------------|----------------|\n`;
  for (const src of sources) {
    const r = results[src.name];
    report += `| ${src.name} | ${src.index} | ${getTotal(r.errorCount)} | ${getTotal(r.warningCount)} |\n`;
  }
  report += `\n`;

  // Per-source details
  for (const src of sources) {
    const r = results[src.name];

    // Errors by Application
    const appBuckets = getBuckets(r.errorAggs, "by_application");
    if (appBuckets.length > 0) {
      report += `## ${src.name} — Errors by Application\n`;
      report += `| Application | Error Count |\n|-------------|------------|\n`;
      for (const b of appBuckets) {
        report += `| ${b.key} | ${b.doc_count} |\n`;
      }
      report += `\n`;
    }

    // Errors by Provider
    const provBuckets = getBuckets(r.errorAggs, "by_provider");
    if (provBuckets.length > 0) {
      report += `## ${src.name} — Errors by Provider Type\n`;
      report += `| Provider | Error Count |\n|----------|------------|\n`;
      for (const b of provBuckets) {
        report += `| ${b.key} | ${b.doc_count} |\n`;
      }
      report += `\n`;
    }

    // Errors by Job Type
    const jobBuckets = getBuckets(r.errorAggs, "by_job_type");
    if (jobBuckets.length > 0) {
      report += `## ${src.name} — Errors by Job Type\n`;
      report += `| Job Type | Error Count |\n|----------|------------|\n`;
      for (const b of jobBuckets) {
        report += `| ${b.key} | ${b.doc_count} |\n`;
      }
      report += `\n`;
    }

    // Top Error Messages
    const topBuckets = getBuckets(r.topErrors, "top_errors");
    if (topBuckets.length > 0) {
      report += `## ${src.name} — Top Error Messages\n`;
      report += `| # | Message Template | Count |\n|---|-----------------|-------|\n`;
      topBuckets.forEach((b, i) => {
        const msg = b.key.length > 100 ? b.key.substring(0, 100) + "..." : b.key;
        report += `| ${i + 1} | ${msg.replace(/\|/g, "\\|")} | ${b.doc_count} |\n`;
      });
      report += `\n`;
    }

    // Error Timeline
    const timeBuckets = getBuckets(r.errorAggs, "errors_over_time")
      .filter(b => b.doc_count > 0);
    if (timeBuckets.length > 0) {
      report += `## ${src.name} — Error Timeline (Hourly)\n`;
      report += `| Hour (IST) | Errors |\n|------------|--------|\n`;
      for (const b of timeBuckets) {
        report += `| ${utcToIST(b.key_as_string)} | ${b.doc_count} |\n`;
      }
      report += `\n`;
    }

    // Sample Errors
    const hits = r.samples?.hits?.hits ?? [];
    if (hits.length > 0) {
      report += `## ${src.name} — Sample Errors (Latest ${hits.length})\n`;
      report += `| Time (IST) | Service | Subscriber | Provider | Message |\n`;
      report += `|------------|---------|-----------|----------|--------|\n`;
      for (const h of hits) {
        const s = h._source ?? {};
        const time = s["@timestamp"] ? utcToIST(s["@timestamp"]) : "?";
        const msg = (s["@m"] || s["@mt"] || "").substring(0, 80).replace(/\|/g, "\\|").replace(/\n/g, " ");
        report += `| ${time} | ${s.Application ?? "-"} | ${s.SubscriberId ?? "-"} | ${s.ProviderType ?? "-"} | ${msg} |\n`;
      }
      report += `\n`;
    }
  }

  // Unreachable sources
  if (!cisAccess) report += `\n> ⚠ CIS/CNS data unavailable — ES endpoint unreachable\n`;
  if (!woAccess) report += `\n> ⚠ WO data unavailable — ES endpoint unreachable\n`;

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, report, "utf8");

  console.log(`\nMarkdown report saved to: ${REPORT_PATH}\n`);
  console.log(report);

  await postToSlack(report, sources, results);
}

async function buildSlackSummary(report, sources, results) {
  const istGte = utcToIST(TIME.gte);
  const istLt = utcToIST(TIME.lt);

  let text = `*WD Kibana Daily Log Report*\n`;
  text += `*Period:* ${istGte} IST → ${istLt} IST\n`;
  text += `────────────────────────\n`;
  text += `*Summary*\n`;

  for (const src of sources) {
    const r = results[src.name];
    const errors = getTotal(r.errorCount);
    const warnings = getTotal(r.warningCount);
    text += `• *${src.name}* (${src.index}): ${errors} errors, ${warnings} warnings\n`;
  }

  const allTopErrors = [];
  for (const src of sources) {
    const r = results[src.name];
    const buckets = getBuckets(r.topErrors, "top_errors");
    for (const b of buckets) {
      const existing = allTopErrors.find(e => e.key === b.key);
      if (existing) existing.count += b.doc_count;
      else allTopErrors.push({ key: b.key, count: b.doc_count });
    }
  }
  allTopErrors.sort((a, b) => b.count - a.count);

  if (allTopErrors.length > 0) {
    text += `\n*Top Errors*\n`;
    for (const e of allTopErrors.slice(0, 5)) {
      const msg = e.key.length > 80 ? e.key.substring(0, 80) + "…" : e.key;
      text += `• ${msg} — *${e.count}*\n`;
    }
  }

  text += `\n📄 Full report: \`${REPORT_PATH}\``;
  text += `\n🔗 <https://kibana-wd.webgility.com|Kibana WD>`;

  return text;
}

async function postToSlack(report, sources, results) {
  if (!SLACK_WEBHOOK) {
    console.log("ℹ SLACK_WEBHOOK_MY_DAILY_UPDATE not set — skipping Slack post.");
    return;
  }

  const summary = await buildSlackSummary(report, sources, results);

  try {
    const resp = await fetch(SLACK_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: summary, channel: `#${SLACK_CHANNEL}` }),
      signal: AbortSignal.timeout(15_000),
    });

    if (resp.ok) {
      console.log(`✅ Report summary posted to Slack #${SLACK_CHANNEL}`);
    } else {
      const body = await resp.text();
      console.error(`⚠ Slack webhook returned ${resp.status}: ${body.substring(0, 200)}`);
    }
  } catch (e) {
    console.error(`⚠ Slack webhook failed: ${e.message}`);
  }
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
