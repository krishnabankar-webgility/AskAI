# Kibana Daily Log Report Automation for Cursor Cloud

**Status:** Production-ready instruction for WD ES Kibana

This instruction generates daily Elasticsearch log reports in HTML format for the WD (Webgility Desktop) system.

---

## System Configuration

| Parameter | Value |
|-----------|-------|
| **System Name** | WD (Webgility Desktop) |
| **Agent File** | `.cursor/agents/wd-es-kibana.agent.md` |
| **Kibana Base URL** | `https://kibana-wd.webgility.com` |
| **Credentials Variable** | `KIBANA_WD_AUTH` (Cursor Cloud Secrets) |
| **Kibana Version** | 7.6.2 |
| **Index Pattern** | `webgilitydesktop-YYYY.MM.DD` |
| **Data-view ID** | `61237d60-0ed9-11eb-816a-cde07dc15a1f` |
| **Report Output Dir** | `reports/wd-kibana-logs/` |
| **Report Filename** | `{TODAY}-wd-kibana-daily-report.html` |
| **Default Time Window** | Yesterday 9:00 AM IST → Today 9:00 AM IST |
| **HTML Preview Link** | `https://htmlpreview.github.io/?https://github.com/krishnabankar-webgility/AskAI/blob/{branch}/reports/wd-kibana-logs/{TODAY}-wd-kibana-daily-report.html` |

---

## Automation Steps

### Step 1: Trigger & Context Loading
```
Automation trigger: Daily schedule (recommended: 10 AM IST, after report window closes)
Environment: Cursor Cloud Agent VM with KIBANA_WD_AUTH auto-injected from Secrets

Load context:
  1. Read `.cursor/agents/wd-es-kibana.agent.md` (full HTML template, query structure, procedure)
  2. Report date = TODAY (generation date)
  3. Report delivery = htmlpreview.github.io short link + Slack post
```

### Step 2: Verify Credentials & Connectivity
```
Check: env variable KIBANA_WD_AUTH is set and non-empty
  If missing: HALT — cannot proceed without auth

Test connectivity:
  HEAD https://kibana-wd.webgility.com/api/status
  Expected: 200 OK
  If fails: HALT — Kibana WD unreachable
```

### Step 3: Calculate Time Windows (UTC)
```
TODAY = current date (e.g., 2026-05-19)
YESTERDAY = TODAY - 1 day (e.g., 2026-05-18)
DAY_BEFORE = TODAY - 2 days (e.g., 2026-05-17)

Timezone conversion: IST = UTC + 5:30

Report Window (TODAY):
  User time: Yesterday 9:00 AM IST → Today 9:00 AM IST
  UTC time: YESTERDAY 03:30:00Z → TODAY 03:30:00Z
  Indices: webgilitydesktop-{YESTERDAY},webgilitydesktop-{TODAY}

Comparison Window (PREVIOUS DAY):
  User time: Day-before-yesterday 9:00 AM IST → Yesterday 9:00 AM IST
  UTC time: DAY_BEFORE 03:30:00Z → YESTERDAY 03:30:00Z
  Indices: webgilitydesktop-{DAY_BEFORE},webgilitydesktop-{YESTERDAY}

Example (May 19, 2026):
  Report:     2026-05-18 03:30:00Z → 2026-05-19 03:30:00Z  →  indices: webgilitydesktop-2026.05.18,webgilitydesktop-2026.05.19
  Comparison: 2026-05-17 03:30:00Z → 2026-05-18 03:30:00Z  →  indices: webgilitydesktop-2026.05.17,webgilitydesktop-2026.05.18
```

### Step 4: Execute Queries in Parallel
```
Connection Details:
  Base URL: https://kibana-wd.webgility.com
  Auth: Basic (base64-encode KIBANA_WD_AUTH variable as "user:pass")
  Proxy Path: /api/console/proxy?path={url-encoded-es-path}&method=POST
  Headers Required:
    - Authorization: Basic {b64}
    - kbn-xsrf: true
    - Content-Type: application/json
    - TimeoutSec: 60

Performance Tip: Use specific date indices (webgilitydesktop-2026.05.18,webgilitydesktop-2026.05.19)
                 NOT wildcard to avoid ES query timeouts.

Run 6 queries in PARALLEL (they don't depend on each other):

Q1 — Main Aggregation (Today's window):
  Count: total, errors, fatals, warnings, info, debug
  Group by: hour (for hourly chart), error type, messages, modules, stores, tags
  Aggregate: top subscribers, top error messages
  Save to: temp file q1-main.json
  
Q2 — Previous Day (Prev window):
  Same aggregation structure as Q1
  Purpose: Calculate vs-prev % change badges
  Save to: temp file q2-prev.json

Q3 — Shopify Payout Activity (Latest 100+ hits):
  Filter: timestamp in [TODAY window], store:"Shopify", module:"PayoutPosting"
  Include: timestamp, subscriberID, email, processedRecords, averagePerSecond, detail
  Save to: temp file q3-payout.json

Q4 — Amazon Settlement Activity (Latest 100+ hits):
  Filter: timestamp in [TODAY window], module:"AmazonSettlementReport"
  Include: timestamp, subscriberID, level, message, processedRecords
  Save to: temp file q4-amazon.json

Q5 — Shopify Payout Performance Logs (tag=Performance):
  Filter: timestamp in [TODAY window], module:"PayoutPosting", methodType:"Payout_PerformanceSummary"
  Include: timestamp, subscriberID, email, detail, message, processedRecords, baseUrl, process
  Extract: step breakdown from detail field (client-side parsing required)
  Save to: temp file q5-perf-payout.json

Q6 — Amazon Settlement Performance Logs (tag=Performance):
  Filter: timestamp in [TODAY window], module:"AmazonSettlementReport", methodType:"Settlement_PerformanceSummary"
  Include: timestamp, subscriberID, email, detail, message, processedRecords, baseUrl, process
  Extract: step breakdown from detail field (client-side parsing required)
  Save to: temp file q6-perf-amazon.json

Expected query time: 3–5 seconds per query (10–20 seconds total for parallel batch).
If any query times out: skip that section in the report (acceptable), include "No data" message.
```

### Step 5: Generate Kibana Short URLs
```
For every drilldown link in the report (error, subscriber, module, store, message rows):

API Call: POST https://kibana-wd.webgility.com/api/shorten_url
Headers: Same as queries (Basic auth, kbn-xsrf, Content-Type)
Body: {"url": "/app/kibana#/discover?_g=(...time window...)&_a=(...KQL filter...)"}
Response: {"urlId": "{hash}"}
Short URL result: https://kibana-wd.webgility.com/goto/{hash}

KQL Filter Examples (Kibana 7.6.2):
  - level.keyword:"Error"
  - level.keyword:"Error" AND module.keyword:"PayoutPosting"
  - subscriberID:73243 AND module.keyword:"AmazonSettlementReport"
  - tag.keyword:"Performance" AND methodType.keyword:"Payout_PerformanceSummary"

Generate URLs in PARALLEL batches (10–20 concurrent POSTs).
Store all {original_kql} → {short_hash} mappings in temp file: short-urls.json

Fallback: If short URL generation fails for a row, use full Kibana URL as-is:
  https://kibana-wd.webgility.com/app/kibana#/discover?_g=(...details...)
```

### Step 6: Build HTML Report
```
Input data sources:
  - q1-main.json: main aggregation
  - q2-prev.json: previous day comparison
  - q3-payout.json, q4-amazon.json: module activities
  - q5-perf-payout.json, q6-perf-amazon.json: performance deep-dives
  - short-urls.json: kibana short URL mappings

Template: Defined in `.cursor/agents/wd-es-kibana.agent.md` (Steps 6–6.7)

Report sections (13 total, IN ORDER):
  1. Header (title with date, report period, indices)
  2. Executive Summary (total, errors, fatals, warnings, info, debug + vs-prev badges)
  3. Hourly Error Timeline (bar chart, IST hours, color-coded by severity)
  4. Error Breakdown (by module, store, tag, process — all with links)
  5. Top Error Messages (15 rows, all linked)
  6. Top Error Subscribers (10 rows, all linked)
  7. Fatal Events (by message + by store)
  8. Shopify Payout Section (metrics + top 5 subscribers)
  9. Amazon Settlement Section (metrics + errors + top 5 subscribers)
  10. Shopify Payout Performance Deep-Dive (top 5 clients + step chart)
  11. Amazon Settlement Performance Deep-Dive (top 5 clients + step chart)
  12. Actionable Insights (generated from Q1 patterns)
  13. Footer (source attribution + report metadata)

Output file: reports/wd-kibana-logs/{TODAY}-wd-kibana-daily-report.html
  Example: reports/wd-kibana-logs/2026-05-19-wd-kibana-daily-report.html
  Expected size: 40–60 KB (depending on data volume)
  Format: Self-contained HTML + inline CSS, NO external dependencies, NO JavaScript

Validation:
  ✓ File exists and size > 30 KB
  ✓ All 13 sections present (search for section headings)
  ✓ All Kibana links use /goto/ pattern or full URL (no broken links)
  ✓ No HTML syntax errors (can open in browser)
```

### Step 7: Commit and Push to Git (Optional)
```
If Cursor automation is configured to commit:

  git add reports/wd-kibana-logs/{TODAY}-wd-kibana-daily-report.html
  git commit -m "Daily report: WD Kibana logs for {TODAY}"
  git push origin {branch}
    (branch typically: master, main, or cursor/wd-kibana-daily-report-{hash})

If NOT configured: skip this step (report file will be generated but not committed).
Verify with your Cursor automation settings which branch is used.
```

### Step 8: Clean Up Temporary Files
```
After verifying the HTML report file was created successfully:

DELETE (do NOT commit these):
  - reports/wd-kibana-logs/gen-report.ps1
  - reports/wd-kibana-logs/gen-short-urls.ps1
  - reports/wd-kibana-logs/q1-main.json
  - reports/wd-kibana-logs/q2-prev.json
  - reports/wd-kibana-logs/q3-payout.json
  - reports/wd-kibana-logs/q4-amazon.json
  - reports/wd-kibana-logs/q5-perf-payout.json
  - reports/wd-kibana-logs/q6-perf-amazon.json
  - reports/wd-kibana-logs/short-urls.json
  - reports/wd-kibana-logs/computed.json (if created)

KEEP:
  - All {date}-wd-kibana-daily-report.html files (historical reference)
  - All agent files (.cursor/agents/wd-es-kibana.agent.md)

Cleanup verification: List remaining files in reports/wd-kibana-logs/ — should only show .html and .md files.
```

### Step 9: Post to Slack via Cursor Automation
```
Delivery mechanism: Cursor Cloud Automation built-in "Send to Slack" tool
  (NOT slack_send_message or any MCP tool)

Configuration:
  - Select target Slack channel in Cursor Automation UI (e.g., #wd-reports)
  - This channel is configurable without changing agent code

Message format:
  📊 WD Kibana Daily Report — {TODAY}
  
  Key Metrics:
    • Total Events: {count} ({vs-prev % change})
    • Errors: {count} ({vs-prev % change})
    • Fatals: {count} ({vs-prev % change})
    [Any critical spike or insight from Q1]
  
  🔗 View full report: {HTML_PREVIEW_URL}
  
  Indices: webgilitydesktop-{YESTERDAY}, webgilitydesktop-{TODAY}
  Period: {YESTERDAY} 9:00 AM IST → {TODAY} 9:00 AM IST

HTML Preview URL format:
  https://htmlpreview.github.io/?https://github.com/krishnabankar-webgility/AskAI/blob/{branch}/reports/wd-kibana-logs/{TODAY}-wd-kibana-daily-report.html

Example:
  https://htmlpreview.github.io/?https://github.com/krishnabankar-webgility/AskAI/blob/master/reports/wd-kibana-logs/2026-05-19-wd-kibana-daily-report.html

Automation behavior:
  ✗ Do NOT include full HTML in message (just the link)
  ✗ Do NOT use slack_create_canvas
  ✗ Do NOT ask for confirmation (fully automated)
  ✓ Include brief summary + clickable htmlpreview link
  ✓ Post happens after git commit (if enabled) completes
```

---

## Performance Optimization & Troubleshooting

### Performance Tips
- **Parallel queries:** All 6 queries (Q1–Q6) run simultaneously — no dependencies.
- **Parallel URL generation:** Generate short URLs in batches of 10–20 concurrent POSTs (don't serialize them).
- **Specific indices:** ALWAYS use `webgilitydesktop-2026.05.18,webgilitydesktop-2026.05.19` (specific dates) instead of wildcard `webgilitydesktop-*` to avoid ES timeouts.
- **Size limits:** Cap large queries to 200 hits; use aggregations for summaries, samples for details.
- **Timeout settings:** Set `TimeoutSec: 60` on all Invoke-WebRequest calls.

### Error Handling

| Scenario | Action |
|----------|--------|
| **Missing KIBANA_WD_AUTH** | HALT before queries. Add variable to Cursor Cloud Secrets. |
| **Query timeout (>60s)** | Log error. Skip that query section in report (acceptable — include "No data" message). |
| **ES returns 0 hits** | Expected for some queries. Include "No {module} activity found" placeholder in report. |
| **Short URL generation fails** | Use full Kibana URL as fallback: `https://kibana-wd.webgility.com/app/kibana#/discover?...` |
| **HTML report not created** | Check file permissions, verify JSON parsing succeeded, validate HTML template syntax. |
| **Slack post fails** | Check channel ID, verify bot permissions, confirm htmlpreview.github.io is reachable. |

### Common Issues

**Q: Performance sections show "No logs found" — is that an error?**  
A: No. If `methodType:"Payout_PerformanceSummary"` returns 0 hits, that's normal (depends on whether perf logs were emitted). The report correctly renders the placeholder message. This is not an error.

**Q: Query returns 0 results for "Amazon Settlement" or "Shopify Payout" — should I retry?**  
A: No. It means no such activity occurred in that time window. The report will show "No Amazon Settlement activity found for this period" in that section. Continue to next step.

**Q: Which branch should the automation push to?**  
A: Typically `master`, `main`, or a feature branch like `cursor/wd-kibana-daily-report-{hash}`. Check your Cursor automation settings in the dashboard.

**Q: Can I run this report for a custom time window (not just yesterday–today)?**  
A: The agent uses a fixed 9 AM IST → 9 AM IST window. For custom windows, modify the time calculation in Step 3 of these instructions.

**Q: What if Kibana WD is down?**  
A: The automation will halt at Step 2 (connectivity check). HALT the workflow and alert ops. Retry when Kibana is back up.

---

## Cursor Cloud Setup Checklist

- [ ] **Secret added:** `KIBANA_WD_AUTH` is in Cursor Cloud Secrets (value: `username:password`)
- [ ] **Agent loaded:** `.cursor/agents/wd-es-kibana.agent.md` is in the repo
- [ ] **Automation created:** New automation in Cursor Dashboard with:
  - [ ] Trigger: Schedule (e.g., "Daily at 10:00 AM IST")
  - [ ] Agent: `wd-es-kibana`
  - [ ] Slack channel: Selected (e.g., `#wd-reports`)
  - [ ] Branch: Set (e.g., `master` or `cursor/wd-kibana-daily-report`)
- [ ] **Test run:** Execute automation once manually from Dashboard → verify:
  - [ ] Report file created: `reports/wd-kibana-logs/{TODAY}-wd-kibana-daily-report.html`
  - [ ] File size > 40 KB
  - [ ] Can open in browser without errors
  - [ ] Slack post arrives in configured channel with htmlpreview link
- [ ] **Recurring schedule:** Enable automation for daily execution

---

## Example Output

**Report file:**
```
reports/wd-kibana-logs/2026-05-19-wd-kibana-daily-report.html (50,648 bytes)
```

**Slack message (posted automatically):**
```
📊 WD Kibana Daily Report — 2026-05-19

Key Metrics:
  • Total Events: 150,896 (↑1,339% from 10,486)
  • Errors: 19,094 (↑901% from 1,907)
  • Fatals: 4,605 (↑4,460% from 101)

🔗 View full report: https://htmlpreview.github.io/?https://github.com/krishnabankar-webgility/AskAI/blob/master/reports/wd-kibana-logs/2026-05-19-wd-kibana-daily-report.html

Period: 2026-05-18 9:00 AM IST → 2026-05-19 9:00 AM IST
```

**htmlpreview link (live in browser):**
- Renders full interactive HTML report
- All Kibana /goto/ links clickable (opens in new tab)
- No dependencies or external assets required

---

## Summary

This automation fully generates, commits, and publishes the WD Kibana daily report with **zero manual intervention**:

✅ Queries Kibana WD for 6 data sets (Q1–Q6) in parallel  
✅ Generates 80+ Kibana short URLs for all drilldown links  
✅ Builds rich HTML report with 13 sections  
✅ Commits report to Git (if configured)  
✅ Cleans up temporary files  
✅ Posts summary + htmlpreview link to Slack  

**Next steps:**
1. Verify `KIBANA_WD_AUTH` is in Cursor Cloud Secrets
2. Create daily automation in Cursor Dashboard
3. Set schedule (e.g., 10 AM IST, daily)
4. Run test execution and validate output
5. Enable for recurring daily runs
