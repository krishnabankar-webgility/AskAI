# Skill: WD ES Kibana — Elasticsearch Log Analyst

## Purpose

Query production logs from Webgility Elasticsearch clusters and produce structured, actionable daily log reports. Reports are saved as markdown files, optionally published to Confluence, and posted to Slack via webhook or Slack MCP.

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
| Slack delivery channel | `#wd_performance` (override via `SLACK_CHANNEL` env) |
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

**Local Setup (Windows):**
```powershell
[System.Environment]::SetEnvironmentVariable('SLACK_WEBHOOK_MY_DAILY_UPDATE', 'https://hooks.slack.com/...', 'User')
```

**Cursor Cloud Setup:**
Add to agent secrets: `SLACK_WEBHOOK_MY_DAILY_UPDATE`

### SLACK_CHANNEL (Optional)
Slack channel name (default: `wd_performance`).

**Cursor Cloud Setup:**
Add to agent secrets: `SLACK_CHANNEL` (value: `wd_performance`)

### SLACK_BOT_TOKEN + SLACK_TEAM_ID (Optional — Slack MCP posting)
If the Slack MCP is connected, the agent can post via `slack_send_message` instead of the webhook. The webhook is the **preferred** path for automated/scheduled runs because it requires no MCP server.

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

### Step 3 — Performance Signals (WD only)

For WD report generation, also collect performance-oriented data from documents containing perf fields (`processedRecords`, `averagePerSecond`, `clientAge`).

### Step 4 — File Artifact

- Write the report to `reports/wd-kibana-logs/{report-date}-wd-kibana-daily-report.md`
- Keep the markdown self-contained for Confluence publishing

### Step 5 — Slack Posting

After writing the file artifact:

1. **Webhook (preferred for automation):** If `SLACK_WEBHOOK_MY_DAILY_UPDATE` is set, POST the report summary to the webhook. The standalone script (`fetch-daily-logs.mjs`) handles this automatically.
2. **Slack MCP (interactive runs):** If the Slack MCP is connected and webhook is unavailable, use `slack_send_message` to post to `#wd_performance`.
3. **Neither available:** Print the report to stdout and inform the user that Slack posting was skipped.

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

### Option 1: Cursor Scheduled Cloud Agent (Recommended)

Set up at [cursor.com](https://cursor.com) → Dashboard → Cloud Agents → Scheduled Agents:

| Setting | Value |
|---------|-------|
| **Name** | `WD ES Kibana Daily Report` |
| **Repository** | `krishnabankar-webgility/AskAI` |
| **Branch** | `master` |
| **Agent / Prompt** | `Generate the daily WD Kibana log report for the last 24 hours and post it to Slack. Use the WD ES Kibana agent.` |
| **Schedule (cron)** | `30 4 * * 1-5` (= 10:00 AM IST, Mon–Fri) |
| **Timezone** | `Asia/Kolkata` or `UTC` (adjust cron accordingly) |

**Required Cloud Secrets:**

| Secret name | Value | Purpose |
|-------------|-------|---------|
| `KIBANA_WD_AUTH` | `username:password` | Kibana WD Basic auth |
| `SLACK_WEBHOOK_MY_DAILY_UPDATE` | `https://hooks.slack.com/services/...` | Slack Incoming Webhook |
| `SLACK_CHANNEL` | `wd_performance` | Target Slack channel name (optional, defaults to `wd_performance`) |
| `SLACK_BOT_TOKEN` | `xoxb-...` | Slack MCP bot token (optional — only needed if using MCP instead of webhook) |
| `SLACK_TEAM_ID` | `T01ABCDE123` | Slack workspace ID (optional — only needed if using MCP) |

### Option 2: Standalone Script via Cron / GitHub Actions

Run the Node.js script directly (no Cursor agent needed):

```bash
# crontab (Linux/macOS) — 10:00 AM IST = 04:30 UTC
30 4 * * 1-5 cd /path/to/AskAI/.mcp-servers/es-logs && KIBANA_WD_AUTH="$KIBANA_WD_AUTH" SLACK_WEBHOOK_MY_DAILY_UPDATE="$SLACK_WEBHOOK_MY_DAILY_UPDATE" node fetch-daily-logs.mjs >> /var/log/wd-kibana-report.log 2>&1
```

**GitHub Actions workflow** (`.github/workflows/wd-kibana-daily-report.yml`):

```yaml
name: WD Kibana Daily Report
on:
  schedule:
    - cron: '30 4 * * 1-5'  # 10:00 AM IST, Mon-Fri
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
          npm install --omit=dev
          node fetch-daily-logs.mjs
```

### Option 3: Cursor Scheduled Agent with Auto-send

For fully unattended operation, the Cursor scheduled agent prompt should include:

```
Generate the daily WD Kibana log report. Time window: yesterday 9:00 AM IST to today 9:00 AM IST. 
Query Kibana WD via HTTPS API using KIBANA_WD_AUTH. 
Save the report to reports/wd-kibana-logs/{date}-wd-kibana-daily-report.md.
Post a summary to Slack #wd_performance via the SLACK_WEBHOOK_MY_DAILY_UPDATE webhook.
Do not ask for confirmation — this is an automated scheduled run.
```

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
| Slack delivery channel | `#wd_performance` (override via `SLACK_CHANNEL`) | 2026-05 |
| Webhook env var | `SLACK_WEBHOOK_MY_DAILY_UPDATE` | 2026-05 |
