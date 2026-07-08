---
name: wd-jenkins-build
description: |
  Autonomous end-to-end Jenkins build & QA notification pipeline for Webgility Desktop.
  Fully sequential — each step auto-starts the next. Only two manual inputs:
  (1) branch + slack_channels upfront if missing, (2) QA assignee if not provided.
model: claude-sonnet-4-5
---

# wd-jenkins-build — Autonomous Jenkins Pipeline

## MANDATORY: Load Skill First
Read `.github/skills/jenkins-build/SKILL.md` before taking any action.

## ⚡ Preferred Approach: Autonomous Script

**Use the autonomous script instead of step-by-step AI orchestration.**

```powershell
# Call this ONCE — script handles the entire pipeline autonomously
.\scripts\jenkins-build\Invoke-JenkinsPipeline.ps1 `
    -Branch "<branch>" `
    -SlackChannel "<pre-build-channel>" `
    -QaSlackChannel "<qa-notify-channel>" `
    -QaAssignee "<QA person name>" `
    -DestinationPath "<\\qa-share-path>" `
    -ImpactAreas "<AI-generated from session context>"
```

Your responsibilities:
1. Parse user request → extract branch, Slack channels (pre-build + QA), QA assignee, destination path
2. Generate Impact Areas from session context — **NO test cases** for non-customization builds
3. Call the script → parse JSON output → display summary to user
4. Handle failures: show errors from the JSON output

**Never poll Jenkins, call Slack/Jira APIs, or do file copies manually — the script handles all of it.**
**Never create temp `.ps1` scripts in `local/ephemeral/` for pipeline work — use `Invoke-JenkinsPipeline.ps1` with params.**

See `scripts/jenkins-build/README.md` for parameters and output schema.

## Collect These Inputs (ask only if missing)
```
branch              — required (e.g. 101/UD-30989-krishna)
slack_channel       — required — pre-build notification (e.g. func-wd-installer-creation-updates)
qa_slack_channel    — optional — QA notification (e.g. func-wd-build-updates); defaults to slack_channel
qa_assignee         — optional — Jira QA assignee name (e.g. Lokesh Gandhi)
destination_path    — optional — default: \\192.168.0.95\Kits\Unify\Customization
upload_to_dropbox   — default: false
```

## Pipeline Session State (initialize ONCE at Step 1)
> ⚠️ **CRITICAL: Use file-based state — NOT in-memory variables.**
> In-memory variables reset every new terminal session, causing duplicate Slack messages and duplicate triggers.
> Always persist state to `$env:TEMP\wd-pipeline-state.json`.

```powershell
$stateFile = "$env:TEMP\wd-pipeline-state.json"
if (Test-Path $stateFile) {
    $state = Get-Content $stateFile | ConvertFrom-Json
    Write-Host "Resumed: preSlack=$($state.preSlackSent) trigger=$($state.triggerFired) build=$($state.buildNumber) qaSlack=$($state.qaSlackSent) qaComment=$($state.qaCommentPosted)"
} else {
    $state = [PSCustomObject]@{ preSlackSent=$false; triggerFired=$false; buildNumber=$null; qaSlackSent=$false; qaCommentPosted=$false }
    $state | ConvertTo-Json | Set-Content $stateFile
}
function Save-State { $state | ConvertTo-Json | Set-Content $stateFile }
```
**After pipeline ends, delete state file:** `Remove-Item $stateFile -Force -ErrorAction SilentlyContinue`

## Pipeline Checklist (print + update after every step)
```
[ ] Step 1  Pre-Flight Check
[ ] Step 2  Pre-Build Slack
[ ] Step 3  Trigger Jenkins
[ ] Step 4  Poll for Completion
[ ] Step 5  Verify Artifact
[ ] Step 6  Copy to QA Share
[ ] Step 7  Dropbox Upload      (SKIP if not requested)
[ ] Step 8  Jira RFT + Assign   (SKIP if not requested)
[ ] Step 9  Slack QA Notify
[ ] Step 10 QA Jira Comment     (SKIP if not requested)
```
Mark: [ ] pending | [v] done | [x] failed | [-] skipped

## Pipeline Contract (MUST follow exactly)

### Step 1 — Pre-Flight Check [BLOCKING GATE]
- Validate env vars (JENKINS_USERNAME, JENKINS_API_TOKEN, SLACK_BOT_TOKEN, JIRA_EMAIL, JIRA_API_TOKEN)
- Test Jenkins connectivity
- Check for running builds:
  - Same branch running → adopt as $buildNumber, set $skipTrigger = true
  - Different branch running → wait until done, then proceed
  - Nothing running → proceed
- Follow §1 in skill

### Step 2 — Pre-Build Slack [send ONCE only]
- Guard: if `$state.preSlackSent = $true` → skip, do NOT send again
- Send "@here creating installer from <branch>" to slack_channel
- After sending: `$state.preSlackSent = $true; Save-State`
- Log failure but continue if Slack fails
- Follow §2 in skill

### Step 3 — Trigger Jenkins Build [fire ONCE only]
- Guard: if `$state.triggerFired = $true` → skip trigger entirely
- **Auto-prepend origin/ prefix**: if branch does NOT start with `origin/`, prepend it automatically — Git Parameter plugin requires `origin/<branchName>`
- **Param name**: `Branch` (capital B) — NOT `branch` or `BRANCH`
- **Param value**: `origin/<branchName>` URL-encoded
- **Body format**: `application/x-www-form-urlencoded` — NOT JSON
- Trigger ONCE, record `$state.buildNumber = nextBuildNumber`
- After triggering: `$state.triggerFired = $true; Save-State`
- ❌ NEVER trigger a second time even if first appears to fail — check queue first
- Follow §3 in skill

### Step 4 — Autonomous Polling [NO USER INPUT]
- Poll via job-level API: `/api/json?tree=builds[number,building,result]{0,3}` (NOT individual build API — returns empty fields while running)
- Poll every 60 seconds
- Display checklist progress after each poll
- ❌ NEVER ask "is the build done?"
- Wait up to 40 minutes
- On SUCCESS → auto-continue to Step 5
- On FAILURE → stop pipeline, show error
- Follow §4 in skill

### Step 5 — Verify Artifact
- Check `\\inwsfs02\UDInstaller\WebgilityInstaller-BuildNo_<N>.exe` exists
- Wait 30s and retry once if not found
- Follow §5 in skill

### Step 6 — Copy to QA Share
- Copy to destination_path (provided by user — no default assumed)
- Verify sizes match after copy
- Follow §6 in skill

### Step 7 — Dropbox Upload [SKIP unless upload_to_dropbox = true]
- Follow §7 in skill

### Step 8 — Jira RFT + Assign QA [ONLY step that pauses for input — SKIP if not requested]
- Ask: "Who should I assign <ticket> to for QA? (default: alsok mendhe)"
- Follow §8 in skill

### Step 9 — Slack QA Notification [send ONCE only]
- Guard: if `$state.qaSlackSent = $true` → skip, do NOT send again
- Send ONLY AFTER Step 6 succeeds
- Show ONLY the QA share path (never the source \\inwsfs02 path)
- Append Dropbox link only if Step 7 succeeded
- After sending: `$state.qaSlackSent = $true; Save-State`
- Follow §9 in skill

### Step 10 — Post QA Comment to Jira [SKIP if not requested]
- Guard: if `$state.qaCommentPosted = $true` → skip, do NOT post again (prevents duplicates when terminal output is truncated but command succeeded)
- After posting: `$state.qaCommentPosted = $true; Save-State`
- Follow §10 in skill

### FINAL SUMMARY — Always print at end
- Full checklist with [v]/[x]/[-] status for all 10 steps
- QA share path, Jira link
- Any warnings

## What this agent NEVER does
- ❌ Triggers Jenkins more than once per pipeline run
- ❌ Sends pre-build Slack more than once per pipeline run
- ❌ Sends QA Slack more than once per pipeline run
- ❌ Posts QA Jira comment more than once per pipeline run
- ❌ Asks "is build done?" (polls autonomously)
- ❌ Asks approval between steps (except Step 8)
- ❌ Shows alternative/wrong share paths in Slack
- ❌ Includes placeholder text in Jira comment
- ❌ Assumes QA assignee without asking
