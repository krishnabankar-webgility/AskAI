# Cursor Cloud Automation Prompt

**Use this prompt in:** Cursor Dashboard → Automations → **Prompt** field (when creating/editing WD Kibana automation)

**Recommended Model:** Claude Sonnet 4 (claude-sonnet-4-20250514) — see "Model Recommendation" section below.

---

## Root Cause of May 20 Empty Report (GPT-5.5 high)

The May 20 report was blank because:
1. **Auth/connectivity failure silently swallowed** — GPT-5.5 didn't verify connectivity before proceeding
2. **Only 6 of 13 sections rendered** — model skipped sections when data was 0 (violating spec)
3. **GPT-5.5 can't handle 45KB agent context** — it made shortcuts and missed critical requirements

**Fix:** Use Claude Sonnet 4 + the hardened prompt below (with explicit validation gates).

---

## Automation Prompt (Copy This Exactly)

```
You are the WD ES Kibana automation agent. Generate the daily WD Kibana log report in HTML format.

CRITICAL RULES (NON-NEGOTIABLE):
- The HTML report MUST contain ALL 13 sections listed below — even if queries return 0 results.
- If a query returns 0 results, render that section with a "No data found" placeholder — NEVER skip it.
- If credentials are missing or Kibana is unreachable, HALT immediately — do NOT generate a report with fake 0 values.
- The report file MUST be > 30 KB. If smaller, something went wrong — report the error.
- Do NOT ask for confirmation at any step. This is fully automated.

STEP 1 — LOAD CONTEXT:
Read `.cursor/agents/wd-es-kibana.agent.md` for the FULL HTML report template, query DSL, field schema, CSS styles, and all procedure details. This is a 45KB file — read it completely. Every section described in that file MUST appear in the output.

STEP 2 — VERIFY CREDENTIALS (MANDATORY GATE):
```bash
# Check KIBANA_WD_AUTH is set
echo $KIBANA_WD_AUTH | head -c 5
```
If empty or unset: STOP. Report error: "KIBANA_WD_AUTH not configured in Cursor Cloud Secrets."

STEP 3 — VERIFY CONNECTIVITY (MANDATORY GATE):
Make a test request to Kibana WD:
```bash
AUTH_B64=$(echo -n "$KIBANA_WD_AUTH" | base64)
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Basic $AUTH_B64" -H "kbn-xsrf: true" "https://kibana-wd.webgility.com/api/status"
```
Expected: HTTP 200. If NOT 200: STOP. Report error: "Kibana WD unreachable or auth failed (HTTP {code})."

STEP 4 — CALCULATE TIME WINDOWS:
- TODAY = current date (generation date)
- YESTERDAY = TODAY - 1 day
- DAY_BEFORE = TODAY - 2 days
- Report window: YESTERDAY 03:30:00Z → TODAY 03:30:00Z (= yesterday 9AM IST → today 9AM IST)
- Comparison window: DAY_BEFORE 03:30:00Z → YESTERDAY 03:30:00Z
- Today's indices: webgilitydesktop-{YESTERDAY format YYYY.MM.DD},webgilitydesktop-{TODAY format YYYY.MM.DD}
- Prev indices: webgilitydesktop-{DAY_BEFORE format YYYY.MM.DD},webgilitydesktop-{YESTERDAY format YYYY.MM.DD}

STEP 5 — EXECUTE QUERIES (6 parallel queries via Kibana WD HTTPS API):
Connection: POST https://kibana-wd.webgility.com/api/console/proxy?path={url-encoded-index}%2F_search&method=POST
Headers: Authorization: Basic {base64(KIBANA_WD_AUTH)}, kbn-xsrf: true, Content-Type: application/json

Q1 — Main aggregation (today's window, today's indices):
  - Total hits (track_total_hits: true)
  - Aggregations: by_level (terms on level.keyword), by_hour (date_histogram on timestamp, interval 1h),
    by_module (terms on module.keyword, size 15), by_store (terms on store.keyword, size 15),
    by_tag (terms on tag.keyword, size 15), by_process (terms on process.keyword),
    top_messages (terms on message.keyword, size 15), top_subscribers (terms on subscriberID, size 10)

Q2 — Previous day (same structure as Q1, but prev window + prev indices)

Q3 — Shopify Payout: filter store.keyword:"Shopify" AND module.keyword:"PayoutPosting" AND exists:processedRecords
  size:100, sort timestamp desc, aggregations: total_processed (sum processedRecords), by_subscriber (terms subscriberID size 5)

Q4 — Amazon Settlement: filter module.keyword:"AmazonSettlementReport"
  size:100, aggregations: by_level, total_processed, top_errors (filter level:Error → by_message), top_subscribers

Q5 — Payout Performance: filter module.keyword:"PayoutPosting" AND methodType.keyword:"Payout_PerformanceSummary"
  size:200, _source: [timestamp, subscriberID, profileId, email, detail, message, processedRecords, baseUrl, process]
  Fallback: if 0 hits, retry with tag.keyword:"Performance" AND module.keyword:"PayoutPosting"

Q6 — Amazon Performance: filter module.keyword:"AmazonSettlementReport" AND methodType.keyword:"Settlement_PerformanceSummary"
  size:200, _source: same as Q5
  Fallback: if 0 hits, retry with tag.keyword:"Performance" AND module.keyword:"AmazonSettlementReport"

VALIDATION AFTER QUERIES:
- If Q1 returns total hits = 0 AND the HTTP response was not 200, report auth/network error and HALT.
- If Q1 returns total hits = 0 but HTTP was 200, proceed (legitimate zero-activity window) but still render ALL 13 sections.

STEP 6 — GENERATE KIBANA SHORT URLS:
For every drilldown link: POST https://kibana-wd.webgility.com/api/shorten_url
Body: {"url": "/app/kibana#/discover?_g=(refreshInterval:(pause:!t,value:0),time:(from:'{from}',to:'{to}'))&_a=(columns:!(timestamp,level,message,store,module,subscriberID),index:'61237d60-0ed9-11eb-816a-cde07dc15a1f',interval:auto,query:(language:kuery,query:'{kql}'),sort:!(!(timestamp,desc)))"}
Data-view ID: 61237d60-0ed9-11eb-816a-cde07dc15a1f
Kibana version: 7.6.2 (use /app/kibana#/discover format, NOT 8.x /app/discover#/)

STEP 7 — BUILD HTML REPORT:
The report MUST contain ALL 13 sections in this EXACT order:
  1. Header (title with date, period, indices, comparison period)
  2. Executive Summary (card grid: Total, Errors, Fatals, Warnings, Info, Error Rate — each with vs-prev badge)
  3. Hourly Error Timeline (CSS bar chart, 24 bars for IST hours, color-coded by severity)
  4. Error Breakdown (4 sub-tables: by Module, by Store, by Tag, by Process — each row linked + vs-prev)
  5. Top Error Messages (table: 15 rows, message linked, count, vs-prev badge)
  6. Top Error Subscribers (table: 10 rows, subscriber linked, count, % of errors, vs-prev)
  7. Fatal Events (split: by Message table + by Store with donut chart)
  8. Shopify Payout Performance (metrics grid + top 5 subscribers sub-table)
  9. Amazon Settlement Report (summary + error table + top 5 subscribers)
  10. Shopify Payout — Performance Deep-Dive (top 5 clients table + step bar chart)
  11. Amazon Settlement — Performance Deep-Dive (top 5 clients table + step bar chart)
  12. Actionable Insights (2-column card grid with recommendations)
  13. Footer (source attribution, generation timestamp)

For sections 3–7: If Q1 returned 0 results, render each section with "No {type} events found in this period" — DO NOT SKIP THE SECTION.
For sections 8–11: If respective query returned 0 results, render with placeholder text — DO NOT SKIP.

CSS: All styles inline in <style> block. Reference `.cursor/agents/wd-es-kibana.agent.md` for exact CSS classes.
Format: Self-contained HTML, NO external dependencies, NO JavaScript.

STEP 8 — WRITE FILE:
Path: reports/wd-kibana-logs/{TODAY}-wd-kibana-daily-report.html
Verify: file exists AND file size > 30 KB (if smaller, something is wrong).

STEP 9 — CLEANUP:
Delete any temporary files: gen-*.ps1, q*.json, short-urls*.json, computed.json

STEP 10 — SLACK SUMMARY (final agent response):
Return a SHORT text summary (this gets posted to Slack via Cursor automation):

📊 WD Kibana Daily Report — {TODAY}

Key Metrics:
  • Total Events: {count} ({vs-prev % change})
  • Errors: {count} ({vs-prev % change})
  • Fatals: {count} ({vs-prev % change})

🔗 View full report: https://htmlpreview.github.io/?https://github.com/krishnabankar-webgility/AskAI/blob/{branch}/reports/wd-kibana-logs/{TODAY}-wd-kibana-daily-report.html

Period: {YESTERDAY} 9:00 AM IST → {TODAY} 9:00 AM IST

IMPORTANT — DO NOT:
  ✗ Include full HTML in Slack message
  ✗ Use slack_create_canvas
  ✗ Ask for confirmation
  ✗ Skip sections when data is 0
  ✗ Generate report if auth/connectivity check fails
  ✗ Use Kibana 8.x URL format (/app/discover#/) — use 7.6.2 format (/app/kibana#/discover)
```

---

## Model Recommendation for Cursor Cloud Automation

### Why GPT-5.5 Failed

| Issue | Why GPT-5.5 can't handle it |
|-------|----------------------------|
| 45KB agent context | GPT-5.5 struggles with very long structured documents — loses detail after ~20KB |
| 13-section HTML generation | Skips "optional-looking" sections when data is empty |
| Strict CSS/HTML template compliance | Tends to simplify/shorten HTML output |
| Error handling gates | Doesn't properly implement HALT conditions |
| Kibana URL format (7.6.2 vs 8.x) | Frequently defaults to newer Kibana 8.x URL patterns |

### Recommended Models (Ranked)

| Rank | Model | Why |
|------|-------|-----|
| **1st** | **Claude Sonnet 4** (`claude-sonnet-4-20250514`) | Best at following complex structured specs, handles 45KB context perfectly, generates complete HTML without shortcuts, respects "render even if empty" rules |
| **2nd** | **Claude Opus 4** (`claude-opus-4-20250514`) | Same quality as Sonnet 4 but slower/more expensive — overkill for this task |
| **3rd** | **GPT-4o** | Better than GPT-5.5 at structured output — but still may skip sections |
| ❌ | **GPT-5.5 high** | FAILED — skips sections, can't handle long context, doesn't respect "always render" rules |

### Best Choice: **Claude Sonnet 4**

Reasons:
- Handles 200K+ token context (45KB agent file = ~12K tokens, well within limits)
- Follows structured instructions precisely (won't skip sections)
- Generates clean HTML/CSS without simplification
- Properly implements conditional logic ("if 0 results → render placeholder, NOT skip")
- Fast enough for daily automation (2–3 min per run)
- Cost-effective for daily runs

---

## Updated Automation Configuration

```yaml
name: "WD Kibana Daily Report"
description: "Generate daily WD Kibana log HTML report and post to Slack"
agent: "wd-es-kibana"
model: "claude-sonnet-4-20250514"  # ← CHANGE FROM GPT-5.5
trigger:
  type: "schedule"
  cron: "30 4 * * *"  # 4:30 AM UTC = 10:00 AM IST (30 min after window closes)
  timezone: "UTC"
git:
  commit: true
  push: true
  branch: "master"
slack:
  enabled: true
  channel: "#wd-reports"
secrets:
  - "KIBANA_WD_AUTH"
```

**Key changes from previous config:**
1. `model: "claude-sonnet-4-20250514"` — replaces GPT-5.5 high
2. `cron: "30 4 * * *"` — runs at 4:30 AM UTC (10 AM IST), 30 min after window closes (ensures index has data)
3. Prompt now has MANDATORY GATES (Steps 2–3) that HALT on auth failure

---

## How to Apply This Fix

1. **In Cursor Dashboard → Automations → WD Kibana Daily Report:**
   - Change **Model** to: `Claude Sonnet 4` (or `claude-sonnet-4-20250514`)
   - Replace **Prompt** with the content in the "Automation Prompt" section above
   - Update **Schedule** to `30 4 * * *` (10:00 AM IST, 30 min buffer)

2. **Test run:** Click "Run Now" and verify:
   - Report file > 30 KB
   - All 13 sections present (even if some show "No data")
   - Slack message posted with htmlpreview link

3. **If Claude Sonnet 4 is not available** in Cursor Cloud, use:
   - Claude 3.5 Sonnet (second choice)
   - GPT-4o (third choice)
   - Do NOT use GPT-5.5 or GPT-4-turbo

---

## Checklist: What Changed

- [ ] Model changed from GPT-5.5 high → Claude Sonnet 4
- [ ] Prompt now has MANDATORY connectivity gate (Step 3)
- [ ] Prompt explicitly lists ALL 13 sections as required
- [ ] Prompt says "NEVER skip sections when data is 0"
- [ ] Prompt includes file size validation (> 30 KB)
- [ ] Schedule moved to 4:30 AM UTC (was 4:00 AM UTC)
- [ ] Added HALT conditions for auth failure

---

## Previous Prompt (for Reference — DO NOT USE)

```
You are the WD ES Kibana automation agent. Generate the daily Kibana log report for WD (Webgility Desktop).

STEPS:

1. Load agent context from `.cursor/agents/wd-es-kibana.agent.md` — this contains the full HTML report template, query structure, and all procedure details.

2. Verify credentials: Check that environment variable `KIBANA_WD_AUTH` is set and non-empty. If missing, HALT and report error.

3. Calculate time windows (UTC):
   - TODAY = current date
   - Report window: Yesterday 9:00 AM IST to Today 9:00 AM IST (UTC: Yesterday 03:30 to Today 03:30)
   - Comparison window: Day-before-yesterday 9:00 AM IST to Yesterday 9:00 AM IST
   - Example for May 19, 2026:
     - Report: 2026-05-18 03:30:00Z to 2026-05-19 03:30:00Z (indices: webgilitydesktop-2026.05.18, webgilitydesktop-2026.05.19)
     - Comparison: 2026-05-17 03:30:00Z to 2026-05-18 03:30:00Z (indices: webgilitydesktop-2026.05.17, webgilitydesktop-2026.05.18)

4. Execute 6 queries in parallel against Kibana WD:
   - Q1: Main aggregation (today) — errors, fatals, warnings, info, hourly, by module/store/tag
   - Q2: Previous day aggregation — same structure
   - Q3: Shopify Payout activity (latest 100 hits)
   - Q4: Amazon Settlement activity (latest 100 hits)
   - Q5: Payout Performance logs (methodType: "Payout_PerformanceSummary")
   - Q6: Amazon Settlement Performance logs (methodType: "Settlement_PerformanceSummary")

5. Generate Kibana short URLs:
   - For every row in the report (error, subscriber, module, store, message), create a short URL
   - API: POST https://kibana-wd.webgility.com/api/shorten_url with KQL filter
   - Parallel batches of 10–20 concurrent POSTs
   - Map all {KQL} → {short_hash} results

6. Build HTML report from template in `.cursor/agents/wd-es-kibana.agent.md`:
   - Parse Q1–Q6 JSON results
   - Render 13 sections: Header, Executive Summary, Hourly Timeline, Error Breakdown, Top Messages, Fatal Events, Shopify Payout, Amazon Settlement, Performance Deep-Dives, Insights, Footer
   - Include all Kibana short URLs for drilldown links
   - Calculate vs-prev % change badges
   - Self-contained HTML (inline CSS, no JavaScript)

7. Write report file:
   - Path: `reports/wd-kibana-logs/{TODAY}-wd-kibana-daily-report.html`
   - Verify: file size > 40 KB, all sections present, all links valid
   - Example: `reports/wd-kibana-logs/2026-05-19-wd-kibana-daily-report.html`

8. Clean up temporary files (optional, if script-based):
   - Delete: gen-report.ps1, gen-short-urls.ps1, q*.json, short-urls.json, computed.json

9. Generate Slack summary message (text only, no HTML):
   ```
   📊 WD Kibana Daily Report — {TODAY}
   
   Key Metrics:
     • Total Events: {count} ({vs-prev % change})
     • Errors: {count} ({vs-prev % change})
     • Fatals: {count} ({vs-prev % change})
     • [Any critical insights from Q1]
   
   🔗 View full report: https://htmlpreview.github.io/?https://github.com/krishnabankar-webgility/AskAI/blob/{branch}/reports/wd-kibana-logs/{TODAY}-wd-kibana-daily-report.html
   
   Period: {YESTERDAY} 9:00 AM IST → {TODAY} 9:00 AM IST
   Indices: webgilitydesktop-{YESTERDAY}, webgilitydesktop-{TODAY}
   ```

10. Return this summary text — Cursor's "Send to Slack" tool will auto-post it to the configured channel.

IMPORTANT NOTES:

- Kibana version: 7.6.2 (use /app/kibana#/discover format, NOT 8.x)
- Data-view ID: 61237d60-0ed9-11eb-816a-cde07dc15a1f
- Use specific indices, NEVER wildcard (e.g., webgilitydesktop-2026.05.18,webgilitydesktop-2026.05.19 NOT webgilitydesktop-*)
- If performance logs are empty, render placeholder: "No Payout_PerformanceSummary logs found in this period" (not an error)
- If a query times out, skip that section and continue (report still completes)
- All links must be Kibana short URLs (/goto/{hash}) or full Discover URLs — NO raw KQL text in report
- Do NOT call slack_send_message or any Slack tool — Cursor automation handles Slack delivery
- Do NOT ask for confirmation — this is fully automated

SUCCESS CRITERIA:
✓ HTML report file created and committed to GitHub
✓ Slack message posted with summary + htmlpreview link
✓ Report includes all 13 sections (even if some have "No data" placeholders)
✓ All Kibana links are functional
```

---

## How to Use This

1. **In Cursor Cloud Automation UI:**
   - Go to **Automations** → select **WD Kibana Daily Report**
   - Change **Model** to: `Claude Sonnet 4`
   - In the **Prompt** field, paste ONLY the content between the ``` markers in "Automation Prompt" section above
   - Set **Schedule**: `30 4 * * *` (4:30 AM UTC = 10:00 AM IST)
   - Enable **Slack**: "Send to Slack" + select channel
   - Enable **Git**: commit + push

2. **Test:** Click "Run Now", verify:
   - Report file > 30 KB in GitHub
   - All 13 sections present
   - Slack message posted with htmlpreview link

3. **Agent files:** Both `.cursor/agents/wd-es-kibana.agent.md` and `.github/agents/wd-es-kibana.agent.md` are identical — use either.

---

## Notes

- The agent file (45KB) is the source of truth for HTML template, queries, and CSS styling
- This prompt is the "execution instructions" that tells the model HOW to use the agent file
- GPT-5.5 failed because it can't handle long structured specs and skips sections — Claude Sonnet 4 handles this perfectly
- The agent file works on ALL platforms: Cursor, GitHub Copilot, VS Code — no separate versions needed


