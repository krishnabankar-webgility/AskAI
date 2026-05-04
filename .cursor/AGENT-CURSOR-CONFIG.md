---
name: "Cursor WD ES Kibana Agent"
description: "Cursor IDE integration for WD ES Kibana daily report generation"
---

# Cursor: WD ES Kibana Daily Report Automation

## Setup

1. **Enable Agent in Cursor:**
   - Cursor reads agents from `.github/agents/` automatically
   - The agent `wd-es-kibana.agent.md` is now available in Cursor's agent list
   - Reference it as: `@wd-es-kibana` or select from the agents dropdown

2. **Verify in VS Code/Copilot:**
   - GitHub Copilot chat reads from `.github/agents/`
   - When chatting with Copilot, mention `@wd-es-kibana` to invoke this agent

## Quick Commands

### Generate Today's Report (Cursor/Copilot)

```
@wd-es-kibana prepare wd daily kibana log report for today
```

**Result:**
- Queries Kibana WD for logs from yesterday 9 AM IST → today 9 AM IST
- Generates `reports/wd-kibana-logs/{YYYY-MM-DD}-wd-kibana-daily-report.md`
- Includes day-over-day comparison with previous report
- All drilldown links use short URLs (`/goto/`) for VS Code Markdown preview compatibility

### Generate Report for Specific Date

```
@wd-es-kibana prepare wd daily kibana log report for 2026-05-04
```

### Investigate Errors

```
@wd-es-kibana investigate error spike for subscriber 91162 on 2026-05-04
```

---

## Integration Points

### With Slack

After report generation, post to Slack:

```bash
# Manual: Copy report URL and post
# File: C:\WG-Agentic\AskAI\reports\wd-kibana-logs\2026-05-04-wd-kibana-daily-report.md

# Automated via GitHub Actions (see slack-post-workflow.yaml)
```

### With Confluence

The agent publishes reports to Confluence automatically:
- **Space:** `2590998546`
- **Parent:** `3042410502`
- Title: `WD Kibana Daily Report - {report-date}`

---

## Keyboard Shortcuts (Cursor)

| Action | Shortcut |
|--------|----------|
| Open Agent Chat | `Ctrl+K` then type `@wd-es-kibana` |
| Quick Report | `Cmd+Shift+P` → "WD ES: Generate Daily Report" |

---

## File Locations

| File | Purpose |
|------|---------|
| `.github/agents/wd-es-kibana.agent.md` | Agent definition (Cursor/Copilot) |
| `reports/wd-kibana-logs/{YYYY-MM-DD}-wd-kibana-daily-report.md` | Generated reports |
| `reports/wd-kibana-logs/short-urls-*.json` | Kibana short URL cache |
| `reports/wd-kibana-logs/gen-short-urls-*.ps1` | Short URL generation scripts |

---

## Credentials Required

- **Environment Variable:** `KIBANA_WD_AUTH` (set at Windows User level)
- **Format:** `username:password` (base64 encoded for HTTP Basic auth)
- **Setup:**
  ```powershell
  [System.Environment]::SetEnvironmentVariable('KIBANA_WD_AUTH', 'user:pass', 'User')
  ```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Agent not found in Cursor | Restart Cursor; check `.github/agents/` exists |
| KIBANA_WD_AUTH not set | Run PowerShell command above; restart terminal |
| Timeout on large queries | Use specific date indices, not wildcards |
| Short URLs not working | Re-run `gen-short-urls-*.ps1`; check Kibana API response |
| Markdown links broken in VS Code | Links should use `/goto/` format (no `#` fragment) |

---

## Advanced: Custom Slack Webhook Setup

For automated Slack posting, create a GitHub Actions workflow or Curl script.

See `scripts/post-report-to-slack.ps1` for manual Slack posting.

---

## Version Info

- **Agent Name:** `wd-es-kibana`
- **Agent Version:** 2026.05.04
- **Kibana Version:** 7.6.2
- **Kibana WD URL:** `https://kibana-wd.webgility.com`
- **Last Updated:** 2026-05-04
