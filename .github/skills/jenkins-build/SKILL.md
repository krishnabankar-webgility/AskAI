# Skill: Jenkins Build — Unify Enterprise (UD-32299)
<!-- Last updated: 2026-05-23 — Dropbox refresh-token + chunked upload, reordered steps, added Jira assignee/RFT step -->

Full pipeline: Check running builds → Pre-build Slack (`@here creating installer from <branch>`) → trigger Jenkins build → poll → verify network share (auto-fix if needed) → copy to QA share → optional Dropbox upload (+ shareable link) → Change Jira assignee + transition to RFT → Slack notification → Jira comment (LAST).

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

### Dropbox Authentication — Refresh Token (IMPORTANT)
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

### 5.1 — Upload (Chunked via curl.exe — Required for large files over VPN)

**WHY chunked upload:** Single-request uploads fail for files >10MB over corporate VPN (connection forcibly closed). Use Dropbox upload sessions with 2-4MB chunks via `curl.exe --http1.1` for reliability.

```powershell
Write-Host "🔄 [Step 6 — Dropbox Upload] IN PROGRESS..."

# Step 0: Get fresh access token
$refreshToken = [System.Environment]::GetEnvironmentVariable("DROPBOX_REFRESH_TOKEN","User")
$appKey       = [System.Environment]::GetEnvironmentVariable("DROPBOX_APP_KEY","User")
$appSecret    = [System.Environment]::GetEnvironmentVariable("DROPBOX_APP_SECRET","User")

if (-not $refreshToken -or -not $appKey -or -not $appSecret) {
    Write-Error "❌ Dropbox env vars not set (DROPBOX_REFRESH_TOKEN, DROPBOX_APP_KEY, DROPBOX_APP_SECRET). Skipping."
    Write-Host "⏭️ [Step 6 — Dropbox Upload] SKIPPED — no credentials"
    $dropboxLink = $null
} else {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $tokenResp = Invoke-RestMethod -Uri "https://api.dropboxapi.com/oauth2/token" -Method Post -Body @{
        grant_type = "refresh_token"; refresh_token = $refreshToken; client_id = $appKey; client_secret = $appSecret
    }
    $dropboxToken = $tokenResp.access_token
    Write-Host "  ✅ Fresh access token obtained"

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
            Write-Host "  ❌ FAILED chunk $i at offset $offset (HTTP $code)"
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
        Write-Host "  ✅ Uploaded: $($finishJson.path_display) ($([math]::Round($finishJson.size/1MB,1))MB)"

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
            # Link may already exist — list existing links
            $listBody = "{`"path`":`"$remotePath`"}"
            $existResp = curl.exe -X POST "https://api.dropboxapi.com/2/sharing/list_shared_links" `
                -H "Authorization: Bearer $dropboxToken" `
                -H "Content-Type: application/json" `
                -H "Dropbox-API-Path-Root: {`".tag`":`"root`",`"root`":`"$teamRootNS`"}" `
                --data $listBody --http1.1 -s 2>&1
            $existJson = $existResp | ConvertFrom-Json
            $dropboxLink = ($existJson.links | Select-Object -First 1).url -replace "dl=0","dl=1"
        }
        Write-Host "  ✅ Shareable link: $dropboxLink"
    } else {
        Write-Error "❌ Dropbox upload failed at chunk level"
        $dropboxLink = $null
    }

    # Cleanup temp chunks
    Remove-Item $chunkDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "✅ [Step 6 — Dropbox Upload] DONE"
}
```

### 5.2 — Troubleshooting Dropbox Upload

| Issue | Solution |
|---|---|
| "connection forcibly closed" | VPN/firewall kills long uploads. Use chunked upload (2MB) with `curl.exe --http1.1` |
| Token expired (401) | Refresh token flow auto-generates new token. Never store static access tokens. |
| "path/not_found" | Missing `Dropbox-API-Path-Root` header. MUST include team root NS `2557421763` |
| curl exit -1073741510 | curl was killed by timeout. Increase `--max-time` or reduce chunk size to 1MB |
| PowerShell `Invoke-RestMethod` fails | Use `curl.exe` instead — it uses native Windows TLS (Schannel) which works better through corporate proxy |

---

## §6 Change Jira Assignee + Transition to RFT

**Execute AFTER Dropbox upload (or after copy to QA if no upload), BEFORE Slack notification.**

Change the Jira ticket assignee to the QA tester and transition the ticket to "Ready For Testing" (RFT).

```powershell
Write-Host "🔄 [Step 7 — Jira Assignee + RFT] IN PROGRESS..."

$base64Auth = [Convert]::ToBase64String(
    [Text.Encoding]::ASCII.GetBytes("$($env:JIRA_EMAIL):$($env:JIRA_API_TOKEN)")
)
$jiraBase = $env:JIRA_BASE_URL  # https://webgility.atlassian.net

# Step 1: Look up assignee account ID (default: 'alsok mendhe' — ask user if different)
$assigneeName = "alsok mendhe"  # Default QA tester — user may override at runtime
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
    Write-Host "  ✅ Assignee changed to: $assigneeName ($assigneeAccountId)"
} else {
    Write-Warning "  ⚠️ Could not find user '$assigneeName'. Ask user for correct name."
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
    Write-Host "  ✅ Jira status → $($rftTransition.name) (ID: $($rftTransition.id))"
} else {
    Write-Warning "  ⚠️ RFT transition not found. Available: $($transitions.transitions.name -join ', ')"
    Write-Host "  → Ask user which transition to use, or skip."
}

Write-Host "✅ [Step 7 — Jira Assignee + RFT] DONE"
```

---

## §7 Slack Notification

**Execute AFTER Jira assignee/RFT change, BEFORE Jira comment.**

```powershell
Write-Host "🔄 [Step 8 — Slack Notification] IN PROGRESS..."

$slackToken   = $env:SLACK_BOT_TOKEN
if (-not $slackToken) {
    $slackToken = [System.Environment]::GetEnvironmentVariable("SLACK_BOT_TOKEN","User")
}
$slackChannel = "<USER_PROVIDED_CHANNEL>"   # e.g. "#my-daily-update" — from user input

if (-not $slackToken) {
    Write-Error "❌ SLACK_BOT_TOKEN not set. Printing message for manual post:"
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
        -Body $slackBody -TimeoutSec 15

    if ($response.ok) {
        Write-Host "  ✅ Slack message sent to $slackChannel"
    } else {
        Write-Error "  ❌ Slack error: $($response.error)"
    }
}

Write-Host "✅ [Step 8 — Slack Notification] DONE"
```

---

## §8 Structured QA Testing Jira Comment (LAST STEP)

**This is the FINAL step in the pipeline. Execute AFTER Slack notification.**

The Jira comment is posted on the **Customer Issue** (not the dev Story). QA uses this to verify the customization.

**Confluence template reference:** [Comment for QA Testing](https://webgility.atlassian.net/wiki/spaces/~712020cb0bd6e5b43649f9a0f56211a8cc8799/pages/3021209607/Comment+for+QA+Testing)

### 8.1 — Template Structure

```
Hi @<QA Lead — default: Alok Mendhe> ,

Customization Details:

- <what the customization does — from Customer Issue description>
- Customization Node: <NODE_NAME_ProfileID>
- Build No: #<number> from <branch>
- Testing Env: <e.g. CISQA2 or Local>
- Accounting: <from Customer Issue>
- Store: <from Customer Issue>

### Customization Workflow:

**How to Enable:**
1. Add customization node `<NODE_NAME_ProfileID>` in WD Customization settings for the target profile.

**Settings & Setup:**
- <setup step 1 — e.g. place config file, configure mapping>
- <setup step 2>
- <any prerequisites — items must exist in QB, etc.>

**How to Execute:**
1. <step to trigger the customization — e.g. download orders, sync>
2. <step to post/sync to accounting>

**Expected Result:**
- <what should happen after execution>
- <error behavior if misconfigured>

### Limitations:

- <limitation 1 — from Customer Issue description>
- <limitation 2>
- ...

### Impacted Area:

- <high-level module/workflow 1 — e.g. Order Posting / Sync Module>
- <high-level module/workflow 2 — e.g. Customization Framework>
- <NO file names or code details — QA is non-technical>

### QBD Items:

- <configuration artifacts the customer must provide>
- <sample data format>

### Test Cases:

1. <Happy path — describe scenario + expected outcome>
2. <Edge case — e.g. missing item, zero value>
3. <Negative case — e.g. feature disabled>
- ...

### Links:

- DB Backup: <link from Jira description or Confluence page>
- QBD Backup: <link>
- QBD Credentials: <from Jira description>
- Installer: <QA share path>
- Alternate: <inwsfs02 path>
- Dropbox: <shareable link or N/A>
- Confluence: <link to CIM page>
- Test Order: <order number from Jira>

CC: @Hitesh Devashrayee @Arvind Chavan
```

### 8.2 — Data Sources (How to Populate Each Section)

| Section | Source | How to Retrieve |
|---|---|---|
| Customization Details | Jira Customer Issue description | `getJiraIssue` → `fields.description` |
| Customization Node | Code: `CustomizationConstant.cs` diff | `git diff` on branch vs develop — look for new `public const string` |
| Build No / Branch | Pipeline variables | `$buildNumber`, `$branch` from §1-§2 |
| Store / Accounting | Jira description | Parse "Store:" and "Accounting:" fields |
| Limitations | Jira description | Section labeled "Limitations:" |
| Impacted Area | PR commits / code changes | `git log --no-merges origin/develop..origin/<branch>` + `git show --stat` — describe at **module/workflow** level only (NO file names) |
| Test Cases | Customer requirements + implementation logic | Derive from: (1) Jira description use cases, (2) code behavior (happy/edge/negative paths), (3) Confluence CIM page if exists |
| Links (DB, QBD, creds) | Jira description + Confluence personal page | Parse Dropbox links, credentials, test orders from Jira. Also check `searchConfluenceUsingCql` for page titled with Jira ID in personal space |
| Customization Workflow | Implementation knowledge + Jira | How to enable node, what config is needed, execution steps, expected result |
| CC | Default list | Always: `@Hitesh Devashrayee @Arvind Chavan`. Add others if mentioned in Jira. |

### 8.3 — Data Collection Steps (Agent must follow in order)

1. **Extract Jira ID** from branch name (pattern `UD-\d+`)
2. **Fetch Jira Issue** — `getJiraIssue(issueIdOrKey)` → get description, store, accounting, limitations, links, credentials
3. **Check Confluence personal space** — `searchConfluenceUsingCql` with `title ~ "<JiraID>"` → get CIM page with DB links, implementation notes, node info
4. **Check branch commits** — `git log --oneline --no-merges origin/develop..origin/<branch>` → get commit messages (skip merge commits)
5. **Check code changes** — `git show --stat <commit>` → identify impacted modules (describe high-level only, NO file names for QA)
6. **Get CustomizationConstant.cs diff** — `git diff origin/develop..origin/<branch> -- "**/CustomizationConstant.cs"` → extract new node constant name
7. **Draft comment** → present to user for review before posting
8. **Post via MCP** — `addCommentToJiraIssue` using ADF format with proper @mention account IDs

### 8.4 — Important Rules

- **NEVER fabricate** Build No, Testing Env, Customization Node, or credentials — only use values extracted from actual sources.
- **NEVER include file names or code details** in the QA comment — QA is non-technical. Describe modules/workflows only.
- **ALWAYS draft in chat first** — user must confirm before posting to Jira.
- **Post on Customer Issue** — not the dev Story. Identify via Jira issue type or `issuelinks`.
- **@mentions** — use Jira account IDs when posting via API (lookup via `lookupJiraAccountId`).

### 8.5 — PowerShell Fallback (posting)

```powershell
Write-Host "🔄 [Step 9 — QA Testing Jira Comment] IN PROGRESS..."

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

Write-Host "  ✅ QA Testing Jira comment posted on $jiraTicketId"
Write-Host "✅ [Step 9 — QA Testing Jira Comment] DONE"
```

---

## §9 Environment Variables — Complete Reference

| Variable | Status | Description |
|---|---|---|
| `JENKINS_USERNAME` | ✅ Set | `krishna.bankar` |
| `JENKINS_API_TOKEN` | ✅ Set | Jenkins API token |
| `DROPBOX_REFRESH_TOKEN` | ✅ Set | Long-lived refresh token (never expires) — generates fresh access tokens |
| `DROPBOX_APP_KEY` | ✅ Set | OAuth2 app client ID (`z9x0d3rlqy6gnkw`) |
| `DROPBOX_APP_SECRET` | ✅ Set | OAuth2 app client secret |
| `SLACK_BOT_TOKEN` | ✅ Set | Slack Bot OAuth Token (`xoxb-…`) |
| `SLACK_TEAM_ID` | ✅ Set | `T7XA2G1MW` (Webgility workspace) |
| `JIRA_API_TOKEN` | ✅ Set | Jira REST API token |
| `JIRA_BASE_URL` | ✅ Set | `https://webgility.atlassian.net` |
| `JIRA_EMAIL` | ✅ Set | `krishna.bankar@webgility.com` |
| `KIBANA_WD_AUTH` | ✅ Set | VPN credentials (`user:pass`) — used for Sophos/OpenVPN login |
| `BUILD_DESTINATION_PATH` | Optional | Default: `\\192.168.0.95\Kits\Unify\Customization` |

> **DEPRECATED:** `DROPBOX_ACCESS_TOKEN` — Do NOT use. Access tokens expire in 4 hours. Use the refresh token flow instead.

---

## §10 Quick Reference

| Item | Value |
|---|---|
| Jenkins job URL | `http://jenkins.webgility.com:8080/job/UnifyEnterprise/` |
| Source installer path | `\\inwsfs02\UDInstaller\WebgilityInstaller-BuildNo_<N>.exe` |
| Default QA destination | `\\192.168.0.95\Kits\Unify\Customization\` |
| Dropbox folder | [Customization Release/Krishna_Dev](https://www.dropbox.com/home/Customization%20Release/Krishna_Dev) |
| Dropbox API upload path | `/Customization Release/Krishna_Dev/` |
| Dropbox team root NS | `2557421763` — MUST include `Dropbox-API-Path-Root` header on every call |
| Dropbox auth | Refresh token → fresh access token each run. NEVER use static tokens. |
| Dropbox upload method | Chunked upload sessions via `curl.exe --http1.1` (2MB chunks) |
| Dropbox scopes | `files.content.write`, `sharing.read` |
| Jira project | `https://webgility.atlassian.net/browse/UD` |
| Jira Cloud ID | `a8ce84dd-8aa2-4dd1-b893-5b33a896f918` |
| Jira In Progress transition | `271` |
| Jira Done transition | `231` |
| Jira RFT transition | Discovered at runtime via `GET /transitions` — matches `RFT|Ready.?For.?Test|QA` |
| Default QA assignee | `alsok mendhe` (can be overridden by user) |
| Slack method | `chat.postMessage` via `SLACK_BOT_TOKEN` — channel from user input |
| Slack bot name | `demo_app` (ID: `U0APDD2PYRX`) — must be invited to target channel |
| Installer naming | `WebgilityInstaller-BuildNo_<N>.exe` (N = plain integer, NO # prefix) |

---

## §11 Related Agents / Delegation

| Agent | File | When to invoke |
|---|---|---|
| `sys-troubleshoot` | `.github/agents/sys-troubleshoot.agent.md` | `\\inwsfs02\UDInstaller` or `\\192.168.0.95` not accessible |
| `jira-automation` | `.github/agents/jira-automation.agent.md` | QA Testing comment template, Jira field formatting |
| `confluence-automation` | `.github/agents/confluence-automation.agent.md` | Look up QA Testing comment template from Confluence workspace |

---

## §12 Subtask → Pipeline Map (TEMPORARY — testing only)

| Jira Key | Summary | Skill Section | Transition |
|---|---|---|---|
| UD-32300 | Run Jenkins job + poll | §1.0, §1, §2 | To Do → In Progress → Done |
| UD-32302 | Locate installer artifact | §3 | To Do → In Progress → Done |
| UD-32305 | Copy to network share | §4 | To Do → In Progress → Done |
| UD-32304 | Upload to Dropbox + get link | §5 | To Do → In Progress → Done |
| UD-32303 | Assignee/RFT + Slack + Jira comment | §6, §7, §8 | To Do → In Progress → Done |
