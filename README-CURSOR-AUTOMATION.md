# Cloud Cursor Automation: Complete Package

**All files ready for WD Kibana daily report automation setup**

---

## 📦 What You Have

### 1. Agent File (Source of Truth)
**File:** `.cursor/agents/wd-es-kibana.agent.md`  
**Purpose:** Full HTML report template, query DSL, field schema, styling, workflow  
**Usage:** Reference for automation, loads automatically when agent is selected  
**Status:** ✅ Already in repo, no changes needed

### 2. Automation Setup Guide (Step-by-Step)
**File:** `CURSOR-CLOUD-AUTOMATION-SETUP.md`  
**Purpose:** Cursor Cloud dashboard configuration, step-by-step with UI screenshots reference  
**Contents:**
- How to add `KIBANA_WD_AUTH` secret
- How to create automation in Cursor Dashboard
- Configuration form with all field values
- Testing & troubleshooting
- Monitoring & customization

**Usage:** Follow this exactly when setting up in Cursor Cloud

### 3. Automation Prompt (Optional)
**File:** `CURSOR-CLOUD-AUTOMATION-PROMPT.md`  
**Purpose:** Detailed prompt for the "Prompt" field in Cursor automation (optional)  
**Usage:** Copy-paste into Cursor Dashboard if you want explicit prompt, OR just select the agent file (both work)

### 4. Comprehensive Workflow (Reference)
**File:** `KIBANA-REPORT-AUTOMATION-INSTRUCTION.md`  
**Purpose:** Full technical workflow, error handling, performance tips, FAQ  
**Usage:** Reference for understanding how the automation works (read if you have questions)

---

## 🚀 Quick Start (5 Steps)

### Step 1: Add Secret to Cursor Cloud
```
Cursor Dashboard → Cloud Agents → Secrets → + Add Secret
  Name: KIBANA_WD_AUTH
  Value: username:password (your Kibana WD credentials)
  Click: Save
```

### Step 2: Create Automation
```
Cursor Dashboard → Automations → + New Automation
  Name: "WD Kibana Daily Report"
  Agent: wd-es-kibana
  Trigger: Schedule
  Cron: 0 4:30 * * *  (10:00 AM IST = 4:30 AM UTC)
  Git: Commit + Push enabled
  Slack: Enable "Send to Slack" + select channel (e.g., #wd-reports)
  Click: Save
```

### Step 3: Test Run
```
Cursor Dashboard → Automations → WD Kibana Daily Report → Run Now
  Wait for completion (2–3 minutes)
  Check: Logs show "Success"
```

### Step 4: Verify Output
```
GitHub: Check reports/wd-kibana-logs/2026-05-19-wd-kibana-daily-report.html exists
Slack: Check channel for posted message with htmlpreview link
Browser: Click link, verify report opens and displays correctly
```

### Step 5: Enable Schedule
```
Cursor Dashboard → Automations → WD Kibana Daily Report
  Toggle: Status = ON
  Automation now runs daily at 10:00 AM IST
```

---

## 📋 Configuration Values (Copy-Paste Ready)

### Secret
```
Name: KIBANA_WD_AUTH
Value: username:password
```

### Automation
```
Name:              WD Kibana Daily Report
Description:       Generate and deliver WD Kibana daily log report to Slack
Agent:             wd-es-kibana
Trigger Type:      Schedule
Cron:              0 4:30 * * *
Timezone:          UTC
Git Commit:        YES
Git Push:          YES
Git Branch:        master
Slack Enabled:     YES
Slack Channel:     #wd-reports (or your preferred channel)
```

### Environment
```
(All auto-injected from Secrets)
KIBANA_WD_AUTH = injected from secret above
```

---

## 🔍 What Happens Daily

**10:00 AM IST (4:30 AM UTC):**

1. ✅ Automation triggers
2. ✅ Queries Kibana WD for 6 data sets (Q1–Q6) in parallel
3. ✅ Generates 80+ Kibana short URLs
4. ✅ Builds rich HTML report with 13 sections
5. ✅ Writes file: `reports/wd-kibana-logs/2026-05-19-wd-kibana-daily-report.html`
6. ✅ Commits to GitHub
7. ✅ Posts to Slack:
   ```
   📊 WD Kibana Daily Report — 2026-05-19
   
   Key Metrics:
     • Total Events: 150,896 (↑1,339%)
     • Errors: 19,094 (↑901%)
     • Fatals: 4,605 (↑4,460%)
   
   🔗 View: https://htmlpreview.github.io/?https://github.com/.../2026-05-19-wd-kibana-daily-report.html
   ```

---

## ✅ Checklist Before Enabling

- [ ] Read `CURSOR-CLOUD-AUTOMATION-SETUP.md` (this guide)
- [ ] Have Kibana WD username:password ready
- [ ] Have Cursor Cloud access
- [ ] Have GitHub repo write access
- [ ] Have Slack channel access
- [ ] Added `KIBANA_WD_AUTH` secret to Cursor Cloud
- [ ] Created automation in Cursor Dashboard
- [ ] Ran test execution (Step 5)
- [ ] Verified report file exists in GitHub
- [ ] Verified Slack message posted
- [ ] Toggled automation status ON

---

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| **Secret not found error** | Go to Cursor Cloud → Secrets, add `KIBANA_WD_AUTH` |
| **Kibana WD unreachable** | Verify credentials, check network access to `https://kibana-wd.webgility.com` |
| **Slack message not posted** | Select Slack channel in automation settings |
| **Report file not created** | Check automation logs for query errors, verify credentials |
| **Git push failed** | Verify Cursor has push permission to repo |
| **Performance sections empty** | Normal — if no perf logs, report shows placeholder (not an error) |

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| `wd-es-kibana.agent.md` | Full agent code, template, queries (read if customizing) |
| `CURSOR-CLOUD-AUTOMATION-SETUP.md` | This file — complete setup guide |
| `CURSOR-CLOUD-AUTOMATION-PROMPT.md` | Optional verbose prompt (for explicit instructions) |
| `KIBANA-REPORT-AUTOMATION-INSTRUCTION.md` | Technical workflow, error handling, FAQ |

---

## 🎯 Success Indicators

After automation is enabled and runs for a few days:

✅ Report file appears daily in `reports/wd-kibana-logs/`  
✅ Slack message posted to channel with correct metrics  
✅ htmlpreview link works and displays full report  
✅ Report sections include vs-prev % changes  
✅ All Kibana drilldown links clickable  
✅ No errors in automation logs  

---

## 📞 Support

**Questions?** See:
- `KIBANA-REPORT-AUTOMATION-INSTRUCTION.md` → Section: "Error Handling" & "FAQ"
- `.cursor/agents/wd-es-kibana.agent.md` → Full query templates & styling
- Cursor Cloud documentation → Automation configuration

---

## Next Step: Ready to Configure?

👉 Follow **CURSOR-CLOUD-AUTOMATION-SETUP.md** → **Steps 1–6** in Cursor Cloud Dashboard

You're all set! 🚀
