# Skill: WD ES Kibana — Elasticsearch Log Analyst

## Purpose

Query production logs from Webgility Elasticsearch clusters and produce structured, actionable daily log reports. Reports are saved as self-contained HTML files (inline CSS, no JS), optionally published to Confluence, and posted to Slack via Slack MCP (preferred) or webhook (fallback for non-MCP environments).

This file is the **canonical** procedure. The Cursor agent at `.cursor/agents/wd-es-kibana.agent.md` and the Copilot mirror at `.github/copilot/agents/wd-es-kibana.agent.md` only point at this file.

---

## Identity / fixed inputs

| Field | Value |
|-------|-------|
| Kibana WD host | `https://kibana-wd.webgility.com` |
| Kibana version | 7.6.2 |
| ES proxy path | `/api/console/proxy?path=<url-encoded-ES-path>&method=POST` |
| WD index pattern | `webgilitydesktop-YYYY.MM.DD` (date-based) |
| CIS ES (MCP only) | `http://172.31.66.65:9200` — `cis-*`, `cns-*`, `cnsrcv-*` |
| WO ES (MCP only) | `http://kibana-wo.webgility.com:9200` — `wo-*`, `woonboarding-*` |
| Report output dir | `reports/wd-kibana-logs/` |
| Slack delivery channel (MCP) | `#my-daily-update` — channel ID `C0B0CBW8G03` (selectable at runtime via Slack MCP) |
| Slack delivery channel (webhook) | Fixed at webhook creation time — **not** overridable at runtime |
| Slack webhook env | `SLACK_WEBHOOK_MY_DAILY_UPDATE` |
| Confluence parent ID | `3042410502` |
| Confluence space ID | `2590998546` |

---

## Credentials

Credentials are stored in **system environment variables**. Supports both local and Cursor Cloud agents.

### KIBANA_WD_AUTH
Format: `username:password` (base64 encoded for HTTP Basic auth)

**Local Setup (Windows):**
```powershell
[System.Environment]::SetEnvironmentVariable('KIBANA_WD_AUTH', 'user:pass', 'User')
```

**Cursor Cloud Setup:**
Add to agent secrets in **Cursor Dashboard → Cloud Agents → Secrets**: `KIBANA_WD_AUTH`

### SLACK_WEBHOOK_MY_DAILY_UPDATE
Slack Incoming Webhook URL for posting reports.

**Important — channel is fixed at webhook creation time.** When you create an Incoming Webhook in your Slack App, you select the target channel (e.g. `#wd_performance`). The webhook **always posts to that channel** — you cannot override it via a `channel` parameter in the payload. If you need to post to a different channel, create a new webhook pointed at that channel.

**Local Setup (Windows):**
```powershell
[System.Environment]::SetEnvironmentVariable('SLACK_WEBHOOK_MY_DAILY_UPDATE', 'https://hooks.slack.com/...', 'User')
```

**Cursor Cloud Setup:**
Add to agent secrets: `SLACK_WEBHOOK_MY_DAILY_UPDATE`

### SLACK_BOT_TOKEN + SLACK_TEAM_ID (Required for Cursor Automation — Slack MCP posting)
If the Slack MCP is connected, the agent posts a **summary message** via `slack_send_message` to `#my-daily-update` (`C0B0CBW8G03`). With the MCP, the channel **is** selectable at runtime. Do **not** create a Canvas — post a concise summary only; the full HTML report lives in the repo. The webhook is an alternative for non-MCP environments (GitHub Actions, local cron).

- **Never** hard-code or log credentials.
- Script supports both User env (local) and Process env (Cursor Cloud).

---

## Kibana WD — Direct HTTPS API (Primary Path)

When MCP tools are unavailable (common outside AWS VPC), use **Kibana WD** directly.

| Property | Value |
|----------|-------|
| URL | `https://kibana-wd.webgility.com` |
| Auth | Basic (from `$env:KIBANA_WD_AUTH`) |
| Required Headers | `Authorization: Basic <b64>`, `kbn-xsrf: true`, `Content-Type: application/json` |
| Index Pattern | `webgilitydesktop-YYYY.MM.DD` (date-based) |

**Performance tip:** Use specific date indices (`webgilitydesktop-2026.04.29,webgilitydesktop-2026.04.30`) instead of wildcard `webgilitydesktop-*` to avoid query timeouts.

### Index & Field Schema

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | date | Event time (stored with IST offset, queryable in UTC) |
| `level` | keyword | `Info`, `Error`, `Fatal`, `Warning` |
| `message` | keyword | Short error message |
| `detail` | text | Full error detail / stack trace |
| `subscriberID` | long | Tenant/subscriber ID |
| `store` | keyword | Channel: Shopify, BigCommerce, Amazon, etc. |
| `module` | keyword | Source module: PostOrderToAccounting, StoreConnection, etc. |
| `tag` | keyword | Error category tag |
| `process` | keyword | `Manual` or `Scheduler` |
| `email` | text | Subscriber email |
| `accounting` | text | Accounting software (QuickBooks, Xero, etc.) |
| `appVersion` | text | Client app version |
| `profileId` | long | Store profile ID |
| `callerName` | text | Calling method |
| `methodType` | text | HTTP method or action type |
| `isStoreOnCIS` | boolean | Whether store is CIS-managed |
| `isGrafanaAlert` | boolean | If this triggered Grafana alert |

### How to Query (PowerShell)

```powershell
$auth = [System.Environment]::GetEnvironmentVariable('KIBANA_WD_AUTH', 'User')
$b64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($auth))
$hdr = @{Authorization="Basic $b64"; "kbn-xsrf"="true"; "Content-Type"="application/json"}
$body = '{"query":{"bool":{"must":[{"term":{"level.keyword":"Error"}},{"range":{"timestamp":{"gte":"...","lt":"..."}}}]}},"size":0,"track_total_hits":true}'
$r = Invoke-WebRequest "https://kibana-wd.webgility.com/api/console/proxy?path=webgilitydesktop-2026.04.29%2Cwebgilitydesktop-2026.04.30%2F_search&method=POST" -Headers $hdr -Method Post -Body $body -TimeoutSec 60 -UseBasicParsing
($r.Content | ConvertFrom-Json).hits.total.value
```

### Kibana Drilldown Links

Every report section that groups failures by type must include drilldown context:

- Add a `Kibana` column for each error bucket.
- Prefer an exact **Discover** deep-link when the WD data-view ID is known.
- If the data-view ID is unknown, **do not fabricate** a Discover URL. Instead:
  - Link the row to `https://kibana-wd.webgility.com`
  - Add a `KQL / Filter` column with the exact filter to run
  - Add an `Indices` column when the date-scoped indices matter

Example drilldown filters:
```text
level : "Error" and message : "401 Unauthorized"
level : "Error" and tag : "SaveSettingError"
level : "Fatal" and store : "Shopify"
level : "Error" and module : "PostOrderToAccounting"
```

---

## MCP Servers (when available)

| Server | ES Endpoint | Index Patterns | Covers |
|--------|-------------|----------------|--------|
| `kibana-logs` | `http://172.31.66.65:9200` | `cis-*`, `cns-*`, `cnsrcv-*` | CIS, CNS publisher, CNS receiver |
| `wo-log` | `http://kibana-wo.webgility.com:9200` | `wo-*`, `woonboarding-*` | Unify Online, WO Onboarding |

### MCP Tools

| Tool | Purpose |
|------|---------|
| `mcp_kibana-logs_es_search` / `mcp_wo-log_es_search` | Primary query tool — Elasticsearch Query DSL |
| `mcp_kibana-logs_list_indices` / `mcp_wo-log_list_indices` | Discover indices, doc counts, freshness |
| `mcp_kibana-logs_es_api` / `mcp_wo-log_es_api` | Raw REST API calls for advanced scenarios |

### CIS/CNS/WO Key Fields (MCP indices)

| Field | Description |
|-------|-------------|
| `@timestamp` | Event time (UTC) |
| `@l` | Log level: `Error`, `Warning`, `Info`, `Debug` |
| `@m` | Log message (exact text) |
| `@mt` | Message template (with placeholders) |
| `@x` | Exception / stack trace |
| `SubscriberId` | Tenant ID |
| `JobId` | Job correlation ID |
| `ProviderType` | Channel: Shopify, BigCommerce, Amazon, etc. |
| `JobType` | `ORDER_DOWNLOAD`, `PRODUCT_DOWNLOAD`, etc. |
| `Application` | Service name |
| `LogEventType` | Category (e.g., `SqlServer`) |

### Prerequisites — Connection Check

**On every invocation**, before running any MCP query, verify connectivity:

1. Call `mcp_kibana-logs_list_indices` with pattern `cis-*` (CIS ES health check).
2. Call `mcp_wo-log_list_indices` with pattern `wo-*` (WO ES health check).
3. If either fails, report which server is unavailable and fall back to Kibana WD HTTPS API.

---

## Time Zone Handling

- All ES timestamps are **UTC**.
- When the user specifies IST times, convert: **IST = UTC + 5:30**.
  - Example: "9 AM IST" → "3:30 AM UTC" (`03:30:00.000Z`)
- Always show results with both UTC and IST timestamps for clarity.

---

## Daily Log Report Procedure

When asked for a daily log report (or log summary for a time window):

### Step 1 — Determine Time Range
Convert user-specified times to UTC. Default: yesterday 9:00 AM IST to today 9:00 AM IST (i.e., yesterday 03:30 UTC to today 03:30 UTC).

### Step 2 — Collect Error Summary (All Services)

Query each index pattern for errors in the time window. See agent file for full query templates including:
- Error/warning count per source
- Breakdown by Application, ProviderType, JobType
- Hourly error timeline
- Top error message templates
- Sample error logs (latest 10)

### Step 3 — Performance by module — Shopify (PayoutPosting) (WD only)

For WD daily reports, surface **one** performance section — not separate “Performance Signals”, “Performance by Module”, and “Performance by Store”. Scope perf queries to **Shopify** and **`module` = `PayoutPosting`** (today’s only store-specific payout perf slice).

**Filter (conceptual):** `store.keyword` is Shopify **and** `module.keyword` is `PayoutPosting`, plus the report time range on `timestamp`. Prefer perf-oriented documents (those that carry throughput fields such as `processedRecords`, `averagePerSecond`, `clientAge`, or explicit duration fields).

**Metrics to compute:**

| Output | Meaning |
|--------|---------|
| **Total payouts processed** | Sum of `processedRecords` (or the field that counts payouts in each perf doc) across matching documents. |
| **Total processing time** | Prefer **sum** of a duration field in milliseconds/seconds if present (e.g. `totalDurationMs`, `elapsedMs`, `durationMs` — confirm names from mapping or a sample hit). If no total-duration field exists, approximate **per document** as `processedRecords / averagePerSecond` seconds when `averagePerSecond > 0`, then **sum** across docs. State “estimated from rate fields” when using the approximation. |
| **Time per payout — average** | `Total processing time ÷ Total payouts processed` (same units as total time). |
| **Time per payout — min / max** | Prefer **min** and **max** aggregations on a **per-payout** duration field if one exists. If only batch-level `averagePerSecond` exists per doc, use **min/max of `1 / averagePerSecond`** across documents as a **proxy** for fastest/slowest batch effective time-per-record, and label the row as **(proxy from per-batch rate)**. |

**Prior-window column (“vs prior window”):** Re-run the same aggregations for the **previous** window of equal length (e.g. the prior calendar day for the default “yesterday 9 AM IST → today 9 AM IST” report). Compare total payouts and total time; omit the column if the prior query fails or returns zero docs.

**Presentation:** One markdown section titled `## Performance by module — Shopify (PayoutPosting)` with a compact table (see `.cursor/agents/wd-es-kibana.agent.md`). Do **not** duplicate the same numbers under separate “Performance Signals” or “Performance by Store” headings.

**Do not** present **records/sec** as the primary headline metric; counts and elapsed time drive the narrative. Optional secondary note: if rates help triage, put them in **Observations**, not as the main table.

### Step 4 — File Artifact

The primary deliverable is an **HTML** report file, not a markdown file or inline chat response.

- Write the report to `reports/wd-kibana-logs/{report-date}-wd-kibana-daily-report.html`
- The HTML must be self-contained (inline CSS, no external dependencies, no JavaScript)
- After writing the file, respond with the file path plus a short summary of the most important findings
- **Daily report layout** (full HTML template, required sections, CSS classes): see `.cursor/agents/wd-es-kibana.agent.md` — **Output Format — HTML Report** section

### Step 5 — Slack Posting

After writing the HTML report and cleaning up intermediate files, post a summary to Slack. **Use exactly ONE posting method** — do NOT combine methods or the report will be posted multiple times.

**Decision tree (pick the FIRST match and stop):**

1. **Slack MCP connected (preferred for Cursor Automation and local Cursor):**
   Use the Slack MCP to post a **summary message** to `#my-daily-update` (channel ID `C0B0CBW8G03`).
   - Post a single message using `slack_send_message` with the summary in Slack mrkdwn format (see message template below).
   - **Do NOT also run `fetch-daily-logs.mjs`** or post via webhook — that would cause a duplicate post.
   - **Do NOT create a Canvas** — post a concise summary message only. The full HTML report lives in the repo.

   **Message format (Slack mrkdwn):**
   ```
   :bar_chart: *WD Kibana Daily Report — {report-date}*

   *Summary:* Total {total} | Errors {errors} ({error_change}%) | Fatals {fatals} ({fatal_change}%) | Warnings {warnings}
   *Error Rate:* {rate}% (prev {prev_rate}%)
   *Peak Hour:* {hour} IST ({peak_count} errors)

   :rotating_light: *Top Issues:*
   • {insight_1_title}
   • {insight_2_title}
   • {insight_3_title}

   :page_facing_up: Report: `reports/wd-kibana-logs/{date}-wd-kibana-daily-report.html`
   :link: <https://kibana-wd.webgility.com|Kibana WD>
   ```

2. **Webhook only (no Slack MCP — e.g. GitHub Actions, local cron):**
   If Slack MCP is not available but `SLACK_WEBHOOK_MY_DAILY_UPDATE` is set, POST a plain-text summary via webhook. The standalone script (`fetch-daily-logs.mjs`) handles this. The webhook channel is fixed at creation time.
   - **Do NOT also use Slack MCP** if you chose this path.

3. **Neither available:** Print the report to stdout and inform the user that Slack posting was skipped.

**CRITICAL — Avoid dual posting:**
- The Cursor Automation has Slack MCP connected → use method 1 only.
- The `fetch-daily-logs.mjs` script uses the webhook (method 2) → do NOT run the script when Slack MCP is available.
- Never combine MCP posting + webhook posting + script execution in the same run.

**Channel:** `#my-daily-update` only — do NOT post to any other channel.

### Step 6 — Confluence Report (optional)

After writing the markdown artifact, publish a Confluence copy:
- **Folder:** https://webgility.atlassian.net/wiki/spaces/~712020cb0bd6e5b43649f9a0f56211a8cc8799/folder/3042410502
- **Parent ID:** `3042410502`
- **Space ID:** `2590998546`
- **Suggested title:** `WD Kibana Daily Report - {report-date}`

---

## Standalone Script (No MCP Required)

When MCP tools are unavailable or for automated daily runs, use the standalone Node.js scripts:

```bash
# Option 1: Via Kibana WD HTTPS proxy (recommended — works from anywhere)
cd .mcp-servers/es-logs
KIBANA_WD_AUTH=user:pass node fetch-daily-logs.mjs

# Option 2: With Slack posting (set webhook env)
KIBANA_WD_AUTH=user:pass SLACK_WEBHOOK_MY_DAILY_UPDATE=https://hooks.slack.com/... node fetch-daily-logs.mjs

# Option 3: Interactive (prompts for creds if ES is unreachable)
node run-report.mjs
```

**Network Notes:**
- **Kibana WD** (`https://kibana-wd.webgility.com`) — publicly reachable, LDAP Basic auth, **use this**
- ES private IPs (172.31.66.65, 172.31.67.85) are in AWS VPC — require direct VPC routing or SSH tunnel
- Kibana CIS (`https://kibana-cis.webgility.com`) — different LDAP, most users don't have access
- Kibana WO (`http://kibana-wo.webgility.com`) — private IP, unreachable without VPN

---

## Ad-Hoc Queries

For non-report queries (subscriber lookup, error investigation, etc.):
1. Determine scope (which index)
2. Apply filters: time → subscriber → level → correlation keys
3. Return concise findings

---

## Constraints

- **Read-only** — never modify ES data.
- Always convert user time zones to UTC for queries.
- Present timestamps in both UTC and IST in output.
- If a query returns 0 hits, state that clearly — do not fabricate data.
- Limit response sizes: use aggregations for summaries, fetch samples (not all hits).

---

## Cursor Cloud Automation Setup

### Prerequisites — Cloud Secrets

Go to **Cursor Dashboard → Cloud Agents → Secrets** and add these secrets. They are injected as environment variables into every Cloud Agent VM.

| Secret name | Value | Required? |
|-------------|-------|-----------|
| `KIBANA_WD_AUTH` | `username:password` (Kibana WD LDAP) | **Yes** — needed to query ES |
| `SLACK_WEBHOOK_MY_DAILY_UPDATE` | `https://hooks.slack.com/services/T.../B.../xxx` | Optional — only for non-MCP posting (GitHub Actions, local cron). Channel is baked into the webhook at creation time. |
| `SLACK_BOT_TOKEN` | `xoxb-...` | **Yes** for Cursor Automation — Slack MCP uses this to create Canvas + post message |
| `SLACK_TEAM_ID` | `T01ABCDE123` | **Yes** for Cursor Automation — Slack MCP workspace ID |

### Option 1: Cursor Automation with Webhook Trigger (Recommended)

This uses the **Cursor Automations** UI at [cursor.com/automations/new](https://cursor.com/automations/new).

#### Step-by-step setup

1. Go to **[cursor.com/automations/new](https://cursor.com/automations/new)**
2. Set **Name**: `WD ES Kibana Daily Report`
3. Under **Triggers**:
   - Select **Webhook triggered**
   - Set repository: **AskAI** on branch **master**
   - Click **Save and enable** — Cursor will generate a **Webhook URL** (e.g. `https://cursor.com/api/automations/hooks/abc123...`)
   - Copy this URL — you will call it from a cron job, Slack scheduled command, or GitHub Actions to fire the automation
4. Under **Instructions**, paste this prompt:

```
You are the WD ES Kibana agent. Generate the daily WD Kibana log report in HTML format and post a summary to Slack.

Steps:
1. Read .cursor/agents/wd-es-kibana.agent.md for the full HTML report template and procedure.
2. Read .cursor/skill-library/wd-es-kibana.skill.md for credentials, query templates, and Slack posting rules.
3. Time window: yesterday 9:00 AM IST to today 9:00 AM IST.
4. Query Kibana WD via HTTPS API using KIBANA_WD_AUTH env variable (base64-encode for Basic auth, include kbn-xsrf header).
5. Query the previous day's window too (for vs-previous comparison badges in the report).
6. Generate Kibana short URLs for all drilldown links (POST /api/shorten_url).
7. Save the self-contained HTML report (inline CSS, no JS) to reports/wd-kibana-logs/{YYYY-MM-DD}-wd-kibana-daily-report.html
8. Clean up intermediate files (gen-short-urls-*.ps1, short-urls-*.json, *-to-*-daily-log-report.md).
9. Post a summary message to Slack channel #my-daily-update (C0B0CBW8G03) using slack_send_message — use ONLY this method:
   a. Send ONE message with the summary (totals, error rate, peak hour, top issues, report file path).
   b. Do NOT create a Canvas — just a summary message.
   c. Do NOT also run fetch-daily-logs.mjs or post via webhook — that causes duplicate posts.
10. Do not ask for confirmation — this is an automated run.
```

5. Under **Tools**, click **+ Add Tool or MCP** and add:
   - **Slack** MCP (**required** — used to post summary message to `#my-daily-update`)
6. Click **Save**

#### Triggering the webhook

After saving, Cursor gives you a webhook URL. Call it to trigger a report run:

```bash
# Manual trigger (test it)
curl -X POST "https://cursor.com/api/automations/hooks/<your-hook-id>"

# Cron (10:00 AM IST = 04:30 UTC, Mon-Fri)
30 4 * * 1-5 curl -s -X POST "https://cursor.com/api/automations/hooks/<your-hook-id>" >> /var/log/wd-kibana-trigger.log 2>&1

# GitHub Actions (see Option 3 below)
```

#### Triggering from a Slack scheduled command (optional)

If you want Slack itself to trigger the report:
1. In your Slack App settings, create a **Slash Command** (e.g. `/kibana-report`)
2. Set the Request URL to your Cursor Automation webhook URL
3. Users can type `/kibana-report` in any channel to trigger an on-demand report

### Option 2: Cursor Automation without Webhook (Cron Trigger)

If your Cursor plan supports **scheduled triggers** (cron), you can skip the webhook:

1. Go to **[cursor.com/automations/new](https://cursor.com/automations/new)**
2. Set **Name**: `WD ES Kibana Daily Report`
3. Under **Triggers**, click **+ Add Trigger** and select **Schedule**:
   - Cron: `30 4 * * 1-5` (= 10:00 AM IST, Mon–Fri)
   - Repository: **AskAI** on branch **master**
4. Under **Instructions**, paste the same prompt as Option 1 above
5. Under **Tools**, add **Slack** MCP (**required** for Slack posting)
6. Click **Save**

This runs automatically every weekday morning without needing an external cron to call the webhook.

### Option 3: Standalone Script via GitHub Actions

If you prefer not to use Cursor Automations at all, the Node.js script handles everything end-to-end:

**GitHub Actions workflow** — create `.github/workflows/wd-kibana-daily-report.yml`:

```yaml
name: WD Kibana Daily Report
on:
  schedule:
    - cron: '30 4 * * 1-5'  # 10:00 AM IST = 04:30 UTC, Mon-Fri
  workflow_dispatch: {}

jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Generate and post report
        env:
          KIBANA_WD_AUTH: ${{ secrets.KIBANA_WD_AUTH }}
          SLACK_WEBHOOK_MY_DAILY_UPDATE: ${{ secrets.SLACK_WEBHOOK_MY_DAILY_UPDATE }}
        run: |
          cd .mcp-servers/es-logs
          node fetch-daily-logs.mjs
```

Add `KIBANA_WD_AUTH` and `SLACK_WEBHOOK_MY_DAILY_UPDATE` to **GitHub repo → Settings → Secrets and variables → Actions → Repository secrets**.

### Option 4: Local cron / Task Scheduler

```bash
# crontab (Linux/macOS) — 10:00 AM IST = 04:30 UTC
30 4 * * 1-5 cd /path/to/AskAI/.mcp-servers/es-logs && KIBANA_WD_AUTH="$KIBANA_WD_AUTH" SLACK_WEBHOOK_MY_DAILY_UPDATE="$SLACK_WEBHOOK_MY_DAILY_UPDATE" node fetch-daily-logs.mjs >> /var/log/wd-kibana-report.log 2>&1
```

### Which option to choose?

| Option | Best for | Requires |
|--------|----------|----------|
| **1 — Cursor Webhook** | On-demand + scheduled via external cron/Slack | Cursor Automations + webhook URL |
| **2 — Cursor Cron** | Fully hands-off daily runs | Cursor Automations with schedule trigger |
| **3 — GitHub Actions** | No Cursor dependency, CI/CD native | GitHub repo secrets |
| **4 — Local cron** | Dev machines, manual control | Node.js + cron on the machine |

---

## Learnings locked in

| Item | Value | Confirmed |
|------|-------|-----------|
| Kibana WD URL | `https://kibana-wd.webgility.com` | 2026-04 |
| WD index pattern | `webgilitydesktop-YYYY.MM.DD` | 2026-04 |
| Kibana version | 7.6.2 | 2026-04 |
| ES proxy path | `/api/console/proxy?path=...&method=POST` | 2026-04 |
| Default report window | Yesterday 9 AM IST → Today 9 AM IST | 2026-04 |
| Standalone script | `.mcp-servers/es-logs/fetch-daily-logs.mjs` | 2026-05 |
| Slack delivery channel (MCP) | `#my-daily-update` — channel ID `C0B0CBW8G03` (selectable at runtime via Slack MCP) | 2026-05 |
| Slack delivery channel (webhook) | Fixed at webhook creation (e.g. `#wd_performance`) — channel override param is **ignored** by Slack App webhooks | 2026-05 |
| Report output format | Self-contained HTML file (inline CSS, no JS) — see `.cursor/agents/wd-es-kibana.agent.md` for template | 2026-05 |
| Slack posting format (MCP) | Single summary message via `slack_send_message` (totals, error rate, top issues, report path) — NO Canvas, NO dual posting | 2026-05 |
| Slack posting — avoid dual | Use ONLY ONE method per run: MCP Canvas or Webhook, never both; do NOT run `fetch-daily-logs.mjs` when Slack MCP is connected | 2026-05 |
| Slack webhook env var | `SLACK_WEBHOOK_MY_DAILY_UPDATE` | 2026-05 |
| Cursor Automation URL | `cursor.com/automations/new` | 2026-05 |
| Cursor Automation trigger | Webhook triggered + Daily cron at 09:00 GMT+5:30 | 2026-05 |
| Cursor Automation repo | AskAI on master | 2026-05 |
| WD perf section | Single block **Performance by module — Shopify (PayoutPosting)**; metrics: total payouts, total time, min/max/avg time per payout; no separate Performance Signals / Performance by Store for this slice | 2026-05 |
