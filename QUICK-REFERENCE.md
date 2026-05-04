# ⚡ Quick Reference: WD ES Kibana Daily Reports

## 🚀 Generate Report (Copilot Chat or Cursor)

```
@wd-es-kibana prepare wd daily kibana log report for today
```

**Output:** `reports/wd-kibana-logs/{YYYY-MM-DD}-wd-kibana-daily-report.md`

---

## 🤖 Post to Slack #wd_performance

### Setup (One-time)

**Local:**
```powershell
# 1. Create webhook at https://api.slack.com/apps
#    App: "WD Kibana Reporter" → Incoming Webhooks → #wd_performance

# 2. Store webhook
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
```

**Cursor Cloud:**
Add to agent secrets: `SLACK_WEBHOOK_MY_DAILY_UPDATE`, `SLACK_CHANNEL`, `KIBANA_WD_AUTH`

### Run

**Local:**
```powershell
& "scripts/post-report-to-slack.ps1"
# Posts to #wd_performance (env var default)
```

**Cursor Cloud:**
Automation runs automatically with cloud secrets

---

## 📋 Daily Workflow (2 Commands)

**Local:**
```powershell
# 1. Generate report
@wd-es-kibana prepare wd daily kibana log report for today

# 2. Post to Slack (#wd_performance by default)
& "scripts/post-report-to-slack.ps1"
```

**Cursor Cloud:**
- Automation runs on schedule (or manual trigger)
- Reads from Cursor secrets automatically
- Posts to #wd_performance

---

## 🔐 Credentials Required

### Local (Windows User Environment)

```powershell
[System.Environment]::SetEnvironmentVariable(
    'KIBANA_WD_AUTH',
    'username:password',
    'User'
)

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
```

### Cursor Cloud (Agent Secrets)

Add to Cursor Dashboard → Automation → Secrets:
1. `KIBANA_WD_AUTH` = `username:password`
2. `SLACK_WEBHOOK_MY_DAILY_UPDATE` = `https://hooks.slack.com/...`
3. `SLACK_CHANNEL` = `wd_performance`

---

## 📂 Key Files

| File | Purpose |
|------|---------|
| `.github/agents/wd-es-kibana.agent.md` | Report agent (Copilot/Cursor) |
| `scripts/post-report-to-slack.ps1` | Slack posting bot |
| `SLACK-AUTOMATION.md` | Full Slack setup guide |
| `reports/wd-kibana-logs/*.md` | Generated reports |

---

## 🎯 Report Contents

- 📊 **Executive Summary** — Total events, errors, fatals with day-over-day comparison
- 📉 **Breakdowns** — Errors by module, store, tag, process, subscriber
- 📨 **Top Messages** — Most common error messages with clickable Kibana links
- 📈 **Timeline** — Hourly error distribution (IST)
- 💀 **Fatals** — Critical events breakdown
- ⚡ **Performance** — Processed records, throughput rates
- 🔗 **Drilldown Links** — Kibana Discover links for each row (short URL format)

---

## ❌ Troubleshooting

| Problem | Fix |
|---------|-----|
| Agent not found | Restart Copilot/Cursor |
| KIBANA_WD_AUTH error | Set env var (see above) |
| Slack webhook error | Check webhook URL; restart terminal |
| Report file not found | Ensure report was generated first |
| PowerShell error | Use PowerShell 7.0+; check execution policy |

---

## 📞 Support

- **Report issues:** See `TASK-COMPLETION-SUMMARY.md`
- **Slack setup:** See `SLACK-AUTOMATION.md`
- **Cursor config:** See `.cursor/AGENT-CURSOR-CONFIG.md`
- **Agent docs:** See `.github/agents/wd-es-kibana.agent.md`

---

## 💾 Save This

Bookmark this file for quick reference:  
`C:\WG-Agentic\AskAI\QUICK-REFERENCE.md`

Or pin it in VS Code:  
`Ctrl+K Ctrl+P` → "QUICK-REFERENCE.md"
