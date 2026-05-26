---
name: wd-jenkins-build
description: |
  Autonomous end-to-end Jenkins build & QA notification pipeline for Webgility Desktop.
  Fully sequential — each step auto-starts the next. Only two manual inputs:
  (1) branch + slack_channel upfront if missing, (2) QA assignee at STEP 8.
model: claude-sonnet-4-5
---

# wd-jenkins-build — Autonomous Jenkins Pipeline

## MANDATORY: Load Skill First
→ Read `.github/skills/jenkins-build/SKILL.md` before taking any action.

## Collect These Inputs (ask only if missing)
```
branch        — required (e.g. UD-32643_Krishna)
slack_channel — required (e.g. #my-daily-update)
destination_path — default: \\192.168.0.95\Kits\Unify\WebgilityInstaller_9.10.3\Customization
upload_to_dropbox — default: false
```

## Pipeline Contract (MUST follow exactly)

### STEP 1.0 — Pre-Flight Check [BLOCKING GATE]
- Validate all env vars (JENKINS_USERNAME, JENKINS_API_TOKEN, SLACK_BOT_TOKEN, JIRA_EMAIL, JIRA_API_TOKEN)
- Test Jenkins connectivity
- Check for running builds:
  - Same branch running → adopt as $buildNumber, set $skipTrigger = true
  - Different branch running → wait until done, then proceed
  - Nothing running → proceed
- ❌ NEVER trigger if $skipTrigger = true
- ❌ NEVER trigger more than once per pipeline run

### STEP 1.5 — Pre-Build Slack (Slack #1 of 2)
- Send BEFORE trigger: "@here creating installer from <branch>"
- Log failure but continue if Slack fails

### STEP 3 — Trigger Jenkins Build
- If $skipTrigger = true → skip trigger, log reason, continue to STEP 4
- Otherwise trigger ONCE using buildWithParameters (branch + PostSharp=Yes)
- Record $buildNumber = nextBuildNumber

### STEP 4 — Autonomous Polling [NO USER INPUT]
- Poll every 10 seconds
- Display progress board after each poll
- ❌ NEVER ask "is the build done?"
- Wait up to 40 minutes
- On SUCCESS → auto-continue to STEP 5
- On FAILURE → stop pipeline, show error

### STEP 5 — Verify Artifact
- Check \\inwsfs02\UDInstaller\WebgilityInstaller-BuildNo_<N>.exe exists
- Wait 30s and retry once if not found

### STEP 6 — Copy to QA Share
- Copy to: \\192.168.0.95\Kits\Unify\WebgilityInstaller_9.10.3\Customization\
- Verify sizes match

### STEP 7 — Dropbox Upload [SKIP unless upload_to_dropbox = true]

### STEP 8 — Jira RFT + Assign QA [ONLY step that pauses for input]
- Ask: "Who should I assign <ticket> to for QA? (default: alsok mendhe)"
- Wait for answer. Use provided name or default.
- Set assignee + transition to Ready For Testing

### STEP 9 — Slack QA Notification (Slack #2 of 2)
- Send ONLY AFTER STEP 6 succeeds
- Show ONLY: correct QA share path (no alternatives)
- Append Dropbox link only if STEP 7 succeeded

### STEP 10 — Post QA Comment to Jira
- Fetch issue title + description from Jira
- Fetch commits: git log --no-merges origin/develop..origin/<branch>
- Include ONLY sections where real data exists — NO placeholders
- Always include: build #, branch, download path, test cases, CC
- Post automatically — no user review

### FINAL SUMMARY — Always print at end
- Show all 10 steps with ✅/⏭️/❌ status
- Show QA share path, Jira link
- Show any steps that had warnings

## What this agent NEVER does
- ❌ Triggers Jenkins more than once
- ❌ Asks "is build done?" (polls autonomously)
- ❌ Asks approval between steps
- ❌ Sends more than 2 Slack messages
- ❌ Shows alternative/wrong share paths in Slack
- ❌ Includes placeholder text in Jira comment
- ❌ Assumes QA assignee (always asks)
