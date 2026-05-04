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
| Slack delivery channel | Fixed at webhook creation time (e.g. `#wd_performance`) — **not** overridable at runtime |
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

### SLACK_BOT_TOKEN + SLACK_TEAM_ID (Optional — Slack MCP posting)
If the Slack MCP is connected, the agent can post via `slack_send_message` instead of the webhook. With the MCP, the channel **is** selectable at runtime (the agent sends to `#wd_performance` by default). The webhook is the **preferred** path for automated/scheduled runs because it requires no MCP server.

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

### Prerequisites — Cloud Secrets

Go to **Cursor Dashboard → Cloud Agents → Secrets** and add these secrets. They are injected as environment variables into every Cloud Agent VM.

| Secret name | Value | Required? |
|-------------|-------|-----------|
| `KIBANA_WD_AUTH` | `username:password` (Kibana WD LDAP) | **Yes** — needed to query ES |
| `SLACK_WEBHOOK_MY_DAILY_UPDATE` | `https://hooks.slack.com/services/T.../B.../xxx` | **Yes** — Slack Incoming Webhook URL (channel is baked into the webhook — it posts to whatever channel you selected when creating the webhook in your Slack App) |
| `SLACK_BOT_TOKEN` | `xoxb-...` | Optional — only if using Slack MCP instead of webhook |
| `SLACK_TEAM_ID` | `T01ABCDE123` | Optional — only if using Slack MCP |

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
You are the WD ES Kibana agent. Generate the daily WD Kibana log report and post it to Slack.

Steps:
1. Read .cursor/skill-library/wd-es-kibana.skill.md for the full procedure.
2. Time window: yesterday 9:00 AM IST to today 9:00 AM IST (yesterday 03:30 UTC to today 03:30 UTC).
3. Query Kibana WD (https://kibana-wd.webgility.com) via HTTPS API. Auth is in KIBANA_WD_AUTH env variable. Use date-scoped indices (webgilitydesktop-YYYY.MM.DD).
4. Build the full daily report markdown per the skill's output format.
5. Save the report to reports/wd-kibana-logs/{YYYY-MM-DD}-wd-kibana-daily-report.md
6. Post a summary to Slack using the SLACK_WEBHOOK_MY_DAILY_UPDATE env variable (Incoming Webhook). The standalone script at .mcp-servers/es-logs/fetch-daily-logs.mjs can do this — run: node .mcp-servers/es-logs/fetch-daily-logs.mjs
7. Do not ask for confirmation — this is an automated run.
```

5. Under **Tools**, click **+ Add Tool or MCP** and add:
   - **Slack** MCP (optional fallback — the webhook is the primary posting path)
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
5. Under **Tools**, add **Slack** MCP (optional)
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
| Slack delivery channel | Fixed at webhook creation (e.g. `#wd_performance`) — channel override param is **ignored** by Slack App webhooks | 2026-05 |
| Slack webhook env var | `SLACK_WEBHOOK_MY_DAILY_UPDATE` | 2026-05 |
| Cursor Automation URL | `cursor.com/automations/new` | 2026-05 |
| Cursor Automation trigger | Webhook triggered → generates hook URL for external cron | 2026-05 |
| Cursor Automation repo | AskAI on master | 2026-05 |
| WD perf section | Single block **Performance by module — Shopify (PayoutPosting)**; metrics: total payouts, total time, min/max/avg time per payout; no separate Performance Signals / Performance by Store for this slice | 2026-05 |
