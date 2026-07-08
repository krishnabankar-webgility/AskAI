---
name: wd-jenkins-build
description: "Use when: triggering Jenkins build for unify-enterprise, deploying build to QA share, uploading installer to Dropbox, posting QA Testing Jira comment, sending Slack build notification, checking Jenkins build status, copying WebgilityInstaller to network share, changing Jira assignee/status to RFT."
---
# Skill: Jenkins Build ΓÇö Unify Enterprise (UD-32299)
<!-- Last updated: 2026-07-08 — Added: Invoke-JenkinsJson helper (-AsHashtable), -QaSlackChannel param, Jira RFT+Assign (Step 7.5), full Jira URL in QA Slack, temp script cleanup rule -->

Full pipeline: Check running builds ΓåÆ Pre-build Slack (`@here creating installer from <branch>`) ΓåÆ trigger Jenkins build ΓåÆ poll ΓåÆ verify network share (auto-fix if needed) ΓåÆ copy to QA share ΓåÆ optional Dropbox upload (+ shareable link) ΓåÆ Change Jira assignee + transition to RFT ΓåÆ Slack notification ΓåÆ Jira comment (LAST).

This skill is referenced by the agent files at:
- `.github/agents/wd-jenkins-build.agent.md`
- `.cursor/agents/wd-jenkins-build.agent.md`

---

## ⚡ Preferred: Autonomous Script (97% Token Reduction)

**Use the autonomous PowerShell script instead of manual step-by-step AI orchestration.**

The script at **`scripts/jenkins-build/Invoke-JenkinsPipeline.ps1`** runs the ENTIRE pipeline in one call — all polling, retries, VPN checks, Slack, Jira, and Dropbox happen in PowerShell with zero AI token consumption.

```powershell
# AI agent calls this ONCE — that's it. Parse the JSON output and display to user.
.\scripts\jenkins-build\Invoke-JenkinsPipeline.ps1 `
    -Branch "101/UD-32643-user/krishna" `
    -SlackChannel "func-wd-installer-creation-updates" `
    -QaSlackChannel "func-wd-build-updates" `
    -QaAssignee "Lokesh Gandhi" `
    -ImpactAreas "<AI-generated from session context>" `
    -TestCases "<AI-generated from session context>"
```

**AI agent responsibilities (2 turns max):**
1. Parse user request → extract branch + channel(s), QA assignee, destination path
2. Generate Impact Areas from session context (NO test cases for non-customization builds) → call script → display result

**Script handles everything else:** pre-flight, pre-build Slack, trigger, poll, verify, copy, Dropbox, Jira RFT + Assign, QA Slack (with full Jira URL), Jira comment.

> **TEMP SCRIPTS RULE:** Never create one-off `.ps1` scripts in `unify-enterprise/local/ephemeral/` for the pipeline. Always use `Invoke-JenkinsPipeline.ps1` with the right parameters. Any temp scripts left in `local/ephemeral/` after a pipeline run should be deleted.

See `scripts/jenkins-build/README.md` for full parameter reference and output schema.

> The manual step-by-step sections below are **reference documentation** — kept for understanding the pipeline internals and for debugging if the script fails.

## ┬º0 Pre-flight: Extract Jira Ticket ID from Branch

Branch naming convention: `<number>/<JiraID>-<user>/<name>` or `<JiraID>_<name>`.

```powershell
$branch = "101/UD-29932-user/krishna_2"   # replace with actual input

if ($branch -match "(UD-\d+)") {
    $jiraTicketId = $Matches[1]
    Write-Host "≡ƒöì Jira ticket ID extracted: $jiraTicketId"
} else {
    Write-Warning "Could not extract Jira ID from branch '$branch'. Ask user."
}
```

---

## ┬º0.5 Jira Subtask Transition Helper (TEMPORARY ΓÇö testing phase only)

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
    Write-Host "  [$issueKey] ΓåÆ transition $transitionId applied"
}
```

---

## ┬º1.0 Pre-Build Check: Is a Jenkins Build Already Running?

**MUST run before triggering.** If a build is already in progress, WAIT for it to finish.

```powershell
Write-Host "≡ƒöä [Step 1 ΓÇö Pre-Build Check] IN PROGRESS..."

$jenkinsUrl   = "http://jenkins.webgility.com:8080"
$jenkinsUser  = $env:JENKINS_USERNAME
$jenkinsToken = $env:JENKINS_API_TOKEN

if (-not $jenkinsUser -or -not $jenkinsToken) {
    Write-Error "Γ¥î JENKINS_USERNAME or JENKINS_API_TOKEN not set. Stopping."
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
        Write-Host "ΓÅ│ Jenkins build #$lastBuild is already IN PROGRESS. Waiting for it to complete..."
        
        do {
            Start-Sleep -Seconds 30
            $buildInfo = Invoke-RestMethod `
                -Uri "$jenkinsUrl/job/UnifyEnterprise/$lastBuild/api/json" -Headers $headers
            $elapsed = [math]::Round(((Get-Date) - [datetime]::Parse($buildInfo.timestamp)).TotalMinutes, 0)
            Write-Host "  ΓÅ│ Build #$lastBuild still running... ($elapsed min elapsed)"
        } while ($buildInfo.building -eq $true)
        
        Write-Host "  Γ£à Build #$lastBuild finished with result: $($buildInfo.result)"
    } else {
        Write-Host "  Γ£à No running builds. Last build #$lastBuild was: $($buildInfo.result)"
    }
}

Write-Host "Γ£à [Step 1 ΓÇö Pre-Build Check] DONE ΓÇö Ready to trigger new build"
```

---

## ┬º1a (MANDATORY BLOCKING STEP) Pre-Build Slack Notification

**ΓÜá∩╕Å THIS STEP MUST EXECUTE BEFORE ┬º2 (TRIGGER) ΓÇö NON-SKIPPABLE**

Posts a heads-up to the Slack channel. This is NOT optional ΓÇö it must complete before Jenkins is triggered.

### ENFORCEMENT RULES
- MUST send notification before triggering build
- MUST confirm Slack message posted successfully
- NEVER skip this step
- NEVER proceed to trigger until message sent

### STOP CONDITIONS
- If Slack token not configured ΓåÆ Log warning but proceed (optional fallback)
- If network error ΓåÆ Retry 2 times, then continue
- Other errors ΓåÆ Log and continue (try to send but don't block pipeline)

## ┬º1a Pre-Build Slack Notification (Updated)

**MUST run BEFORE triggering the build.** Posts a heads-up to the Slack channel.

```powershell
Write-Host "≡ƒöä [Step 1.5 ΓÇö Pre-Build Slack Notification] IN PROGRESS..."

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
        Write-Host "  Γ£à Pre-build Slack: sent to $slackChannel"
    } else {
        Write-Warning "  ΓÜá∩╕Å Pre-build Slack failed: $($preResp.error)"
    }
} else {
    Write-Warning "  ΓÜá∩╕Å Skipping pre-build Slack (no token or channel)"
}

Write-Host "Γ£à [Step 1.5 ΓÇö Pre-Build Slack Notification] DONE"
```

---

## ┬º1 Jenkins Build Trigger

**CRITICAL: Trigger exactly ONCE. Never call buildWithParameters more than once per pipeline run.**

```powershell
Write-Host "≡ƒöä [Step 2 ΓÇö Trigger Jenkins Build] IN PROGRESS..."

# Record nextBuildNumber BEFORE triggering ΓÇö this is the build we expect to create
$jobInfo = Invoke-RestMethod `
    -Uri "$jenkinsUrl/job/UnifyEnterprise/api/json?tree=nextBuildNumber" `
    -Headers $headers
$expectedBuildNumber = $jobInfo.nextBuildNumber
Write-Host "  Expected build number: $expectedBuildNumber"

# Trigger build EXACTLY ONCE
# STEP A: Push branch to remote BEFORE triggering (CRITICAL — build fails if branch missing on remote)
$remoteRef = git ls-remote --heads origin $branch 2>&1
if (-not $remoteRef) {
    Write-Host "  Branch not on remote - pushing..."
    git push -u origin $branch
    if ($LASTEXITCODE -ne 0) { Write-Error "Push failed. Cannot trigger build."; exit 1 }
}
Write-Host "  Branch confirmed on remote: $branch"

# STEP B: Trigger EXACTLY ONCE
# CRITICAL: param="Branch" (capital B, Git Parameter plugin), value=origin/BranchName URL-encoded
$buildUri = "$jenkinsUrl/job/UnifyEnterprise/buildWithParameters"
$encodedBranch = [uri]::EscapeDataString("origin/$branch")
$body = "Branch=$encodedBranch&PostSharp=Yes"
Invoke-RestMethod -Uri $buildUri -Method Post -Headers $headers `
    -Body $body -ContentType "application/x-www-form-urlencoded"

Invoke-RestMethod -Uri $buildUri -Method Post -Headers $headers -Body $body
Write-Host "  Γ£à Build triggered for branch: $branch (expected #$expectedBuildNumber)"

# IMPORTANT: Do NOT call buildWithParameters again. The build is now queued/running.
```

> **If job has no parameter** (reads branch from SCM): use `/build` instead of `/buildWithParameters`
>
> **Anti-pattern (NEVER DO):** Do not trigger ΓåÆ then trigger again. One trigger per pipeline execution.

---

## ┬º2 Build Status Polling

```powershell
Write-Host "≡ƒöä [Step 3 ΓÇö Poll Build Completion] IN PROGRESS..."

Start-Sleep -Seconds 8

# Use the expectedBuildNumber from ┬º1 (NOT lastBuild ΓÇö that can pick up a different build)
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
        Write-Host "  ΓÅ│ Build #$buildNumber not started yet (queued). Waiting... ($retries)"
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
    Write-Host "  ΓÅ│ [$([int]$elapsed.TotalMinutes)m] Build $buildNumber ΓÇö building=$($buildInfo.building), result=$($buildInfo.result)"

    if ($elapsed.TotalMinutes -gt $maxMinutes) {
        Write-Error "Γ¥î Build $buildNumber timed out after $maxMinutes minutes."
        exit 1
    }
} while ($buildInfo.building -eq $true)

$buildResult = $buildInfo.result
Write-Host "  Build $buildNumber finished: $buildResult"

if ($buildResult -ne "SUCCESS") {
    Write-Error "Γ¥î Build $buildNumber $buildResult ΓÇö console: $jenkinsUrl/job/UnifyEnterprise/$buildNumber/console"
    exit 1
}

Write-Host "Γ£à [Step 3 ΓÇö Poll Build Completion] DONE ΓÇö Build $buildNumber SUCCESS"
```

> **IMPORTANT:** `$buildNumber` is a plain integer (e.g. `6275`). File names use it directly: `WebgilityInstaller-BuildNo_6275.exe` ΓÇö NO `#` prefix in file names.

---

## ┬º3 Verify Network Share & Locate Artifact

**If the share is NOT accessible:**
1. First check if VPN (Sophos or OpenVPN GUI) is connected
2. If VPN not connected ΓåÆ connect using credentials from `KIBANA_WD_AUTH` env var (format: `username:password`, split by `:`)
3. If VPN IS connected but share still inaccessible ΓåÆ invoke `sys-troubleshoot` agent

```powershell
Write-Host "≡ƒöä [Step 4 ΓÇö Verify Network Share & Locate Artifact] IN PROGRESS..."

$sourceShare = "\\inwsfs02\UDInstaller"
$sourcePath  = "$sourceShare\WebgilityInstaller-BuildNo_$buildNumber.exe"

# Step 1: Check if the share is accessible
if (-not (Test-Path $sourceShare)) {
    Write-Warning "ΓÜá∩╕Å Network share NOT accessible: $sourceShare"
    Write-Host "  ΓåÆ Checking VPN connectivity..."

    # Check if Sophos or OpenVPN is connected
    $vpnAdapters = Get-NetAdapter | Where-Object { $_.InterfaceDescription -match "TAP|Sophos|OpenVPN|tun" -and $_.Status -eq "Up" }
    
    if (-not $vpnAdapters) {
        Write-Host "  Γ¥î No VPN adapter connected. Attempting to connect..."
        Write-Host "  ΓåÆ Reading credentials from KIBANA_WD_AUTH env var..."
        
        $kibanaAuth = $env:KIBANA_WD_AUTH
        if (-not $kibanaAuth) {
            $kibanaAuth = [System.Environment]::GetEnvironmentVariable("KIBANA_WD_AUTH", "User")
        }
        
        if ($kibanaAuth -and $kibanaAuth -match ":") {
            $vpnUser = $kibanaAuth.Split(":")[0]
            $vpnPass = $kibanaAuth.Split(":",2)[1]
            Write-Host "  ΓåÆ VPN credentials found for user: $vpnUser"
            Write-Host "  ΓåÆ Attempting Sophos/OpenVPN connection..."
            
            # Try Sophos SSL VPN first
            $sophosPath = "C:\Program Files (x86)\Sophos\Sophos SSL VPN Client\openvpn-gui.exe"
            $openVpnPath = "C:\Program Files\OpenVPN\bin\openvpn-gui.exe"
            
            if (Test-Path $sophosPath) {
                Write-Host "  ΓåÆ Found Sophos VPN client. Please connect manually or:"
                Write-Host "    Start-Process '$sophosPath' -ArgumentList '--connect'"
            } elseif (Test-Path $openVpnPath) {
                Write-Host "  ΓåÆ Found OpenVPN GUI. Please connect manually or:"
                Write-Host "    Start-Process '$openVpnPath' -ArgumentList '--connect'"
            }
            
            # Wait for VPN to connect (user may need to interact)
            Write-Host "  ΓÅ│ Waiting 15s for VPN to establish..."
            Start-Sleep -Seconds 15
            
            # Retry share access
            if (-not (Test-Path $sourceShare)) {
                Write-Error "Γ¥î Share still not accessible after VPN check."
                Write-Host "  ΓåÆ Invoking sys-troubleshoot agent for deeper diagnosis..."
                # AGENT: invoke sys-troubleshoot agent here
                exit 1
            }
        } else {
            Write-Error "Γ¥î KIBANA_WD_AUTH not set or invalid format. Cannot get VPN credentials."
            Write-Host "  ΓåÆ Format expected: username:password"
            exit 1
        }
    } else {
        Write-Host "  Γ£à VPN adapter is UP: $($vpnAdapters[0].Name)"
        Write-Host "  ΓåÆ VPN connected but share still inaccessible."
        Write-Host "  ΓåÆ Invoking sys-troubleshoot agent..."
        # AGENT: invoke sys-troubleshoot agent ΓÇö VPN is connected but SMB route may be missing
        Write-Host "  ΓåÆ Try: Test-NetConnection -ComputerName inwsfs02 -Port 445"
        Write-Host "  ΓåÆ Try: net use $sourceShare"
        exit 1
    }
}

Write-Host "  Γ£à Share accessible: $sourceShare"

# Step 2: Verify the specific build file exists and is COMPLETE (not being written)
if (-not (Test-Path $sourcePath)) {
    Write-Error "Γ¥î Artifact not found: $sourcePath"
    Write-Host "  Build $buildNumber may still be publishing. Waiting 30s and retrying..."
    Start-Sleep -Seconds 30
    if (-not (Test-Path $sourcePath)) {
        Write-Error "Γ¥î Still not found after retry. Verify build number is correct."
        exit 1
    }
}

# Step 3: Confirm file is complete (not locked / not being written)
$fileInfo = Get-Item $sourcePath
Start-Sleep -Seconds 5
$fileInfo2 = Get-Item $sourcePath
if ($fileInfo.Length -ne $fileInfo2.Length) {
    Write-Host "  ΓÅ│ File still being written. Waiting 60s..."
    Start-Sleep -Seconds 60
    $fileInfo = Get-Item $sourcePath
}

if ($fileInfo.Length -eq 0) {
    Write-Error "Γ¥î File is 0 bytes ΓÇö build may have failed to produce artifact"
    exit 1
}

Write-Host "  Γ£à Artifact verified: $sourcePath ($([math]::Round($fileInfo.Length/1MB,1)) MB, $($fileInfo.LastWriteTime))"
Write-Host "Γ£à [Step 4 ΓÇö Verify Network Share & Locate Artifact] DONE"
```

---

## ┬º4 Copy Installer to QA Network Share

```powershell
Write-Host "≡ƒöä [Step 5 ΓÇö Copy to QA Network Share] IN PROGRESS..."

$destinationDir = $env:BUILD_DESTINATION_PATH
if (-not $destinationDir) { $destinationDir = "\\192.168.0.95\Kits\Unify\Customization" }
$destinationFile = Join-Path $destinationDir "WebgilityInstaller-BuildNo_$buildNumber.exe"

if (-not (Test-Path $destinationDir)) {
    Write-Error "Γ¥î Destination unreachable: $destinationDir"
    Write-Host "  ΓåÆ Check VPN connectivity to 192.168.0.95"
    Write-Host "  ΓåÆ Invoking sys-troubleshoot agent..."
    exit 1
}

Copy-Item -Path $sourcePath -Destination $destinationFile -Force

if (-not (Test-Path $destinationFile)) {
    Write-Error "Γ¥î Copy failed ΓÇö file not at destination after operation"
    exit 1
}

Write-Host "  Γ£à Copied: $destinationFile ($([math]::Round((Get-Item $destinationFile).Length/1MB,1)) MB)"
Write-Host "Γ£à [Step 5 ΓÇö Copy to QA Network Share] DONE"
```

---

## ┬º5 Upload to Dropbox + Get Shareable Link (OPTIONAL)

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
- `files.content.write` ΓÇö upload files
- `sharing.read` ΓÇö create/list shared links

### Dropbox team namespace (CRITICAL)
The "Customization Release" folder lives in the **team root namespace** (`2557421763`), NOT the user's home namespace. Every API call MUST include the header:
```
Dropbox-API-Path-Root: {".tag":"root","root":"2557421763"}
```

### Dropbox Authentication ΓÇö Refresh Token (IMPORTANT)
Access tokens expire every 4 hours. **NEVER use a static access token.** Always generate a fresh token at runtime using the refresh token flow.

**System Environment User Variables (set via `[System.Environment]::SetEnvironmentVariable`):**
| Variable | Purpose |
|---|---|
| `DROPBOX_REFRESH_TOKEN` | Long-lived refresh token (never expires) |
| `DROPBOX_APP_KEY` | OAuth2 app client ID |
| `DROPBOX_APP_SECRET` | OAuth2 app client secret |

```powershell
# Get fresh access token from refresh token (do this EVERY time before Dropbox API calls)
$refreshToken = [System.Environment]::GetEnvironmentVariable("DROPBOX_REFRESH_TOKEN","User")
$appKey       = [System.Environment]::GetEnvironmentVariable("DROPBOX_APP_KEY","User")
$appSecret    = [System.Environment]::GetEnvironmentVariable("DROPBOX_APP_SECRET","User")

$tokenResp = Invoke-RestMethod -Uri "https://api.dropboxapi.com/oauth2/token" -Method Post -Body @{
    grant_type    = "refresh_token"
    refresh_token = $refreshToken
    client_id     = $appKey
    client_secret = $appSecret
}
$dropboxToken = $tokenResp.access_token
# Token is valid for ~4 hours but generate fresh each pipeline run
```

### 5.1 ΓÇö Upload (Chunked via curl.exe ΓÇö Required for large files over VPN)

**WHY chunked upload:** Single-request uploads fail for files >10MB over corporate VPN (connection forcibly closed). Use Dropbox upload sessions with 2-4MB chunks via `curl.exe --http1.1` for reliability.

```powershell
Write-Host "≡ƒöä [Step 6 ΓÇö Dropbox Upload] IN PROGRESS..."

# Step 0: Get fresh access token
$refreshToken = [System.Environment]::GetEnvironmentVariable("DROPBOX_REFRESH_TOKEN","User")
$appKey       = [System.Environment]::GetEnvironmentVariable("DROPBOX_APP_KEY","User")
$appSecret    = [System.Environment]::GetEnvironmentVariable("DROPBOX_APP_SECRET","User")

if (-not $refreshToken -or -not $appKey -or -not $appSecret) {
    Write-Error "Γ¥î Dropbox env vars not set (DROPBOX_REFRESH_TOKEN, DROPBOX_APP_KEY, DROPBOX_APP_SECRET). Skipping."
    Write-Host "ΓÅ¡∩╕Å [Step 6 ΓÇö Dropbox Upload] SKIPPED ΓÇö no credentials"
    $dropboxLink = $null
} else {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $tokenResp = Invoke-RestMethod -Uri "https://api.dropboxapi.com/oauth2/token" -Method Post -Body @{
        grant_type = "refresh_token"; refresh_token = $refreshToken; client_id = $appKey; client_secret = $appSecret
    }
    $dropboxToken = $tokenResp.access_token
    Write-Host "  Γ£à Fresh access token obtained"

    $remotePath = "/Customization Release/Krishna_Dev/WebgilityInstaller-BuildNo_$buildNumber.exe"
    $teamRootNS = "2557421763"

    # Copy file locally (curl needs local path, not UNC)
    $localCopy = "$env:TEMP\WebgilityInstaller-BuildNo_$buildNumber.exe"
    if (-not (Test-Path $localCopy)) {
        Copy-Item $sourcePath $localCopy
    }
    $fileSize = (Get-Item $localCopy).Length
    $chunkSize = 2 * 1024 * 1024  # 2MB chunks for VPN reliability

    # Split file into chunks
    $chunkDir = "$env:TEMP\dbx_chunks_$buildNumber"
    if (Test-Path $chunkDir) { Remove-Item $chunkDir -Recurse -Force }
    New-Item -ItemType Directory -Path $chunkDir | Out-Null
    $bytes = [System.IO.File]::ReadAllBytes($localCopy)
    $totalChunks = [math]::Ceiling($fileSize / $chunkSize)
    for ($i = 0; $i -lt $totalChunks; $i++) {
        $start = $i * $chunkSize
        $len = [math]::Min($chunkSize, $fileSize - $start)
        $chunk = New-Object byte[] $len
        [Array]::Copy($bytes, $start, $chunk, 0, $len)
        [System.IO.File]::WriteAllBytes("$chunkDir\chunk_$i.bin", $chunk)
    }
    $bytes = $null  # free memory
    Write-Host "  Split into $totalChunks chunks of 2MB"

    # Step 1: Start upload session with first chunk
    $startResult = curl.exe -X POST "https://content.dropboxapi.com/2/files/upload_session/start" `
        -H "Authorization: Bearer $dropboxToken" `
        -H "Content-Type: application/octet-stream" `
        -H "Dropbox-API-Arg: {`"close`":false}" `
        -H "Dropbox-API-Path-Root: {`".tag`":`"root`",`"root`":`"$teamRootNS`"}" `
        --data-binary "@$chunkDir\chunk_0.bin" `
        --http1.1 --connect-timeout 30 --max-time 120 -s 2>&1
    $sid = ($startResult | ConvertFrom-Json).session_id
    Write-Host "  Session started: $($sid.Substring(0,30))..."

    # Step 2: Append middle chunks (1 through N-2)
    $offset = $chunkSize
    $failed = $false
    for ($i = 1; $i -lt ($totalChunks - 1); $i++) {
        $apiArg = "{`"cursor`":{`"session_id`":`"$sid`",`"offset`":$offset},`"close`":false}"
        $resp = curl.exe -X POST "https://content.dropboxapi.com/2/files/upload_session/append_v2" `
            -H "Authorization: Bearer $dropboxToken" `
            -H "Content-Type: application/octet-stream" `
            -H "Dropbox-API-Arg: $apiArg" `
            -H "Dropbox-API-Path-Root: {`".tag`":`"root`",`"root`":`"$teamRootNS`"}" `
            --data-binary "@$chunkDir\chunk_$i.bin" `
            --http1.1 --connect-timeout 30 --max-time 120 --retry 2 --retry-delay 3 `
            -s -w "`n%{http_code}" 2>&1
        $code = ($resp -split "`n")[-1].Trim()
        if ($code -ne "200" -and $code -ne "") {
            Write-Host "  Γ¥î FAILED chunk $i at offset $offset (HTTP $code)"
            $failed = $true; break
        }
        $offset += $chunkSize
        if ($i % 5 -eq 0) { Write-Host "  Chunk $i/$totalChunks done ($([math]::Round($offset/1MB,1))MB)" }
    }

    if (-not $failed) {
        # Step 3: Finish with last chunk + commit
        $finishArg = "{`"cursor`":{`"session_id`":`"$sid`",`"offset`":$offset},`"commit`":{`"path`":`"$remotePath`",`"mode`":{`".tag`":`"overwrite`"},`"autorename`":false}}"
        $finishResp = curl.exe -X POST "https://content.dropboxapi.com/2/files/upload_session/finish" `
            -H "Authorization: Bearer $dropboxToken" `
            -H "Content-Type: application/octet-stream" `
            -H "Dropbox-API-Arg: $finishArg" `
            -H "Dropbox-API-Path-Root: {`".tag`":`"root`",`"root`":`"$teamRootNS`"}" `
            --data-binary "@$chunkDir\chunk_$($totalChunks-1).bin" `
            --http1.1 --connect-timeout 30 --max-time 120 -s 2>&1
        $finishJson = $finishResp | ConvertFrom-Json
        Write-Host "  Γ£à Uploaded: $($finishJson.path_display) ($([math]::Round($finishJson.size/1MB,1))MB)"

        # Step 4: Get shareable link
        $linkBody = "{`"path`":`"$remotePath`",`"settings`":{`"requested_visibility`":{`".tag`":`"public`"}}}"
        $linkResp = curl.exe -X POST "https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings" `
            -H "Authorization: Bearer $dropboxToken" `
            -H "Content-Type: application/json" `
            -H "Dropbox-API-Path-Root: {`".tag`":`"root`",`"root`":`"$teamRootNS`"}" `
            --data $linkBody --http1.1 -s 2>&1
        $linkJson = $linkResp | ConvertFrom-Json
        if ($linkJson.url) {
            $dropboxLink = $linkJson.url -replace "dl=0","dl=1"
        } else {
            # Link may already exist ΓÇö list existing links
            $listBody = "{`"path`":`"$remotePath`"}"
            $existResp = curl.exe -X POST "https://api.dropboxapi.com/2/sharing/list_shared_links" `
                -H "Authorization: Bearer $dropboxToken" `
                -H "Content-Type: application/json" `
                -H "Dropbox-API-Path-Root: {`".tag`":`"root`",`"root`":`"$teamRootNS`"}" `
                --data $listBody --http1.1 -s 2>&1
            $existJson = $existResp | ConvertFrom-Json
            $dropboxLink = ($existJson.links | Select-Object -First 1).url -replace "dl=0","dl=1"
        }
        Write-Host "  Γ£à Shareable link: $dropboxLink"
    } else {
        Write-Error "Γ¥î Dropbox upload failed at chunk level"
        $dropboxLink = $null
    }

    # Cleanup temp chunks
    Remove-Item $chunkDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Γ£à [Step 6 ΓÇö Dropbox Upload] DONE"
}
```

### 5.2 ΓÇö Troubleshooting Dropbox Upload

| Issue | Solution |
|---|---|
| "connection forcibly closed" | VPN/firewall kills long uploads. Use chunked upload (2MB) with `curl.exe --http1.1` |
| Token expired (401) | Refresh token flow auto-generates new token. Never store static access tokens. |
| "path/not_found" | Missing `Dropbox-API-Path-Root` header. MUST include team root NS `2557421763` |
| curl exit -1073741510 | curl was killed by timeout. Increase `--max-time` or reduce chunk size to 1MB |
| PowerShell `Invoke-RestMethod` fails | Use `curl.exe` instead ΓÇö it uses native Windows TLS (Schannel) which works better through corporate proxy |

---

## ┬º6 Change Jira Assignee + Transition to RFT

**Execute AFTER Dropbox upload (or after copy to QA if no upload), BEFORE Slack notification.**

Change the Jira ticket assignee to the QA tester and transition the ticket to "Ready For Testing" (RFT).

```powershell
Write-Host "≡ƒöä [Step 7 ΓÇö Jira Assignee + RFT] IN PROGRESS..."

$base64Auth = [Convert]::ToBase64String(
    [Text.Encoding]::ASCII.GetBytes("$($env:JIRA_EMAIL):$($env:JIRA_API_TOKEN)")
)
$jiraBase = $env:JIRA_BASE_URL  # https://webgility.atlassian.net

# Step 1: Look up assignee account ID (default: 'alsok mendhe' ΓÇö ask user if different)
$assigneeName = "alsok mendhe"  # Default QA tester ΓÇö user may override at runtime
$searchResp = Invoke-RestMethod `
    -Uri "$jiraBase/rest/api/3/user/search?query=$([uri]::EscapeDataString($assigneeName))" `
    -Headers @{ Authorization = "Basic $base64Auth"; "Content-Type" = "application/json" } `
    -TimeoutSec 15
$assigneeAccountId = $searchResp[0].accountId

if ($assigneeAccountId) {
    # Step 2: Change assignee
    $assignBody = @{ accountId = $assigneeAccountId } | ConvertTo-Json
    Invoke-RestMethod `
        -Uri "$jiraBase/rest/api/3/issue/$jiraTicketId/assignee" `
        -Method Put `
        -Headers @{ Authorization = "Basic $base64Auth"; "Content-Type" = "application/json" } `
        -Body $assignBody -TimeoutSec 15
    Write-Host "  Γ£à Assignee changed to: $assigneeName ($assigneeAccountId)"
} else {
    Write-Warning "  ΓÜá∩╕Å Could not find user '$assigneeName'. Ask user for correct name."
}

# Step 3: Transition to RFT (Ready For Testing)
# First get available transitions to find RFT transition ID
$transitions = Invoke-RestMethod `
    -Uri "$jiraBase/rest/api/3/issue/$jiraTicketId/transitions" `
    -Headers @{ Authorization = "Basic $base64Auth"; "Content-Type" = "application/json" } `
    -TimeoutSec 15
$rftTransition = $transitions.transitions | Where-Object { $_.name -match "RFT|Ready.?For.?Test|QA" } | Select-Object -First 1

if ($rftTransition) {
    $transBody = @{ transition = @{ id = $rftTransition.id } } | ConvertTo-Json
    Invoke-RestMethod `
        -Uri "$jiraBase/rest/api/3/issue/$jiraTicketId/transitions" `
        -Method Post `
        -Headers @{ Authorization = "Basic $base64Auth"; "Content-Type" = "application/json" } `
        -Body $transBody -TimeoutSec 15
    Write-Host "  Γ£à Jira status ΓåÆ $($rftTransition.name) (ID: $($rftTransition.id))"
} else {
    Write-Warning "  ΓÜá∩╕Å RFT transition not found. Available: $($transitions.transitions.name -join ', ')"
    Write-Host "  ΓåÆ Ask user which transition to use, or skip."
}

Write-Host "Γ£à [Step 7 ΓÇö Jira Assignee + RFT] DONE"
```

---

## ┬º7 Slack Notification

**Execute AFTER Jira assignee/RFT change, BEFORE Jira comment.**

**Dual-channel pattern:** Pre-build notification goes to one channel (e.g. `func-wd-installer-creation-updates`), QA notification goes to a different channel (e.g. `func-wd-build-updates`). Use `-QaSlackChannel` for the QA notification channel.

**Jira in QA notification MUST be full URL**, not just the ticket ID:
```
Jira: https://webgility.atlassian.net/browse/UD-32888   ✅
Jira: UD-32888                                          ❌
```

**QA Slack message format:**
```
@here Build Ready for QA Testing

Branch: <branch>
Build No: <N>
Jira: https://webgility.atlassian.net/browse/<JiraTicketId>

Installer:
\\<destPath>\WebgilityInstaller-BuildNo_<N>.exe

QA Assignee: <name>
Status: Ready For Testing
```

```powershell
Write-Host "≡ƒöä [Step 8 ΓÇö Slack Notification] IN PROGRESS..."

$slackToken   = $env:SLACK_BOT_TOKEN
if (-not $slackToken) {
    $slackToken = [System.Environment]::GetEnvironmentVariable("SLACK_BOT_TOKEN","User")
}
$slackChannel = "<USER_PROVIDED_CHANNEL>"   # e.g. "#my-daily-update" ΓÇö from user input

if (-not $slackToken) {
    Write-Error "Γ¥î SLACK_BOT_TOKEN not set. Printing message for manual post:"
} else {
    $jiraUrl = if ($jiraTicketId) { "$($env:JIRA_BASE_URL)/browse/$jiraTicketId" } else { "" }
    $jiraLine = if ($jiraUrl) { "`nJira: $jiraUrl" } else { "" }
    $dropboxLine = if ($dropboxLink) { "`nDropbox: $dropboxLink" } else { "" }

    $slackText = @"
@QA
Please find the latest installer Build No $buildNumber from Branch: $branch
QA Share: $destinationPath\WebgilityInstaller-BuildNo_$buildNumber.exe$dropboxLine$jiraLine
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
        -Body $slackBody -TimeoutSec 15

    if ($response.ok) {
        Write-Host "  Γ£à Slack message sent to $slackChannel"
    } else {
        Write-Error "  Γ¥î Slack error: $($response.error)"
    }
}

Write-Host "Γ£à [Step 8 ΓÇö Slack Notification] DONE"
```

---

## ┬º8 Structured QA Testing Jira Comment (LAST STEP)

**This is the FINAL step in the pipeline. Execute AFTER Slack notification.**

The Jira comment is posted on the **Customer Issue** (not the dev Story). QA uses this to verify the customization.

**Confluence template reference:** [Comment for QA Testing](https://webgility.atlassian.net/wiki/spaces/~712020cb0bd6e5b43649f9a0f56211a8cc8799/pages/3021209607/Comment+for+QA+Testing)

### 8.1 ΓÇö Template Structure

```
Hi @<QA Lead ΓÇö default: Alok Mendhe> ,

Customization Details:

- <what the customization does ΓÇö from Customer Issue description>
- Customization Node: <NODE_NAME_ProfileID>
- Build No: #<number> from <branch>
- Testing Env: <e.g. CISQA2 or Local>
- Accounting: <from Customer Issue>
- Store: <from Customer Issue>

### Customization Workflow:

**How to Enable:**
1. Add customization node `<NODE_NAME_ProfileID>` in WD Customization settings for the target profile.

**Settings & Setup:**
- <setup step 1 ΓÇö e.g. place config file, configure mapping>
- <setup step 2>
- <any prerequisites ΓÇö items must exist in QB, etc.>

**How to Execute:**
1. <step to trigger the customization ΓÇö e.g. download orders, sync>
2. <step to post/sync to accounting>

**Expected Result:**
- <what should happen after execution>
- <error behavior if misconfigured>

### Limitations:

- <limitation 1 ΓÇö from Customer Issue description>
- <limitation 2>
- ...

### Impacted Area:

- <high-level module/workflow 1 ΓÇö e.g. Order Posting / Sync Module>
- <high-level module/workflow 2 ΓÇö e.g. Customization Framework>
- <NO file names or code details ΓÇö QA is non-technical>

### QBD Items:

- <configuration artifacts the customer must provide>
- <sample data format>

### Test Cases:

1. <Happy path ΓÇö describe scenario + expected outcome>
2. <Edge case ΓÇö e.g. missing item, zero value>
3. <Negative case ΓÇö e.g. feature disabled>
- ...

### Links:

- DB Backup: <link from Jira description or Confluence page>
- QBD Backup: <link>
- QBD Credentials: <from Jira description>
- Installer: <QA share path — only when copy to QA succeeded>
- Dropbox: <shareable link or N/A>
- Confluence: <link to CIM page>
- Test Order: <order number from Jira>

CC: @QA @Hitesh Devashrayee
```

### 8.2 ΓÇö Data Sources (How to Populate Each Section)

| Section | Source | How to Retrieve |
|---|---|---|
| Customization Details | Jira Customer Issue description | `getJiraIssue` ΓåÆ `fields.description` |
| Customization Node | Code: `CustomizationConstant.cs` diff | `git diff` on branch vs develop ΓÇö look for new `public const string` |
| Build No / Branch | Pipeline variables | `$buildNumber`, `$branch` from ┬º1-┬º2 |
| Store / Accounting | Jira description | Parse "Store:" and "Accounting:" fields |
| Limitations | Jira description | Section labeled "Limitations:" |
| Impacted Area | PR commits / code changes | `git log --no-merges origin/develop..origin/<branch>` + `git show --stat` ΓÇö describe at **module/workflow** level only (NO file names) |
| Test Cases | Customer requirements + implementation logic | Derive from: (1) Jira description use cases, (2) code behavior (happy/edge/negative paths), (3) Confluence CIM page if exists |
| Links (DB, QBD, creds) | Jira description + Confluence personal page | Parse Dropbox links, credentials, test orders from Jira. Also check `searchConfluenceUsingCql` for page titled with Jira ID in personal space |
| Customization Workflow | Implementation knowledge + Jira | How to enable node, what config is needed, execution steps, expected result |
| CC | Default list | Always: `@Hitesh Devashrayee @Arvind Chavan`. Add others if mentioned in Jira. |

### 8.3 ΓÇö Data Collection Steps (Agent must follow in order)

1. **Extract Jira ID** from branch name (pattern `UD-\d+`)
2. **Fetch Jira Issue** ΓÇö `getJiraIssue(issueIdOrKey)` ΓåÆ get description, store, accounting, limitations, links, credentials
3. **Check Confluence personal space** ΓÇö `searchConfluenceUsingCql` with `title ~ "<JiraID>"` ΓåÆ get CIM page with DB links, implementation notes, node info
4. **Check branch commits** ΓÇö `git log --oneline --no-merges origin/develop..origin/<branch>` ΓåÆ get commit messages (skip merge commits)
5. **Check code changes** ΓÇö `git show --stat <commit>` ΓåÆ identify impacted modules (describe high-level only, NO file names for QA)
6. **Get CustomizationConstant.cs diff** ΓÇö `git diff origin/develop..origin/<branch> -- "**/CustomizationConstant.cs"` ΓåÆ extract new node constant name
7. **Draft comment** ΓåÆ present to user for review before posting
8. **Post via MCP** ΓÇö `addCommentToJiraIssue` using ADF format with proper @mention account IDs

### 8.4 ΓÇö Important Rules

- **NEVER fabricate** Build No, Testing Env, Customization Node, or credentials ΓÇö only use values extracted from actual sources.
- **NEVER include file names or code details** in the QA comment ΓÇö QA is non-technical. Describe modules/workflows only.
- **Post immediately** — do NOT ask for confirmation. Draft in chat only if user explicitly requests it.
- **Post on Customer Issue** ΓÇö not the dev Story. Identify via Jira issue type or `issuelinks`.
- **@mentions** ΓÇö use Jira account IDs when posting via API (lookup via `lookupJiraAccountId`).

### 8.5 ΓÇö PowerShell Fallback (posting)

```powershell
Write-Host "≡ƒöä [Step 9 ΓÇö QA Testing Jira Comment] IN PROGRESS..."

$base64Auth = [Convert]::ToBase64String(
    [Text.Encoding]::ASCII.GetBytes("$($env:JIRA_EMAIL):$($env:JIRA_API_TOKEN)")
)

# Build the QA comment text (populated from data collection above)
$qaComment = @"
<POPULATED QA COMMENT FROM TEMPLATE>
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

Write-Host "  Γ£à QA Testing Jira comment posted on $jiraTicketId"
Write-Host "Γ£à [Step 9 ΓÇö QA Testing Jira Comment] DONE"
```

---

## ┬º9 Environment Variables ΓÇö Complete Reference

| Variable | Status | Description |
|---|---|---|
| `JENKINS_USERNAME` | Γ£à Set | `krishna.bankar` |
| `JENKINS_API_TOKEN` | Γ£à Set | Jenkins API token |
| `DROPBOX_REFRESH_TOKEN` | Γ£à Set | Long-lived refresh token (never expires) ΓÇö generates fresh access tokens |
| `DROPBOX_APP_KEY` | Γ£à Set | OAuth2 app client ID (`z9x0d3rlqy6gnkw`) |
| `DROPBOX_APP_SECRET` | Γ£à Set | OAuth2 app client secret |
| `SLACK_BOT_TOKEN` | Γ£à Set | Slack Bot OAuth Token (`xoxb-ΓÇª`) |
| `SLACK_TEAM_ID` | Γ£à Set | `T7XA2G1MW` (Webgility workspace) |
| `JIRA_API_TOKEN` | Γ£à Set | Jira REST API token |
| `JIRA_BASE_URL` | Γ£à Set | `https://webgility.atlassian.net` |
| `JIRA_EMAIL` | Γ£à Set | `krishna.bankar@webgility.com` |
| `KIBANA_WD_AUTH` | Γ£à Set | VPN credentials (`user:pass`) ΓÇö used for Sophos/OpenVPN login |
| `BUILD_DESTINATION_PATH` | Optional | Default: `\\192.168.0.95\Kits\Unify\Customization` |

> **DEPRECATED:** `DROPBOX_ACCESS_TOKEN` ΓÇö Do NOT use. Access tokens expire in 4 hours. Use the refresh token flow instead.

---

## ┬º10 Quick Reference

| Item | Value |
|---|---|
| Jenkins job URL | `http://jenkins.webgility.com:8080/job/UnifyEnterprise/` |
| Source installer path | `\\inwsfs02\UDInstaller\WebgilityInstaller-BuildNo_<N>.exe` |
| Default QA destination | `\\192.168.0.95\Kits\Unify\Customization\` |
| Dropbox folder | [Customization Release/Krishna_Dev](https://www.dropbox.com/home/Customization%20Release/Krishna_Dev) |
| Dropbox API upload path | `/Customization Release/Krishna_Dev/` |
| Dropbox team root NS | `2557421763` ΓÇö MUST include `Dropbox-API-Path-Root` header on every call |
| Dropbox auth | Refresh token ΓåÆ fresh access token each run. NEVER use static tokens. |
| Dropbox upload method | Chunked upload sessions via `curl.exe --http1.1` (2MB chunks) |
| Dropbox scopes | `files.content.write`, `sharing.read` |
| Jira project | `https://webgility.atlassian.net/browse/UD` |
| Jira Cloud ID | `a8ce84dd-8aa2-4dd1-b893-5b33a896f918` |
| Jira In Progress transition | `271` |
| Jira Done transition | `231` |
| Jira RFT transition | Discovered at runtime via `GET /transitions` ΓÇö matches `RFT|Ready.?For.?Test|QA` |
| Default QA assignee | `alsok mendhe` (can be overridden by user) |
| Slack method | `chat.postMessage` via `SLACK_BOT_TOKEN` ΓÇö channel from user input |
| Slack bot name | `demo_app` (ID: `U0APDD2PYRX`) ΓÇö must be invited to target channel |
| Installer naming | `WebgilityInstaller-BuildNo_<N>.exe` (N = plain integer, NO # prefix) |

---

## ┬º11 Related Agents / Delegation

| Agent | File | When to invoke |
|---|---|---|
| `sys-troubleshoot` | `.github/agents/sys-troubleshoot.agent.md` | `\\inwsfs02\UDInstaller` or `\\192.168.0.95` not accessible |
| `jira-automation` | `.github/agents/jira-automation.agent.md` | QA Testing comment template, Jira field formatting |
| `confluence-automation` | `.github/agents/confluence-automation.agent.md` | Look up QA Testing comment template from Confluence workspace |

---

## ┬º12 Subtask ΓåÆ Pipeline Map (TEMPORARY ΓÇö testing only)

| Jira Key | Summary | Skill Section | Transition |
|---|---|---|---|
| UD-32300 | Run Jenkins job + poll | ┬º1.0, ┬º1, ┬º2 | To Do ΓåÆ In Progress ΓåÆ Done |
| UD-32302 | Locate installer artifact | ┬º3 | To Do ΓåÆ In Progress ΓåÆ Done |
| UD-32305 | Copy to network share | ┬º4 | To Do ΓåÆ In Progress ΓåÆ Done |
| UD-32304 | Upload to Dropbox + get link | ┬º5 | To Do ΓåÆ In Progress ΓåÆ Done |
| UD-32303 | Assignee/RFT + Slack + Jira comment | ┬º6, ┬º7, ┬º8 | To Do ΓåÆ In Progress ΓåÆ Done |

