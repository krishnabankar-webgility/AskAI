---
name: wd-jenkins-build
description: "Use when: triggering Jenkins build for unify-enterprise, deploying build to QA share, uploading installer to Dropbox, posting QA Testing Jira comment, sending Slack build notification, checking Jenkins build status, copying WebgilityInstaller to network share."
---

# Skill: Jenkins Build — Unify Enterprise (UD-32299)
<!-- Last updated: 2026-05-19 — all user feedback applied -->

Full pipeline: Check running builds → trigger Jenkins build → poll → verify network share (auto-fix if needed) → copy to QA share → optional Dropbox upload (+ shareable link) → structured QA Testing Jira comment → Slack notification.

This skill is referenced by the agent files at:
- `.github/agents/wd-jenkins-build.agent.md`
- `.cursor/agents/wd-jenkins-build.agent.md`

---

## §0 Pre-flight: Extract Jira Ticket ID from Branch

Branch naming convention: `<number>/<JiraID>-<user>/<name>` or `<JiraID>_<name>`.

```powershell
$branch = "101/UD-29932-user/krishna_2"   # replace with actual input

if ($branch -match "(UD-\d+)") {
    $jiraTicketId = $Matches[1]
    Write-Host "🔍 Jira ticket ID extracted: $jiraTicketId"
} else {
    Write-Warning "Could not extract Jira ID from branch '$branch'. Ask user."
}
```

---

## §0.5 Jira Subtask Transition Helper (TEMPORARY — testing phase only)

> **NOTE:** These transitions are ONLY for initial testing of the agent. Once validated, remove this section entirely.

Use Atlassian MCP `transitionJiraIssue`:
- `cloudId`: `a8ce84dd-8aa2-4dd1-b893-5b33a896f918`
- `transitionId`: `"271"` (In Progress) or `"231"` (Done)

**PowerShell fallback:**
```powershell
function Set-JiraStatus($issueKey, $transitionId) {
    $base64Auth = [Convert]::ToBase64String(
        [Text.Encoding]::ASCII.GetBytes("$($env:JIRA_EMAIL):$($env:JIRA_API_TOKEN)")
    )
    $body = @{ transition = @{ id = $transitionId } } | ConvertTo-Json
    Invoke-RestMethod `
        -Uri "$($env:JIRA_BASE_URL)/rest/api/3/issue/$issueKey/transitions" `
        -Method Post `
        -Headers @{ Authorization = "Basic $base64Auth"; "Content-Type" = "application/json" } `
        -Body $body
    Write-Host "  [$issueKey] → transition $transitionId applied"
}
```

---

## §1.0 Pre-Build Check: Is a Jenkins Build Already Running?

**MUST run before triggering.** If a build is already in progress, WAIT for it to finish.

```powershell
Write-Host "🔄 [Step 1 — Pre-Build Check] IN PROGRESS..."

$jenkinsUrl   = "http://jenkins.webgility.com:8080"
$jenkinsUser  = $env:JENKINS_USERNAME
$jenkinsToken = $env:JENKINS_API_TOKEN

if (-not $jenkinsUser -or -not $jenkinsToken) {
    Write-Error "❌ JENKINS_USERNAME or JENKINS_API_TOKEN not set. Stopping."
    exit 1
}

$base64Auth = [Convert]::ToBase64String(
    [Text.Encoding]::ASCII.GetBytes("${jenkinsUser}:${jenkinsToken}")
)
$headers = @{ Authorization = "Basic $base64Auth" }

# Check if any build is currently running
$jobInfo = Invoke-RestMethod -Uri "$jenkinsUrl/job/UnifyEnterprise/api/json" -Headers $headers
$lastBuild = $jobInfo.lastBuild.number

if ($lastBuild) {
    $buildInfo = Invoke-RestMethod `
        -Uri "$jenkinsUrl/job/UnifyEnterprise/$lastBuild/api/json" -Headers $headers
    
    if ($buildInfo.building -eq $true) {
        Write-Host "⏳ Jenkins build #$lastBuild is already IN PROGRESS. Waiting for it to complete..."
        
        do {
            Start-Sleep -Seconds 30
            $buildInfo = Invoke-RestMethod `
                -Uri "$jenkinsUrl/job/UnifyEnterprise/$lastBuild/api/json" -Headers $headers
            $elapsed = [math]::Round(((Get-Date) - [datetime]::Parse($buildInfo.timestamp)).TotalMinutes, 0)
            Write-Host "  ⏳ Build #$lastBuild still running... ($elapsed min elapsed)"
        } while ($buildInfo.building -eq $true)
        
        Write-Host "  ✅ Build #$lastBuild finished with result: $($buildInfo.result)"
    } else {
        Write-Host "  ✅ No running builds. Last build #$lastBuild was: $($buildInfo.result)"
    }
}

Write-Host "✅ [Step 1 — Pre-Build Check] DONE — Ready to trigger new build"
```

---

## §1a Pre-Build Slack Notification

**MUST run BEFORE triggering the build.** Posts a heads-up to the Slack channel.

```powershell
Write-Host "🔄 [Step 1.5 — Pre-Build Slack Notification] IN PROGRESS..."

$slackToken = $env:SLACK_BOT_TOKEN
if (-not $slackToken) {
    $slackToken = [System.Environment]::GetEnvironmentVariable("SLACK_BOT_TOKEN","User")
}

if ($slackToken -and $slackChannel) {
    $preMsg = "@here creating installer from $branch"
    $preBody = @{ channel = $slackChannel; text = $preMsg } | ConvertTo-Json -Compress
    $preResp = Invoke-RestMethod `
        -Uri "https://slack.com/api/chat.postMessage" -Method Post `
        -Headers @{ Authorization = "Bearer $slackToken"; "Content-Type" = "application/json" } `
        -Body $preBody -TimeoutSec 15
    if ($preResp.ok) {
        Write-Host "  ✅ Pre-build Slack: sent to $slackChannel"
    } else {
        Write-Warning "  ⚠️ Pre-build Slack failed: $($preResp.error)"
    }
} else {
    Write-Warning "  ⚠️ Skipping pre-build Slack (no token or channel)"
}

Write-Host "✅ [Step 1.5 — Pre-Build Slack Notification] DONE"
```

---

## §1 Jenkins Build Trigger

**CRITICAL: Trigger exactly ONCE. Never call buildWithParameters more than once per pipeline run.**

```powershell
Write-Host "🔄 [Step 2 — Trigger Jenkins Build] IN PROGRESS..."

# Record nextBuildNumber BEFORE triggering — this is the build we expect to create
$jobInfo = Invoke-RestMethod `
    -Uri "$jenkinsUrl/job/UnifyEnterprise/api/json?tree=nextBuildNumber" `
    -Headers $headers
$expectedBuildNumber = $jobInfo.nextBuildNumber
Write-Host "  Expected build number: $expectedBuildNumber"

# Trigger build EXACTLY ONCE
$buildUri = "$jenkinsUrl/job/UnifyEnterprise/buildWithParameters"
$body = @{ Branch = $branch; PostSharp = "Yes" }

Invoke-RestMethod -Uri $buildUri -Method Post -Headers $headers -Body $body
Write-Host "  ✅ Build triggered for branch: $branch (expected #$expectedBuildNumber)"

# IMPORTANT: Do NOT call buildWithParameters again. The build is now queued/running.
```

> **If job has no parameter** (reads branch from SCM): use `/build` instead of `/buildWithParameters`
>
> **Anti-pattern (NEVER DO):** Do not trigger → then trigger again. One trigger per pipeline execution.

---

## §2 Build Status Polling

```powershell
Write-Host "🔄 [Step 3 — Poll Build Completion] IN PROGRESS..."

Start-Sleep -Seconds 8

# Use the expectedBuildNumber from §1 (NOT lastBuild — that can pick up a different build)
$buildNumber = $expectedBuildNumber
Write-Host "  Tracking build: #$buildNumber"

# Verify this build actually exists (may still be in queue)
$retries = 0
while ($retries -lt 10) {
    try {
        $null = Invoke-RestMethod -Uri "$jenkinsUrl/job/UnifyEnterprise/$buildNumber/api/json?tree=building" -Headers $headers -TimeoutSec 10
        break
    } catch {
        $retries++
        Write-Host "  ⏳ Build #$buildNumber not started yet (queued). Waiting... ($retries)"
        Start-Sleep -Seconds 10
    }
}

# Poll until complete
$maxMinutes = 90
$pollSec    = 30
$startTime  = Get-Date

do {
    Start-Sleep -Seconds $pollSec
    $buildInfo = Invoke-RestMethod `
        -Uri "$jenkinsUrl/job/UnifyEnterprise/$buildNumber/api/json" -Headers $headers
    $elapsed = (Get-Date) - $startTime
    Write-Host "  ⏳ [$([int]$elapsed.TotalMinutes)m] Build $buildNumber — building=$($buildInfo.building), result=$($buildInfo.result)"

    if ($elapsed.TotalMinutes -gt $maxMinutes) {
        Write-Error "❌ Build $buildNumber timed out after $maxMinutes minutes."
        exit 1
    }
} while ($buildInfo.building -eq $true)

$buildResult = $buildInfo.result
Write-Host "  Build $buildNumber finished: $buildResult"

if ($buildResult -ne "SUCCESS") {
    Write-Error "❌ Build $buildNumber $buildResult — console: $jenkinsUrl/job/UnifyEnterprise/$buildNumber/console"
    exit 1
}

Write-Host "✅ [Step 3 — Poll Build Completion] DONE — Build $buildNumber SUCCESS"
```

> **IMPORTANT:** `$buildNumber` is a plain integer (e.g. `6275`). File names use it directly: `WebgilityInstaller-BuildNo_6275.exe` — NO `#` prefix in file names.

---

## §3 Verify Network Share & Locate Artifact

**If the share is NOT accessible:**
1. First check if VPN (Sophos or OpenVPN GUI) is connected
2. If VPN not connected → connect using credentials from `KIBANA_WD_AUTH` env var (format: `username:password`, split by `:`)
3. If VPN IS connected but share still inaccessible → invoke `sys-troubleshoot` agent

```powershell
Write-Host "🔄 [Step 4 — Verify Network Share & Locate Artifact] IN PROGRESS..."

$sourceShare = "\\inwsfs02\UDInstaller"
$sourcePath  = "$sourceShare\WebgilityInstaller-BuildNo_$buildNumber.exe"

# Step 1: Check if the share is accessible
if (-not (Test-Path $sourceShare)) {
    Write-Warning "⚠️ Network share NOT accessible: $sourceShare"
    Write-Host "  → Checking VPN connectivity..."

    # Check if Sophos or OpenVPN is connected
    $vpnAdapters = Get-NetAdapter | Where-Object { $_.InterfaceDescription -match "TAP|Sophos|OpenVPN|tun" -and $_.Status -eq "Up" }
    
    if (-not $vpnAdapters) {
        Write-Host "  ❌ No VPN adapter connected. Attempting to connect..."
        Write-Host "  → Reading credentials from KIBANA_WD_AUTH env var..."
        
        $kibanaAuth = $env:KIBANA_WD_AUTH
        if (-not $kibanaAuth) {
            $kibanaAuth = [System.Environment]::GetEnvironmentVariable("KIBANA_WD_AUTH", "User")
        }
        
        if ($kibanaAuth -and $kibanaAuth -match ":") {
            $vpnUser = $kibanaAuth.Split(":")[0]
            $vpnPass = $kibanaAuth.Split(":",2)[1]
            Write-Host "  → VPN credentials found for user: $vpnUser"
            Write-Host "  → Attempting Sophos/OpenVPN connection..."
            
            # Try Sophos SSL VPN first
            $sophosPath = "C:\Program Files (x86)\Sophos\Sophos SSL VPN Client\openvpn-gui.exe"
            $openVpnPath = "C:\Program Files\OpenVPN\bin\openvpn-gui.exe"
            
            if (Test-Path $sophosPath) {
                Write-Host "  → Found Sophos VPN client. Please connect manually or:"
                Write-Host "    Start-Process '$sophosPath' -ArgumentList '--connect'"
            } elseif (Test-Path $openVpnPath) {
                Write-Host "  → Found OpenVPN GUI. Please connect manually or:"
                Write-Host "    Start-Process '$openVpnPath' -ArgumentList '--connect'"
            }
            
            # Wait for VPN to connect (user may need to interact)
            Write-Host "  ⏳ Waiting 15s for VPN to establish..."
            Start-Sleep -Seconds 15
            
            # Retry share access
            if (-not (Test-Path $sourceShare)) {
                Write-Error "❌ Share still not accessible after VPN check."
                Write-Host "  → Invoking sys-troubleshoot agent for deeper diagnosis..."
                # AGENT: invoke sys-troubleshoot agent here
                exit 1
            }
        } else {
            Write-Error "❌ KIBANA_WD_AUTH not set or invalid format. Cannot get VPN credentials."
            Write-Host "  → Format expected: username:password"
            exit 1
        }
    } else {
        Write-Host "  ✅ VPN adapter is UP: $($vpnAdapters[0].Name)"
        Write-Host "  → VPN connected but share still inaccessible."
        Write-Host "  → Invoking sys-troubleshoot agent..."
        # AGENT: invoke sys-troubleshoot agent — VPN is connected but SMB route may be missing
        Write-Host "  → Try: Test-NetConnection -ComputerName inwsfs02 -Port 445"
        Write-Host "  → Try: net use $sourceShare"
        exit 1
    }
}

Write-Host "  ✅ Share accessible: $sourceShare"

# Step 2: Verify the specific build file exists and is COMPLETE (not being written)
if (-not (Test-Path $sourcePath)) {
    Write-Error "❌ Artifact not found: $sourcePath"
    Write-Host "  Build $buildNumber may still be publishing. Waiting 30s and retrying..."
    Start-Sleep -Seconds 30
    if (-not (Test-Path $sourcePath)) {
        Write-Error "❌ Still not found after retry. Verify build number is correct."
        exit 1
    }
}

# Step 3: Confirm file is complete (not locked / not being written)
$fileInfo = Get-Item $sourcePath
Start-Sleep -Seconds 5
$fileInfo2 = Get-Item $sourcePath
if ($fileInfo.Length -ne $fileInfo2.Length) {
    Write-Host "  ⏳ File still being written. Waiting 60s..."
    Start-Sleep -Seconds 60
    $fileInfo = Get-Item $sourcePath
}

if ($fileInfo.Length -eq 0) {
    Write-Error "❌ File is 0 bytes — build may have failed to produce artifact"
    exit 1
}

Write-Host "  ✅ Artifact verified: $sourcePath ($([math]::Round($fileInfo.Length/1MB,1)) MB, $($fileInfo.LastWriteTime))"
Write-Host "✅ [Step 4 — Verify Network Share & Locate Artifact] DONE"
```

---

## §4 Copy Installer to QA Network Share

```powershell
Write-Host "🔄 [Step 5 — Copy to QA Network Share] IN PROGRESS..."

$destinationDir = $env:BUILD_DESTINATION_PATH
if (-not $destinationDir) { $destinationDir = "\\192.168.0.95\Kits\Unify\Customization" }
$destinationFile = Join-Path $destinationDir "WebgilityInstaller-BuildNo_$buildNumber.exe"

if (-not (Test-Path $destinationDir)) {
    Write-Error "❌ Destination unreachable: $destinationDir"
    Write-Host "  → Check VPN connectivity to 192.168.0.95"
    Write-Host "  → Invoking sys-troubleshoot agent..."
    exit 1
}

Copy-Item -Path $sourcePath -Destination $destinationFile -Force

if (-not (Test-Path $destinationFile)) {
    Write-Error "❌ Copy failed — file not at destination after operation"
    exit 1
}

Write-Host "  ✅ Copied: $destinationFile ($([math]::Round((Get-Item $destinationFile).Length/1MB,1)) MB)"
Write-Host "✅ [Step 5 — Copy to QA Network Share] DONE"
```

---

## §5 Upload to Dropbox + Get Shareable Link (OPTIONAL)

**Only execute when user explicitly requests `upload_to_dropbox = true`.**

### Dropbox target folder
Upload into Krishna's customization folder:
```
https://www.dropbox.com/home/Customization%20Release/Krishna_Dev
```

The Dropbox API upload path:
```
/Customization Release/Krishna_Dev/WebgilityInstaller-BuildNo_<buildNumber>.exe
```

### Dropbox permissions (verified)
- `files.content.write` — upload files
- `sharing.read` — create/list shared links

### Dropbox team namespace (CRITICAL)
The "Customization Release" folder lives in the **team root namespace** (`2557421763`), NOT the user's home namespace. Every API call MUST include the header:
```
Dropbox-API-Path-Root: {".tag":"root","root":"2557421763"}
```

### 5.1 — Upload

```powershell
Write-Host "🔄 [Step 6 — Dropbox Upload] IN PROGRESS..."

$dropboxToken = $env:DROPBOX_ACCESS_TOKEN
if (-not $dropboxToken) {
    Write-Error "❌ DROPBOX_ACCESS_TOKEN not set. Skipping Dropbox upload."
    Write-Host "⏭️ [Step 6 — Dropbox Upload] SKIPPED — no token"
    $dropboxLink = $null
} else {
    $remotePath = "/Customization Release/Krishna_Dev/WebgilityInstaller-BuildNo_$buildNumber.exe"
    $fileBytes  = [System.IO.File]::ReadAllBytes($sourcePath)
    $teamRootNS = "2557421763"  # Team root namespace for shared folders

    $dropboxApiArg = '{"path":"' + $remotePath + '","mode":{".tag":"overwrite"},"autorename":false}'
    $uploadHeaders = @{
        Authorization          = "Bearer $dropboxToken"
        "Dropbox-API-Arg"      = $dropboxApiArg
        "Content-Type"         = "application/octet-stream"
        "Dropbox-API-Path-Root" = "{`".tag`":`"root`",`"root`":`"$teamRootNS`"}"
    }

    $uploadResult = Invoke-RestMethod `
        -Uri "https://content.dropboxapi.com/2/files/upload" `
        -Method Post `
        -Headers $uploadHeaders `
        -Body $fileBytes

    Write-Host "  ✅ Uploaded: $($uploadResult.path_display)"

    # Get shareable link
    $shareHeaders = @{
        Authorization           = "Bearer $dropboxToken"
        "Content-Type"          = "application/json"
        "Dropbox-API-Path-Root" = "{`".tag`":`"root`",`"root`":`"$teamRootNS`"}"
    }
    $shareBody = '{"path":"' + $remotePath + '","settings":{"requested_visibility":{".tag":"public"}}}'

    try {
        $shareResult = Invoke-RestMethod `
            -Uri "https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings" `
            -Method Post -Headers $shareHeaders -Body $shareBody
        $dropboxLink = $shareResult.url -replace "dl=0","dl=1"
    } catch {
        # Link may already exist
        $listBody = @{ path = $remotePath } | ConvertTo-Json
        $existing = Invoke-RestMethod `
            -Uri "https://api.dropboxapi.com/2/sharing/list_shared_links" `
            -Method Post -Headers $shareHeaders -Body $listBody
        $dropboxLink = ($existing.links | Select-Object -First 1).url -replace "dl=0","dl=1"
    }

    Write-Host "  ✅ Shareable link: $dropboxLink"
    Write-Host "✅ [Step 6 — Dropbox Upload] DONE"
}
```

---

## §6 Notifications — QA Testing Jira Comment + Slack

### 6.1 — Structured QA Testing Jira Comment

The Jira comment MUST be a **structured QA Testing note** with these sections:

```markdown
✅ Jenkins Build Ready for QA Testing

**Branch:** <branch>
**Build No:** <buildNumber>
**Customization Node:** <PREFIX_ProfileID from CustomizationConstant.cs — if determinable from PR/context>

**Installer Locations:**
- Network Share: \\192.168.0.95\Kits\Unify\Customization\WebgilityInstaller-BuildNo_<buildNumber>.exe
- Alternate: \\inwsfs02\UDInstaller\WebgilityInstaller-BuildNo_<buildNumber>.exe
- Dropbox: <dropboxLink or "N/A — not uploaded">

**Impact Areas (from PR commits):**
- <Module/functionality 1>
- <Module/functionality 2>
- ...

**Test Cases:**
1. <Test case from customer requirement / session context>
2. <Test case for regression>
3. ...

**PR/Commit Reference:**
- <commit messages or PR link if available>
```

**How to populate Impact Areas and Test Cases:**
1. If a PR link or commit history is available → read commit messages, identify changed modules
2. From session chat history → extract customer requirements and what was fixed
3. Cross-reference with existing workflow to identify regression areas
4. For format reference: check Confluence public → template → QA Testing doc via `confluence-automation` agent

**Use Atlassian MCP `addCommentToJiraIssue`** or PowerShell fallback:

```powershell
Write-Host "🔄 [Step 7 — QA Testing Jira Comment + Slack] IN PROGRESS..."

$base64Auth = [Convert]::ToBase64String(
    [Text.Encoding]::ASCII.GetBytes("$($env:JIRA_EMAIL):$($env:JIRA_API_TOKEN)")
)
$jiraLink = "$($env:JIRA_BASE_URL)/browse/$jiraTicketId"

# Build the QA comment (populate impact areas and test cases from PR/session context)
$qaComment = @"
✅ Jenkins Build Ready for QA Testing

*Branch:* $branch
*Build No:* $buildNumber
*Customization Node:* <determine from context or mark TBD>

*Installer Locations:*
- Network Share: \\192.168.0.95\Kits\Unify\Customization\WebgilityInstaller-BuildNo_$buildNumber.exe
- Alternate: \\inwsfs02\UDInstaller\WebgilityInstaller-BuildNo_$buildNumber.exe
$(if ($dropboxLink) { "- Dropbox: $dropboxLink" } else { "- Dropbox: N/A" })

*Impact Areas:*
<populated from PR commits and code changes>

*Test Cases:*
<populated from customer requirements and session context>
"@

$body = @{
    body = @{
        type    = "doc"
        version = 1
        content = @(@{ type = "paragraph"; content = @(@{ type = "text"; text = $qaComment }) })
    }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
    -Uri "$($env:JIRA_BASE_URL)/rest/api/3/issue/$jiraTicketId/comment" `
    -Method Post `
    -Headers @{ Authorization = "Basic $base64Auth"; "Content-Type" = "application/json" } `
    -Body $body

Write-Host "  ✅ QA Testing Jira comment posted on $jiraTicketId"
```

### 6.2 — Slack Notification via Bot Token API

**Slack channel is provided by the user at runtime** — never hardcoded.

```powershell
$slackToken   = $env:SLACK_BOT_TOKEN
$slackChannel = "<USER_PROVIDED_CHANNEL>"   # e.g. "#my-daily-update" — from user input

if (-not $slackToken) {
    Write-Error "❌ SLACK_BOT_TOKEN not set. Printing message for manual post:"
    # Print message for manual copy-paste
} else {
    $slackText = @"
@QA
Please find the latest installer Build No $buildNumber from Branch: $branch
\\192.168.0.95\Kits\Unify\Customization\WebgilityInstaller-BuildNo_$buildNumber.exe
or \\inwsfs02\UDInstaller\WebgilityInstaller-BuildNo_$buildNumber.exe
$(if ($dropboxLink) { "Dropbox: $dropboxLink" })
It's includes :
$jiraLink
"@

    $slackBody = @{
        channel = $slackChannel
        text    = $slackText
    } | ConvertTo-Json -Compress

    $response = Invoke-RestMethod `
        -Uri "https://slack.com/api/chat.postMessage" `
        -Method Post `
        -Headers @{ Authorization = "Bearer $slackToken" } `
        -ContentType "application/json; charset=utf-8" `
        -Body $slackBody

    if ($response.ok) {
        Write-Host "  ✅ Slack message sent to $slackChannel"
    } else {
        Write-Error "  ❌ Slack error: $($response.error)"
    }
}

Write-Host "✅ [Step 7 — QA Testing Jira Comment + Slack] DONE"
```

---

## §7 Environment Variables — Complete Reference

| Variable | Status | Description |
|---|---|---|
| `JENKINS_USERNAME` | ✅ Set | `krishna.bankar` |
| `JENKINS_API_TOKEN` | ✅ Set | Jenkins API token |
| `DROPBOX_ACCESS_TOKEN` | ✅ Set | Dropbox API token |
| `SLACK_BOT_TOKEN` | ✅ Set | Slack Bot OAuth Token (`xoxb-…`) |
| `SLACK_TEAM_ID` | ✅ Set | `T7XA2G1MW` (Webgility workspace) |
| `JIRA_API_TOKEN` | ✅ Set | Jira REST API token |
| `JIRA_BASE_URL` | ✅ Set | `https://webgility.atlassian.net` |
| `JIRA_EMAIL` | ✅ Set | `krishna.bankar@webgility.com` |
| `KIBANA_WD_AUTH` | ✅ Set | VPN credentials (`user:pass`) — used for Sophos/OpenVPN login |
| `BUILD_DESTINATION_PATH` | Optional | Default: `\\192.168.0.95\Kits\Unify\Customization` |

---

## §8 Quick Reference

| Item | Value |
|---|---|
| Jenkins job URL | `http://jenkins.webgility.com:8080/job/UnifyEnterprise/` |
| Source installer path | `\\inwsfs02\UDInstaller\WebgilityInstaller-BuildNo_<N>.exe` |
| Default QA destination | `\\192.168.0.95\Kits\Unify\Customization\` |
| Dropbox folder | [Customization Release/Krishna_Dev](https://www.dropbox.com/home/Customization%20Release/Krishna_Dev) |
| Dropbox API upload path | `/Customization Release/Krishna_Dev/` |
| Dropbox team root NS | `2557421763` — MUST include `Dropbox-API-Path-Root` header on every call |
| Dropbox scopes | `files.content.write`, `sharing.read` |
| Jira project | `https://webgility.atlassian.net/browse/UD` |
| Jira Cloud ID | `a8ce84dd-8aa2-4dd1-b893-5b33a896f918` |
| Jira In Progress transition | `271` |
| Jira Done transition | `231` |
| Slack method | `chat.postMessage` via `SLACK_BOT_TOKEN` — channel from user input |
| Slack bot name | `demo_app` (ID: `U0APDD2PYRX`) — must be invited to target channel |
| Installer naming | `WebgilityInstaller-BuildNo_<N>.exe` (N = plain integer, NO # prefix) |

---

## §9 Related Agents / Delegation

| Agent | File | When to invoke |
|---|---|---|
| `sys-troubleshoot` | `.github/agents/sys-troubleshoot.agent.md` | `\\inwsfs02\UDInstaller` or `\\192.168.0.95` not accessible |
| `jira-automation` | `.github/agents/jira-automation.agent.md` | QA Testing comment template, Jira field formatting |
| `confluence-automation` | `.github/agents/confluence-automation.agent.md` | Look up QA Testing comment template from Confluence workspace |

---

## §10 Subtask → Pipeline Map (TEMPORARY — testing only)

| Jira Key | Summary | Skill Section | Transition |
|---|---|---|---|
| UD-32300 | Run Jenkins job + poll | §1.0, §1, §2 | To Do → In Progress → Done |
| UD-32302 | Locate installer artifact | §3 | To Do → In Progress → Done |
| UD-32305 | Copy to network share | §4 | To Do → In Progress → Done |
| UD-32304 | Upload to Dropbox + get link | §5 | To Do → In Progress → Done |
| UD-32303 | Jira comment + Slack notify | §6 | To Do → In Progress → Done |
