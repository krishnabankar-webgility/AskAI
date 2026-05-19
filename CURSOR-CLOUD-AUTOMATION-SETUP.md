# Cursor Cloud Automation Setup: WD Kibana Daily Report

**Purpose:** Generate and deliver WD Kibana daily log report to Slack with GitHub htmlpreview link.

**Status:** Ready for Cursor Cloud configuration

---

## Prerequisites

- [ ] Cursor Cloud account with Cloud Agents access
- [ ] Kibana WD credentials (LDAP username:password)
- [ ] Slack workspace access + bot token (if using custom Slack integration)
- [ ] GitHub repository with write access to `reports/wd-kibana-logs/` directory

---

## Step 1: Add Credentials to Cursor Cloud Secrets

1. Open **Cursor Dashboard** → **Cloud Agents** → **Secrets**
2. Click **+ Add Secret**
3. Fill in:
   - **Name:** `KIBANA_WD_AUTH`
   - **Value:** `username:password` (your Kibana WD LDAP credentials)
   - **Scope:** Cloud Agents
4. Click **Save**

✓ This variable will be automatically injected into every Cloud Agent VM as `$env:KIBANA_WD_AUTH`

---

## Step 2: Create Daily Automation in Cursor Cloud

### Navigation
**Cursor Dashboard** → **Automations** → **+ New Automation**

### Configuration Form

| Field | Value |
|-------|-------|
| **Automation Name** | `WD Kibana Daily Report` |
| **Description** | Generate and deliver WD Kibana daily log report to Slack |
| **Agent** | Select: `wd-es-kibana` (from `.cursor/agents/wd-es-kibana.agent.md`) |
| **Trigger Type** | **Schedule** |
| **Schedule** | `0 10 * * *` (Daily at 10:00 AM UTC) OR `0 4:30 * * *` (Daily at 4:30 AM UTC = 10:00 AM IST) |
| **Timezone** | UTC or Asia/Kolkata (10:00 AM IST is 04:30 AM UTC) |
| **Git Branch** | `master` (or your default branch) |
| **Commit Changes** | **Yes** — auto-commit report HTML file |
| **Push Changes** | **Yes** — auto-push to remote |
| **Slack Integration** | **Enable "Send to Slack"** |
| **Slack Channel** | Select channel (e.g., `#wd-reports`, `#engineering`, etc.) |

---

## Step 3: Environment Variables (Optional)

If you need additional environment variables, add them under **Automation Settings** → **Environment Variables**:

| Variable | Value | Required? |
|----------|-------|-----------|
| `KIBANA_WD_AUTH` | Auto-injected from Secrets | ✓ Yes |
| `GITHUB_BRANCH` | `master` | Optional (defaults to branch in config) |
| `REPORT_DIR` | `reports/wd-kibana-logs` | Optional (hardcoded in agent) |

---

## Step 4: Configure Slack Delivery

### Built-in "Send to Slack" Tool (Recommended)

The Cursor Automation platform will automatically post the agent's response to your selected Slack channel.

- **Channel:** Choose from dropdown (e.g., `#wd-reports`)
- **Message format:** Agent will provide summary + link
- **No additional setup needed** — Cursor handles auth

### Expected Slack Message

```
📊 WD Kibana Daily Report — 2026-05-19

Key Metrics:
  • Total Events: 150,896 (↑1,339% from 10,486)
  • Errors: 19,094 (↑901% from 1,907)  
  • Fatals: 4,605 (↑4,460% from 101)

🔗 View full report: https://htmlpreview.github.io/?https://github.com/krishnabankar-webgility/AskAI/blob/master/reports/wd-kibana-logs/2026-05-19-wd-kibana-daily-report.html

Period: 2026-05-18 9:00 AM IST → 2026-05-19 9:00 AM IST
```

---

## Step 5: Test Run Before Enabling Schedule

1. Go to **Cursor Dashboard** → **Automations** → **WD Kibana Daily Report**
2. Click **Run Now** (test execution)
3. Monitor execution in **Recent Runs** tab
4. Expected results:
   - ✓ Status: `Success`
   - ✓ Output includes report file path
   - ✓ Git commit created (if enabled)
   - ✓ Slack message posted to channel
   - ✓ No errors in logs

### Verify Report File

After test run completes:

1. Check GitHub repo: `reports/wd-kibana-logs/2026-05-19-wd-kibana-daily-report.html` (file exists)
2. Check Slack: Message posted to selected channel
3. Click htmlpreview link: Report opens in browser, all sections visible

---

## Step 6: Enable Recurring Schedule

1. **Automation Status:** Toggle to **ON**
2. **Schedule:** Verify cron expression is correct
3. **Save**

Automation will now run daily at scheduled time.

---

## Monitoring & Troubleshooting

### Check Automation Runs

**Cursor Dashboard** → **Automations** → **WD Kibana Daily Report** → **Recent Runs**

| Status | Action |
|--------|--------|
| ✅ **Success** | Report generated, check Slack and GitHub |
| ⚠️ **Partial Success** | Some queries failed (acceptable if others succeeded) |
| ❌ **Failed** | Check logs for error details (likely credential or connectivity issue) |

### Common Issues

| Issue | Diagnosis | Fix |
|-------|-----------|-----|
| **"KIBANA_WD_AUTH not found"** | Secret not added | Go to Secrets, add `KIBANA_WD_AUTH` |
| **"Connection refused"** | Kibana WD unreachable | Verify `https://kibana-wd.webgility.com` is accessible |
| **"Slack message not posted"** | Channel not configured | Go back to Step 4, select Slack channel |
| **"Git push failed"** | Git credentials missing | Verify Cursor has push permission to repo |
| **"Query timeout"** | ES slow query | Acceptable — report will skip that section and continue |

### View Automation Logs

Click **View Logs** on any run to see detailed execution output:
- ES query times
- Short URL generation status
- HTML report file size
- Git commit hash
- Slack delivery status

---

## Customization Options

### Change Schedule Time

Edit **Schedule** field:
- `0 10 * * *` = 10:00 AM UTC (4:30 PM IST)
- `0 4:30 * * *` = 4:30 AM UTC (10:00 AM IST) ← **Recommended**
- `30 9 * * *` = 9:30 AM UTC (3:00 PM IST)

### Change Slack Channel

1. Edit automation
2. Under **Slack Integration**, select different channel
3. Save
4. Run test to verify

### Modify Report Template

The report template is in `.cursor/agents/wd-es-kibana.agent.md`. To customize sections:
1. Edit agent file
2. Commit changes to repo
3. Cursor will auto-reload next run

---

## Expected Daily Output

### File Generated
```
reports/wd-kibana-logs/2026-05-19-wd-kibana-daily-report.html
Size: 40–60 KB
Format: Self-contained HTML (no external deps)
```

### Git Commit
```
Commit: "Daily report: WD Kibana logs for 2026-05-19"
Branch: master
Files: reports/wd-kibana-logs/2026-05-19-wd-kibana-daily-report.html
```

### Slack Message (auto-posted)
```
Channel: #wd-reports (or selected channel)
Format: Summary + htmlpreview.github.io link
Time: Immediately after automation completes
```

---

## Sample Automation Configuration (Copy-Paste Reference)

```yaml
name: "WD Kibana Daily Report"
description: "Generate and deliver WD Kibana daily log report to Slack"
agent: "wd-es-kibana"
trigger:
  type: "schedule"
  cron: "0 4:30 * * *"  # 4:30 AM UTC = 10:00 AM IST
  timezone: "UTC"
git:
  commit: true
  push: true
  branch: "master"
slack:
  enabled: true
  channel: "#wd-reports"  # Change as needed
secrets:
  - "KIBANA_WD_AUTH"
```

---

## Success Criteria

After enabling automation, verify:

- [ ] Automation runs daily at scheduled time
- [ ] Report file appears in GitHub after each run
- [ ] Slack message posted with summary + link
- [ ] htmlpreview link opens and displays full report
- [ ] No errors in automation logs
- [ ] Slack message includes vs-prev % changes
- [ ] Report contains all 13 sections (even if some have "No data")

---

## Next Steps

1. **Immediate:** Follow Steps 1–4 above
2. **Test:** Run Step 5 (test execution)
3. **Verify:** Check GitHub and Slack for report
4. **Enable:** Step 6 (toggle automation ON)
5. **Monitor:** Check automation runs for first week

---

## Support

**For questions:**
- Check [KIBANA-REPORT-AUTOMATION-INSTRUCTION.md](KIBANA-REPORT-AUTOMATION-INSTRUCTION.md) for detailed workflow
- Review `.cursor/agents/wd-es-kibana.agent.md` for report template and queries
- Check Cursor Cloud documentation for automation configuration

**For issues:**
- Review Automation Logs in Cursor Dashboard
- Verify `KIBANA_WD_AUTH` secret is set
- Test connectivity to Kibana WD: `https://kibana-wd.webgility.com`
- Verify Slack channel exists and bot has permission to post
