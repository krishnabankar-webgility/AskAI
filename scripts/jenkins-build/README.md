# Jenkins Build Pipeline — Autonomous Scripts

## Problem

The original `wd-jenkins-build` agent workflow consumed **15–55 AI turns** per pipeline run:

| Step | Original AI Turns | Why Wasteful |
|------|------------------|--------------|
| Pre-flight checks | 1–2 | Env var reads + Jenkins API calls — no reasoning needed |
| Pre-build Slack | 1 | Simple `chat.postMessage` API call |
| Trigger Jenkins | 1 | URL-encoded POST — mechanical |
| **Poll completion** | **10–40** | **Each 60s poll = entire AI inference cycle. Biggest waste.** |
| Verify artifact | 1 | `Test-Path` on network share |
| Copy to QA share | 1 | `Copy-Item` + size verification |
| Dropbox upload | 1–2 | REST API calls |
| QA Slack notification | 1 | `chat.postMessage` |
| Jira comment posting | 1 | REST API call |

**Only 2 things genuinely need AI reasoning:**
1. Understanding user request ("build branch X on #channel")
2. Generating Impact Areas + Test Cases from PR/session context

## Solution

One PowerShell script handles the **entire pipeline** autonomously. AI calls it once with parameters. All polling, retries, VPN checks, and notifications happen in script — zero AI tokens consumed.

**Result: 55 AI turns → 1–2 AI turns (~97% reduction)**

## Usage

### AI Agent Call (the ONLY AI interaction)

```powershell
# Minimal — AI extracts Jira ID from branch, auto-generates impact areas from git log
.\Invoke-JenkinsPipeline.ps1 `
    -Branch "101/UD-32643-user/krishna" `
    -SlackChannel "#my-daily-update"

# With separate QA Slack channel — pre-build goes to one channel, QA notify to another
.\Invoke-JenkinsPipeline.ps1 `
    -Branch "101/UD-30989-krishna" `
    -SlackChannel "func-wd-installer-creation-updates" `
    -QaSlackChannel "func-wd-build-updates" `
    -DestinationPath "\\192.168.0.95\Kits\Unify\WebgilityInstaller_9.10.5\Customizations" `
    -QaAssignee "Lokesh Gandhi"

# Full options — AI pre-generates impact areas and test cases from session context
.\Invoke-JenkinsPipeline.ps1 `
    -Branch "101/UD-32643-user/krishna" `
    -SlackChannel "#my-daily-update" `
    -DestinationPath "\\192.168.0.95\Kits\Unify\Customization" `
    -UploadToDropbox `
    -QaAssignee "alsok mendhe" `
    -ImpactAreas "- OrderSync module: modified retry logic`n- CIS adapter: added timeout handling" `
    -TestCases "1. Verify order sync retry on timeout`n2. Verify CIS adapter reconnects after network drop" `
    -CustomizationNode "CIM_Profile12345"

# Dry run — shows plan without executing
.\Invoke-JenkinsPipeline.ps1 `
    -Branch "develop" `
    -SlackChannel "#builds" `
    -DryRun
```

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `-Branch` | ✅ | — | Git branch name (e.g. `101/UD-32643-user/krishna`) |
| `-SlackChannel` | ✅ | — | Pre-build Slack channel (e.g. `func-wd-installer-creation-updates`) |
| `-QaSlackChannel` | ❌ | `$SlackChannel` | QA notification Slack channel (e.g. `func-wd-build-updates`) |
| `-DestinationPath` | ❌ | `\\192.168.0.95\Kits\Unify\Customization` | QA share path |
| `-UploadToDropbox` | ❌ | `$false` | Upload installer to Dropbox |
| `-QaAssignee` | ❌ | `""` | Jira QA assignee name (triggers RFT + assign) |
| `-JiraTicketId` | ❌ | Auto-extracted | Override Jira ticket ID |
| `-ImpactAreas` | ❌ | Auto from git log | Modules affected (AI-generated) |
| `-TestCases` | ❌ | Placeholder | Test scenarios (AI-generated) |
| `-CustomizationNode` | ❌ | `TBD` | From `CustomizationConstant.cs` |
| `-SkipJiraComment` | ❌ | `$false` | Skip Jira comment posting |
| `-SkipSlackNotify` | ❌ | `$false` | Skip Slack QA notification |
| `-PollIntervalSec` | ❌ | `60` | Jenkins poll interval (seconds) |
| `-TimeoutMinutes` | ❌ | `40` | Max build wait time |
| `-DryRun` | ❌ | `$false` | Show plan without executing |

### Output

The script outputs a JSON result to stdout:

```json
{
  "success": true,
  "branch": "101/UD-32643-user/krishna",
  "jiraTicketId": "UD-32643",
  "buildNumber": 6310,
  "buildResult": "SUCCESS",
  "buildDurationMin": 12.5,
  "artifactPath": "\\\\inwsfs02\\UDInstaller\\WebgilityInstaller-BuildNo_6310.exe",
  "artifactSizeMB": 142.3,
  "qaSharePath": "\\\\192.168.0.95\\Kits\\Unify\\Customization\\WebgilityInstaller-BuildNo_6310.exe",
  "dropboxLink": "https://www.dropbox.com/s/...",
  "slackSent": true,
  "jiraCommentPosted": true,
  "errors": [],
  "warnings": [],
  "stepsCompleted": ["Step 0 - Validate Inputs", "Step 1 - Pre-Flight Check", "..."],
  "stepsFailed": [],
  "stepsSkipped": ["Step 7 - Dropbox Upload"],
  "totalMinutes": 15.2
}
```

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Pipeline completed successfully |
| `1` | Pipeline failed (check `errors` in JSON output) |
| `2` | Input validation error |

## Required Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JENKINS_USERNAME` | ✅ | Jenkins username (e.g. `krishna.bankar`) |
| `JENKINS_API_TOKEN` | ✅ | Jenkins API token |
| `SLACK_BOT_TOKEN` | ❌ | Slack Bot OAuth Token (`xoxb-…`) |
| `JIRA_EMAIL` | ❌ | Jira Cloud email |
| `JIRA_API_TOKEN` | ❌ | Jira REST API token |
| `JIRA_BASE_URL` | ❌ | Jira base URL (e.g. `https://webgility.atlassian.net`) |
| `DROPBOX_ACCESS_TOKEN` | ❌ | Dropbox API token |
| `KIBANA_WD_AUTH` | ❌ | VPN credentials (`user:pass`) for auto-connect |
| `BUILD_DESTINATION_PATH` | ❌ | Override default QA share path |

## Pipeline Steps

```
Step 0: Validate inputs + extract Jira ID from branch
Step 1: Pre-flight — check for running Jenkins builds
Step 2: Pre-build Slack notification
Step 3: Trigger Jenkins build (with origin/ prefix auto-fix)
Step 4: Poll for completion (60s intervals, 40m timeout)  ← THE BIG SAVER
Step 5: Verify artifact on network share (with VPN retry)
Step 6: Copy to QA network share
Step 7: Dropbox upload (optional)
Step 8: QA notifications (Slack + Jira comment)
```

## AI Agent Integration

The AI agent (`wd-jenkins-build`) should:

1. **Parse user request** — extract branch name + slack channel
2. **Generate content** — Impact Areas + Test Cases from session context (the ONE place AI adds value)
3. **Call script once** — `.\Invoke-JenkinsPipeline.ps1 -Branch ... -SlackChannel ... -ImpactAreas ... -TestCases ...`
4. **Parse JSON output** — display summary to user
5. **Handle failures** — if script exits non-zero, show errors to user

The agent NEVER polls Jenkins, NEVER calls Slack/Jira APIs, NEVER does file copies. The script handles all of that.

## File Structure

```
scripts/jenkins-build/
├── Invoke-JenkinsPipeline.ps1   # Main entry point — full pipeline
└── README.md                    # This file
```
