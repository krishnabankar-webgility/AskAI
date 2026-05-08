---
name: "Slack Daily Report Automation"
description: "Automation rules to post WD Kibana daily reports to Slack (channel configured in Cursor Automation UI)"
---

# Slack Daily Report Automation — #my-daily-update

## Setup Options

### Option 1: Manual Slack Post (Quick Test)

```bash
# 1. Generate report in Cursor/Copilot
@wd-es-kibana prepare wd daily kibana log report for today

# 2. Copy the file path from response (e.g., reports/wd-kibana-logs/2026-05-04-wd-kibana-daily-report.md)

# 3. Post to Slack manually or use PowerShell script (see Option 2)
```

---

### Option 2: PowerShell Slack Bot (Works Local + Cursor Cloud)

**File:** `scripts/post-report-to-slack.ps1`

**Local Usage:**
```powershell
& "scripts/post-report-to-slack.ps1" -ReportDate "2026-05-04"
# Uses SLACK_CHANNEL (default: wd_performance)
```

**Cursor Cloud Usage:**
Script automatically reads:
- `SLACK_WEBHOOK_MY_DAILY_UPDATE` from agent secrets
- `SLACK_CHANNEL` from agent secrets (or defaults to wd_performance)
- `KIBANA_WD_AUTH` from agent secrets

**Local Setup (One-time):**

```powershell
# 1. Create Slack app & webhook:
#    - Go to https://api.slack.com/apps
#    - Create app → Incoming Webhooks
#    - Enable Incoming Webhooks → Add New Webhook to Workspace
#    - Select channel: #wd_performance
#    - Copy webhook URL

# 2. Store webhook in local environment variable:
[System.Environment]::SetEnvironmentVariable(
    'SLACK_WEBHOOK_MY_DAILY_UPDATE',
    'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
    'User'
)

# 3. Optional - Store channel name (defaults to wd_performance):
[System.Environment]::SetEnvironmentVariable(
    'SLACK_CHANNEL',
    'wd_performance',
    'User'
)

# 4. Test:
& "scripts/post-report-to-slack.ps1" -ReportDate "2026-05-04"
```

**Cursor Cloud Setup (One-time):**

1. Go to Cursor Dashboard → Your Project → Automation
2. Click **Secrets**
3. Add these keys:
   - `SLACK_WEBHOOK_MY_DAILY_UPDATE` = `https://hooks.slack.com/services/YOUR/WEBHOOK/URL`
   - `SLACK_CHANNEL` = `wd_performance`
   - `KIBANA_WD_AUTH` = `username:password`
4. Save and re-run automation rule

---

### Option 3: GitHub Actions Scheduled Daily Report

**File:** `.github/workflows/daily-kibana-report.yaml`

```yaml
name: Daily WD Kibana Report

on:
  schedule:
    - cron: '30 3 * * *'  # 9:00 AM IST (3:30 AM UTC) daily
  workflow_dispatch:  # Manual trigger

jobs:
  generate-report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0

      - name: Setup PowerShell
        uses: PowerShell/[email protected]
        with:
          psversion: '7.4.1'

      - name: Generate Kibana Report
        env:
          KIBANA_WD_AUTH: ${{ secrets.KIBANA_WD_AUTH }}
        shell: pwsh
        run: |
          # Trigger report generation via Copilot API (or manual script)
          $today = (Get-Date).ToString("yyyy-MM-dd")
          Write-Host "Generating report for $today..."
          
          # Assuming a standalone script exists:
          # & "scripts/generate-wd-kibana-report.ps1" -Date $today
          
          # Or call the agent via API if available
          # (This requires setting up an MCP server or GitHub Actions integration)

      - name: Post to Slack
        env:
          SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK_MY_DAILY_UPDATE }}
        shell: pwsh
        run: |
          $today = (Get-Date).ToString("yyyy-MM-dd")
          $reportPath = "reports/wd-kibana-logs/$today-wd-kibana-daily-report.md"
          
          if (Test-Path $reportPath) {
              $reportContent = Get-Content $reportPath -Raw
              
              $payload = @{
                  channel  = "my-daily-update"
                  username = "WD Kibana Reporter"
                  text     = "📊 Daily Kibana Report: $today"
                  blocks   = @(...)  # See Option 2 for payload structure
              } | ConvertTo-Json -Depth 10
              
              Invoke-WebRequest -Uri $env:SLACK_WEBHOOK -Method Post -Body $payload -ContentType "application/json"
          }

      - name: Commit & Push (if changes)
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add reports/wd-kibana-logs/
          git commit -m "WD Kibana Daily Report - $(date +%Y-%m-%d)" || echo "No changes"
          git push
```

---

### Option 4: Cursor Rules File (`.cursorrules`)

**File:** `.cursorrules`

```
# WD Kibana Daily Report Automation

## Rule: Post Report to Slack After Generation

When a user requests or mentions:
- "prepare wd daily kibana log report"
- "generate report"
- "post to slack"

After the report file is created in `reports/wd-kibana-logs/`, automatically:

1. Extract key metrics from the markdown file
2. Format a Slack-friendly message with:
   - 📊 Title: "WD Kibana Daily Report — {DATE}"
   - Stats box: Total Events, Errors, Fatals
   - Link to the file
   - Link to Kibana WD

3. Post to Slack webhook stored in `$env:SLACK_WEBHOOK_MY_DAILY_UPDATE`

4. Respond: "✅ Report posted to #my-daily-update"

## Implementation Command

```cursor
@wd-es-kibana prepare report and post to slack my-daily-update
```

---

## Schedule & Timing

- **Daily Trigger Time:** 9:00 AM IST (3:30 AM UTC)
- **Report Period:** Yesterday 9:00 AM IST → Today 9:00 AM IST
- **Channel:** #wd_performance
- **Automation:** GitHub Actions (Option 3) or Manual (Option 2)
- **Execution:** Works both locally and on Cursor Cloud agents

---

## Slack Webhook Setup

1. Go to https://api.slack.com/apps
2. Create New App → From scratch
3. App name: "WD Kibana Reporter"
4. Workspace: Select your Slack workspace
5. Left sidebar: "Incoming Webhooks"
6. Toggle: "Activate Incoming Webhooks"
7. Button: "Add New Webhook to Workspace"
8. Select channel: **#wd_performance**
9. Copy webhook URL
10. Store in environment:

**Local Setup:**
```powershell
[System.Environment]::SetEnvironmentVariable(
    'SLACK_WEBHOOK_MY_DAILY_UPDATE',
    'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
    'User'
)

[System.Environment]::SetEnvironmentVariable(
    'SLACK_CHANNEL',
    'wd_performance',
    'User'
)

# Restart terminal/VS Code for changes to take effect
```

**Cursor Cloud Setup:**
Add to agent secrets in Cursor Dashboard:
- Key: `SLACK_WEBHOOK_MY_DAILY_UPDATE`
- Value: Your webhook URL
- Key: `SLACK_CHANNEL`
- Value: `wd_performance`

---

## Testing

### Test PowerShell Script (Local)
```powershell
cd C:\WG-Agentic\AskAI
& "scripts/post-report-to-slack.ps1" -ReportDate "2026-05-04"
# Posts to #wd_performance (default channel)
```

### Test with Specific Channel Override
```powershell
& "scripts/post-report-to-slack.ps1" -ReportDate "2026-05-04" -Channel "test-channel"
```

### Test Webhook Direct (Local)
```powershell
$webhook = [System.Environment]::GetEnvironmentVariable('SLACK_WEBHOOK_MY_DAILY_UPDATE', 'User')
$channel = [System.Environment]::GetEnvironmentVariable('SLACK_CHANNEL', 'User') -or "wd_performance"

$payload = @{
    channel = "#$channel"
    text = "🧪 Test message from WD Kibana Reporter (Local)"
} | ConvertTo-Json

Invoke-WebRequest -Uri $webhook -Method Post -Body $payload -ContentType "application/json"
```

### Test Cursor Cloud Agent
1. Add secrets to Cursor Dashboard
2. Run agent command: `@wd-es-kibana prepare wd daily kibana log report for today`
3. Message should appear in #wd_performance

### Expected Output
```
✅ Report posted successfully to Slack #wd_performance
📋 Report: reports/wd-kibana-logs/2026-05-04-wd-kibana-daily-report.md
📊 Metrics: 32,443 events, 5,564 errors, 17.15% error rate
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Webhook returns 403 | Check webhook URL; verify channel exists |
| Message not appearing | Check Slack app permissions; verify channel name |
| Character encoding error | Ensure PowerShell uses UTF-8; add `-Encoding UTF8` to ConvertTo-Json |
| Report file not found | Verify report was generated; check path |

---

## Recap: Full Automation Flow

1. **9:00 AM IST daily** → GitHub Actions triggers
2. Copilot/Cursor agent generates report
3. PowerShell script extracts metrics
4. Slack webhook posts to #my-daily-update
5. Team sees daily report with:
   - 📊 Key metrics (Events, Errors, Fatals)
   - 🔗 Direct link to Kibana
   - 📄 Link to full report file
   - 📉 Day-over-day comparison

---

## File Locations

| File | Purpose |
|------|---------|
| `.github/agents/wd-es-kibana.agent.md` | Report generation agent |
| `scripts/post-report-to-slack.ps1` | Slack posting script |
| `.github/workflows/daily-kibana-report.yaml` | GitHub Actions scheduler |
| `.cursorrules` | Cursor automation rules |
| `reports/wd-kibana-logs/{DATE}-wd-kibana-daily-report.md` | Generated reports |

---

## Next Steps

- [ ] Set up Slack webhook URL in environment
- [ ] Test PowerShell script manually
- [ ] Enable GitHub Actions workflow
- [ ] Verify first report posts to Slack
- [ ] Set up daily schedule
