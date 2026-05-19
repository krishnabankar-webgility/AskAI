# Cursor Cloud Automation Prompt

**Use this prompt in:** Cursor Dashboard → Automations → **Prompt** field (when creating/editing WD Kibana automation)

---

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
   - Go to **Automations** → **Create New**
   - Select Agent: `wd-es-kibana`
   - In the **Prompt** field, paste the content above (or link to this file)

2. **Or** — just use the agent file directly:
   - Agent field: Select `.cursor/agents/wd-es-kibana.agent.md`
   - Leave Prompt field empty (agent will use its own instructions)

3. **Configure:**
   - Schedule: `0 4:30 * * *` (4:30 AM UTC = 10:00 AM IST)
   - Slack: Enable "Send to Slack" + select channel
   - Git: Enable commit + push

4. **Test:** Run once manually, verify report in GitHub and Slack message

---

## Notes

- The prompt above is **verbose by design** — it gives Cursor Cloud the full context
- If you prefer concise, just use the agent file (Step 1 in the prompt references it anyway)
- The agent file is the source of truth for HTML template, queries, and styling
- This prompt is for **automation runs only** — for ad-hoc chat queries, use the agent directly

