# =============================================================================
# Invoke-JenkinsPipeline.ps1 — Autonomous Jenkins Build → QA Pipeline
#
# Runs the ENTIRE wd-jenkins-build workflow in one script invocation.
# The AI agent calls this ONCE — all polling, retries, and notifications
# happen inside the script with zero AI token consumption.
#
# Usage:
#   .\Invoke-JenkinsPipeline.ps1 -Branch "101/UD-32643-user/krishna" -SlackChannel "#my-daily-update"
#   .\Invoke-JenkinsPipeline.ps1 -Branch "UD-32643_Krishna" -SlackChannel "#builds" -UploadToDropbox
#   .\Invoke-JenkinsPipeline.ps1 -Branch "develop" -SlackChannel "#builds" -QaAssignee "alsok mendhe"
#
# Output: JSON result object to stdout (parseable by AI agent)
# Exit codes: 0 = success, 1 = pipeline failure, 2 = validation error
# =============================================================================

param(
    [Parameter(Mandatory = $true)]
    [string]$Branch,

    [Parameter(Mandatory = $true)]
    [string]$SlackChannel,            # Pre-build notification channel

    [string]$QaSlackChannel = "",     # QA notification channel (defaults to $SlackChannel if empty)

    [string]$DestinationPath = "\\192.168.0.95\Kits\Unify\Customization",

    [switch]$UploadToDropbox,

    [string]$QaAssignee = "",

    [string]$JiraTicketId = "",        # Auto-extracted from branch if empty

    [string]$ImpactAreas = "",         # AI-generated: modules affected
    [string]$TestCases = "",           # AI-generated: test scenarios
    [string]$CustomizationNode = "",   # AI-determined: from CustomizationConstant.cs

    [switch]$SkipJiraComment,          # Skip Jira comment posting
    [switch]$SkipSlackNotify,          # Skip Slack QA notification

    [int]$PollIntervalSec = 60,        # How often to poll Jenkins
    [int]$TimeoutMinutes = 40,         # Max wait for build

    [switch]$DryRun                    # Show plan without executing
)

$ErrorActionPreference = "Stop"
$script:startTime = Get-Date

# =============================================================================
# RESULT OBJECT — all pipeline outputs collected here
# =============================================================================
$result = [ordered]@{
    success           = $false
    branch            = $Branch
    jiraTicketId      = $null
    buildNumber       = $null
    buildResult       = $null
    buildDurationMin  = $null
    artifactPath      = $null
    artifactSizeMB    = $null
    qaSharePath       = $null
    dropboxLink       = $null
    slackSent         = $false
    jiraCommentPosted = $false
    errors            = @()
    warnings          = @()
    stepsCompleted    = @()
    stepsFailed       = @()
    stepsSkipped      = @()
    totalMinutes      = $null
}

function Write-Step {
    param([string]$Step, [string]$Status, [string]$Message)
    $icon = switch ($Status) {
        "START"   { "🔄" }
        "DONE"    { "✅" }
        "FAIL"    { "❌" }
        "SKIP"    { "⏭️" }
        "WARN"    { "⚠️" }
        default   { "  " }
    }
    Write-Host "$icon [$Step] $Message" -ForegroundColor $(switch ($Status) {
        "START" { "Cyan" }
        "DONE"  { "Green" }
        "FAIL"  { "Red" }
        "SKIP"  { "DarkGray" }
        "WARN"  { "Yellow" }
        default { "White" }
    })
}

function Add-Result {
    param([string]$Step, [string]$Status)
    switch ($Status) {
        "DONE"  { $result.stepsCompleted += $Step }
        "FAIL"  { $result.stepsFailed += $Step }
        "SKIP"  { $result.stepsSkipped += $Step }
    }
}

function Exit-Pipeline {
    param([bool]$Success, [string]$Message = "")
    $result.success = $Success
    $result.totalMinutes = [math]::Round(((Get-Date) - $script:startTime).TotalMinutes, 1)
    if ($Message) {
        if ($Success) { Write-Host "`n$Message" -ForegroundColor Green }
        else { Write-Host "`n$Message" -ForegroundColor Red }
    }
    # Output JSON result to stdout (AI agent parses this)
    $result | ConvertTo-Json -Depth 5
    exit $(if ($Success) { 0 } else { 1 })
}

# Jenkins JSON helper — MUST use -AsHashtable because Jenkins returns git ref paths
# that conflict as duplicate keys with different casing (e.g. refs/remotes/origin/Hotfix/hotfix_7121 vs hotfix/hotfix_7121)
function Invoke-JenkinsJson {
    param([string]$Url)
    $raw = curl -s -u "$($env:JENKINS_USERNAME):$($env:JENKINS_API_TOKEN)" $Url
    return ($raw | ConvertFrom-Json -AsHashtable)
}

# =============================================================================
# STEP 0: VALIDATE INPUTS + EXTRACT JIRA TICKET
# =============================================================================
Write-Step "Step 0" "START" "Validating inputs..."

# Extract Jira ticket ID from branch name
if (-not $JiraTicketId) {
    if ($Branch -match "(UD-\d+)") {
        $JiraTicketId = $Matches[1]
        Write-Step "Step 0" "DONE" "Extracted Jira ticket: $JiraTicketId"
    }
    else {
        Write-Step "Step 0" "WARN" "Could not extract Jira ID from branch '$Branch'"
        $result.warnings += "No Jira ticket ID found in branch name"
    }
}
$result.jiraTicketId = $JiraTicketId

# Validate required env vars
$requiredVars = @{
    "JENKINS_USERNAME" = $env:JENKINS_USERNAME
    "JENKINS_API_TOKEN" = $env:JENKINS_API_TOKEN
}
$missingVars = @()
foreach ($kv in $requiredVars.GetEnumerator()) {
    if (-not $kv.Value) { $missingVars += $kv.Key }
}
if ($missingVars.Count -gt 0) {
    $result.errors += "Missing env vars: $($missingVars -join ', ')"
    Exit-Pipeline $false "❌ Missing required environment variables: $($missingVars -join ', ')"
}

# Optional env vars — warn but continue
if (-not $env:SLACK_BOT_TOKEN) {
    $result.warnings += "SLACK_BOT_TOKEN not set — Slack notifications will be skipped"
}
if ($UploadToDropbox -and -not $env:DROPBOX_ACCESS_TOKEN) {
    $result.warnings += "DROPBOX_ACCESS_TOKEN not set — Dropbox upload will be skipped"
    $UploadToDropbox = $false
}
if (-not $env:JIRA_EMAIL -or -not $env:JIRA_API_TOKEN) {
    $result.warnings += "JIRA credentials not set — Jira comment will be skipped"
    $SkipJiraComment = $true
}

if ($DryRun) {
    Write-Host "`n=== DRY RUN ===" -ForegroundColor Yellow
    Write-Host "Branch:            $Branch"
    Write-Host "Jira Ticket:       $JiraTicketId"
    Write-Host "Slack Channel:     $SlackChannel"
    Write-Host "Destination:       $DestinationPath"
    Write-Host "Dropbox Upload:    $UploadToDropbox"
    Write-Host "QA Assignee:       $(if ($QaAssignee) { $QaAssignee } else { '(default)' })"
    Write-Host "Skip Jira Comment: $SkipJiraComment"
    Write-Host "Poll Interval:     ${PollIntervalSec}s"
    Write-Host "Timeout:           ${TimeoutMinutes}m"
    Write-Host "Impact Areas:      $(if ($ImpactAreas) { 'provided' } else { 'auto-generated from git log' })"
    Write-Host "Test Cases:        $(if ($TestCases) { 'provided' } else { 'auto-generated from git log' })"
    Write-Host "=================`n"
    exit 0
}

Add-Result "Step 0 - Validate Inputs" "DONE"

# =============================================================================
# JENKINS AUTH SETUP
# =============================================================================
$jenkinsUrl = "http://jenkins.webgility.com:8080"
$base64Auth = [Convert]::ToBase64String(
    [Text.Encoding]::ASCII.GetBytes("$($env:JENKINS_USERNAME):$($env:JENKINS_API_TOKEN)")
)
$jenkinsHeaders = @{ Authorization = "Basic $base64Auth" }

# =============================================================================
# STEP 1: PRE-FLIGHT CHECK — IS A BUILD ALREADY RUNNING?
# =============================================================================
Write-Step "Step 1" "START" "Pre-flight check — checking for running builds..."

try {
    $jobInfo = Invoke-JenkinsJson $jenkinsUrl/job/UnifyEnterprise/api/json

    if ($jobInfo.lastBuild) {
        $lastBuildNum = $jobInfo.lastBuild.number
        $lastBuildInfo = Invoke-JenkinsJson $jenkinsUrl/job/UnifyEnterprise/$lastBuildNum/api/json

        if ($lastBuildInfo.building -eq $true) {
            Write-Step "Step 1" "WARN" "Build #$lastBuildNum is RUNNING — waiting for it to finish..."
            $result.warnings += "Had to wait for build #$lastBuildNum to finish"

            do {
                Start-Sleep -Seconds 30
                $lastBuildInfo = Invoke-JenkinsJson $jenkinsUrl/job/UnifyEnterprise/$lastBuildNum/api/json
                $elapsed = [math]::Round(((Get-Date) - [datetimeOffset]::FromUnixTimeMilliseconds($lastBuildInfo.timestamp).LocalDateTime).TotalMinutes, 0)
                Write-Host "  ⏳ Build #$lastBuildNum still running... ($elapsed min elapsed)" -ForegroundColor DarkGray
            } while ($lastBuildInfo.building -eq $true)

            Write-Step "Step 1" "DONE" "Previous build #$lastBuildNum finished: $($lastBuildInfo.result)"
        }
        else {
            Write-Step "Step 1" "DONE" "No running builds. Last build #$lastBuildNum was: $($lastBuildInfo.result)"
        }
    }
    else {
        Write-Step "Step 1" "DONE" "No previous builds found"
    }
    Add-Result "Step 1 - Pre-Flight Check" "DONE"
}
catch {
    $result.errors += "Pre-flight check failed: $_"
    Exit-Pipeline $false "❌ Cannot connect to Jenkins at $jenkinsUrl — $_"
}

# =============================================================================
# STEP 2: PRE-BUILD SLACK NOTIFICATION
# =============================================================================
Write-Step "Step 2" "START" "Sending pre-build Slack notification..."

if (-not $env:SLACK_BOT_TOKEN) {
    Write-Step "Step 2" "SKIP" "No SLACK_BOT_TOKEN — skipping"
    Add-Result "Step 2 - Pre-Build Slack" "SKIP"
}
else {
    try {
        $preSlackText = "@here 🔨 Creating installer from branch: ``$Branch``"
        $preSlackBody = @{
            channel = $SlackChannel
            text    = $preSlackText
        } | ConvertTo-Json -Compress

        $slackResp = Invoke-RestMethod -Uri "https://slack.com/api/chat.postMessage" `
            -Method Post `
            -Headers @{ Authorization = "Bearer $($env:SLACK_BOT_TOKEN)" } `
            -ContentType "application/json; charset=utf-8" `
            -Body $preSlackBody

        if ($slackResp.ok) {
            Write-Step "Step 2" "DONE" "Pre-build Slack sent to $SlackChannel"
        }
        else {
            Write-Step "Step 2" "WARN" "Slack error: $($slackResp.error)"
            $result.warnings += "Pre-build Slack failed: $($slackResp.error)"
        }
        Add-Result "Step 2 - Pre-Build Slack" "DONE"
    }
    catch {
        Write-Step "Step 2" "WARN" "Slack failed: $_"
        $result.warnings += "Pre-build Slack exception: $_"
        Add-Result "Step 2 - Pre-Build Slack" "FAIL"
    }
}

# =============================================================================
# STEP 3: TRIGGER JENKINS BUILD
# =============================================================================
Write-Step "Step 3" "START" "Triggering Jenkins build for: $Branch"

try {
    # Ensure branch exists on remote
    $remoteBranch = $Branch
    if (-not $remoteBranch.StartsWith("origin/")) {
        $remoteBranch = "origin/$Branch"
    }

    # Record the next build number BEFORE triggering
    $preTriggerInfo = Invoke-JenkinsJson $jenkinsUrl/job/UnifyEnterprise/api/json?tree=nextBuildNumber
    $expectedBuildNumber = $preTriggerInfo.nextBuildNumber
    Write-Host "  Expected build number: $expectedBuildNumber" -ForegroundColor DarkGray

    # URL-encode the branch parameter (Git Parameter plugin requires origin/ prefix)
    $encodedBranch = [System.Uri]::EscapeDataString($remoteBranch)
    $triggerBody = "Branch=$encodedBranch&PostSharp=Yes"

    # Trigger build
    Invoke-RestMethod -Uri "$jenkinsUrl/job/UnifyEnterprise/buildWithParameters" `
        -Method Post `
        -Headers $jenkinsHeaders `
        -Body $triggerBody `
        -ContentType "application/x-www-form-urlencoded" `
        -TimeoutSec 30

    Write-Step "Step 3" "DONE" "Build triggered — expected build #$expectedBuildNumber"
    $result.buildNumber = $expectedBuildNumber
    Add-Result "Step 3 - Trigger Jenkins" "DONE"
}
catch {
    # Check if build was queued despite error (Jenkins returns 201 but sometimes PS throws)
    try {
        Start-Sleep -Seconds 3
        $queueInfo = Invoke-JenkinsJson $jenkinsUrl/queue/api/json
        $queuedItem = $queueInfo.items | Where-Object { $_.task.name -eq "UnifyEnterprise" } | Select-Object -First 1
        if ($queuedItem) {
            Write-Step "Step 3" "WARN" "Trigger threw but build IS queued (id=$($queuedItem.id)). Continuing."
            Add-Result "Step 3 - Trigger Jenkins" "DONE"
        }
        else {
            throw $_
        }
    }
    catch {
        $result.errors += "Jenkins trigger failed: $_"
        Exit-Pipeline $false "❌ Failed to trigger Jenkins build: $_"
    }
}

# =============================================================================
# STEP 4: POLL FOR BUILD COMPLETION (THE BIG TOKEN SAVER)
# =============================================================================
Write-Step "Step 4" "START" "Polling build #$expectedBuildNumber every ${PollIntervalSec}s (timeout: ${TimeoutMinutes}m)..."

$pollStart = Get-Date
$buildCompleted = $false
$finalBuildInfo = $null

try {
    # Wait a few seconds for the build to appear in the API
    Start-Sleep -Seconds 8

    # First, resolve the actual build number (may differ from expected if another build was queued)
    $jobInfo = Invoke-JenkinsJson $jenkinsUrl/job/UnifyEnterprise/api/json?tree=builds[number,building,result]{0,5}
    $latestBuild = $jobInfo.builds | Where-Object { $_.building -eq $true -or $_.result -eq $null } | Select-Object -First 1

    if ($latestBuild) {
        $expectedBuildNumber = $latestBuild.number
        $result.buildNumber = $expectedBuildNumber
        Write-Host "  Tracking actual build: #$expectedBuildNumber" -ForegroundColor DarkGray
    }

    # Poll loop — runs entirely in PowerShell, ZERO AI tokens consumed
    while (-not $buildCompleted) {
        Start-Sleep -Seconds $PollIntervalSec

        $buildInfo = Invoke-JenkinsJson $jenkinsUrl/job/UnifyEnterprise/$expectedBuildNumber/api/json
        $elapsed = (Get-Date) - $pollStart
        $elapsedMin = [int]$elapsed.TotalMinutes

        # Progress indicator
        $statusLine = "  ⏳ [$elapsedMin min] Build #$expectedBuildNumber — building=$($buildInfo.building) result=$($buildInfo.result)"
        Write-Host $statusLine -ForegroundColor DarkGray

        if ($buildInfo.building -eq $false -and $null -ne $buildInfo.result) {
            $buildCompleted = $true
            $finalBuildInfo = $buildInfo
        }

        if ($elapsed.TotalMinutes -gt $TimeoutMinutes) {
            $result.errors += "Build #$expectedBuildNumber timed out after $TimeoutMinutes minutes"
            Exit-Pipeline $false "❌ Build #$expectedBuildNumber timed out after $TimeoutMinutes minutes"
        }
    }

    $result.buildResult = $finalBuildInfo.result
    $result.buildDurationMin = [math]::Round(($finalBuildInfo.duration / 60000), 1)

    if ($finalBuildInfo.result -ne "SUCCESS") {
        $consoleUrl = "$jenkinsUrl/job/UnifyEnterprise/$expectedBuildNumber/console"
        $result.errors += "Build failed: $($finalBuildInfo.result). Console: $consoleUrl"
        Exit-Pipeline $false "❌ Build #$expectedBuildNumber $($finalBuildInfo.result)`n  Console: $consoleUrl"
    }

    Write-Step "Step 4" "DONE" "Build #$expectedBuildNumber SUCCESS in $($result.buildDurationMin)m"
    Add-Result "Step 4 - Poll Completion" "DONE"
}
catch {
    $result.errors += "Polling error: $_"
    Exit-Pipeline $false "❌ Polling failed: $_"
}

# =============================================================================
# STEP 5: VERIFY ARTIFACT ON NETWORK SHARE
# =============================================================================
Write-Step "Step 5" "START" "Verifying artifact on network share..."

$sourceShare = "\\inwsfs02\UDInstaller"
$sourcePath = "$sourceShare\WebgilityInstaller-BuildNo_$expectedBuildNumber.exe"
$artifactVerified = $false

try {
    # Check share accessibility
    if (-not (Test-Path $sourceShare)) {
        Write-Step "Step 5" "WARN" "Share not accessible — checking VPN..."

        # Check VPN adapters
        $vpnAdapters = Get-NetAdapter | Where-Object {
            $_.InterfaceDescription -match "TAP|Sophos|OpenVPN|tun|WireGuard" -and $_.Status -eq "Up"
        }

        if (-not $vpnAdapters) {
            # Try to get VPN credentials and connect
            $kibanaAuth = $env:KIBANA_WD_AUTH
            if (-not $kibanaAuth) {
                $kibanaAuth = [System.Environment]::GetEnvironmentVariable("KIBANA_WD_AUTH", "User")
            }

            if ($kibanaAuth -and $kibanaAuth -match ":") {
                Write-Host "  → VPN not connected. Credentials available. Attempting connection..." -ForegroundColor Yellow

                # Try Sophos CLI
                $sophosCli = "C:\Program Files (x86)\Sophos\Sophos SSL VPN Client\bin\openvpn-gui.exe"
                if (Test-Path $sophosCli) {
                    Start-Process $sophosCli -ArgumentList "--connect" -WindowStyle Minimized
                }

                Write-Host "  → Waiting 20s for VPN to establish..." -ForegroundColor DarkGray
                Start-Sleep -Seconds 20

                if (-not (Test-Path $sourceShare)) {
                    $result.errors += "VPN connected but share still inaccessible"
                    Exit-Pipeline $false "❌ Cannot reach $sourceShare even after VPN attempt. Check VPN / SMB."
                }
            }
            else {
                $result.errors += "Share inaccessible and no VPN credentials (KIBANA_WD_AUTH)"
                Exit-Pipeline $false "❌ Cannot reach $sourceShare. VPN not connected and no credentials available."
            }
        }
        else {
            Write-Step "Step 5" "WARN" "VPN is UP but share still inaccessible"
            $result.errors += "VPN connected but SMB share unreachable"
            Exit-Pipeline $false "❌ VPN connected but $sourceShare unreachable. Check SMB/routing."
        }
    }

    # Check artifact exists
    if (-not (Test-Path $sourcePath)) {
        Write-Host "  → Artifact not found immediately. Waiting 30s (build may still be publishing)..." -ForegroundColor DarkGray
        Start-Sleep -Seconds 30
        if (-not (Test-Path $sourcePath)) {
            $result.errors += "Artifact not found: $sourcePath"
            Exit-Pipeline $false "❌ Installer not found: $sourcePath"
        }
    }

    # Verify file is complete (not still being written)
    $fileInfo = Get-Item $sourcePath
    Start-Sleep -Seconds 5
    $fileInfo2 = Get-Item $sourcePath
    if ($fileInfo.Length -ne $fileInfo2.Length) {
        Write-Host "  → File still being written. Waiting 60s..." -ForegroundColor DarkGray
        Start-Sleep -Seconds 60
        $fileInfo = Get-Item $sourcePath
    }

    if ($fileInfo.Length -eq 0) {
        $result.errors += "Artifact is 0 bytes"
        Exit-Pipeline $false "❌ Installer is 0 bytes — build may have failed to produce artifact"
    }

    $result.artifactPath = $sourcePath
    $result.artifactSizeMB = [math]::Round($fileInfo.Length / 1MB, 1)
    Write-Step "Step 5" "DONE" "Artifact verified: $($result.artifactSizeMB) MB"
    Add-Result "Step 5 - Verify Artifact" "DONE"
}
catch {
    $result.errors += "Artifact verification failed: $_"
    Exit-Pipeline $false "❌ Artifact verification failed: $_"
}

# =============================================================================
# STEP 6: COPY TO QA SHARE
# =============================================================================
Write-Step "Step 6" "START" "Copying to QA share: $DestinationPath"

$destinationFile = Join-Path $DestinationPath "WebgilityInstaller-BuildNo_$expectedBuildNumber.exe"

try {
    if (-not (Test-Path $DestinationPath)) {
        $result.errors += "Destination unreachable: $DestinationPath"
        Exit-Pipeline $false "❌ Destination unreachable: $DestinationPath"
    }

    Copy-Item -Path $sourcePath -Destination $destinationFile -Force

    # Verify copy
    if (-not (Test-Path $destinationFile)) {
        $result.errors += "Copy failed — file not at destination"
        Exit-Pipeline $false "❌ Copy failed — $destinationFile not found after copy"
    }

    $destSize = (Get-Item $destinationFile).Length
    if ($destSize -ne $fileInfo.Length) {
        $result.errors += "Size mismatch: source=$($fileInfo.Length) dest=$destSize"
        Exit-Pipeline $false "❌ Copy size mismatch. Source: $($fileInfo.Length), Dest: $destSize"
    }

    $result.qaSharePath = $destinationFile
    Write-Step "Step 6" "DONE" "Copied to: $destinationFile ($($result.artifactSizeMB) MB)"
    Add-Result "Step 6 - Copy to QA Share" "DONE"
}
catch {
    $result.errors += "Copy failed: $_"
    Exit-Pipeline $false "❌ Copy to QA share failed: $_"
}

# =============================================================================
# STEP 7: DROPBOX UPLOAD (OPTIONAL)
# =============================================================================
if (-not $UploadToDropbox) {
    Write-Step "Step 7" "SKIP" "Dropbox upload not requested"
    Add-Result "Step 7 - Dropbox Upload" "SKIP"
}
else {
    Write-Step "Step 7" "START" "Uploading to Dropbox..."

    try {
        $dropboxToken = $env:DROPBOX_ACCESS_TOKEN
        $remotePath = "/Customization Release/Krishna_Dev/WebgilityInstaller-BuildNo_$expectedBuildNumber.exe"
        $teamRootNS = "2557421763"

        # Upload in chunks for large files (Dropbox max 150MB simple upload)
        $fileBytes = [System.IO.File]::ReadAllBytes($sourcePath)
        $dropboxApiArg = @{ path = $remotePath; mode = @{ ".tag" = "overwrite" }; autorename = $false } | ConvertTo-Json -Compress

        $uploadHeaders = @{
            Authorization           = "Bearer $dropboxToken"
            "Dropbox-API-Arg"       = $dropboxApiArg
            "Content-Type"          = "application/octet-stream"
            "Dropbox-API-Path-Root" = "{`".tag`":`"root`",`"root`":`"$teamRootNS`"}"
        }

        $uploadResult = Invoke-RestMethod -Uri "https://content.dropboxapi.com/2/files/upload" `
            -Method Post -Headers $uploadHeaders -Body $fileBytes -TimeoutSec 300

        Write-Host "  ✅ Uploaded: $($uploadResult.path_display)" -ForegroundColor Green

        # Get or create shareable link
        $shareHeaders = @{
            Authorization           = "Bearer $dropboxToken"
            "Content-Type"          = "application/json"
            "Dropbox-API-Path-Root" = "{`".tag`":`"root`",`"root`":`"$teamRootNS`"}"
        }

        try {
            $shareBody = @{ path = $remotePath; settings = @{ requested_visibility = @{ ".tag" = "public" } } } | ConvertTo-Json -Compress
            $shareResult = Invoke-RestMethod -Uri "https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings" `
                -Method Post -Headers $shareHeaders -Body $shareBody -TimeoutSec 30
            $result.dropboxLink = $shareResult.url -replace "dl=0", "dl=1"
        }
        catch {
            # Link may already exist — try to list existing links
            $listBody = @{ path = $remotePath } | ConvertTo-Json -Compress
            $existing = Invoke-RestMethod -Uri "https://api.dropboxapi.com/2/sharing/list_shared_links" `
                -Method Post -Headers $shareHeaders -Body $listBody -TimeoutSec 30
            $result.dropboxLink = ($existing.links | Select-Object -First 1).url -replace "dl=0", "dl=1"
        }

        Write-Step "Step 7" "DONE" "Dropbox link: $($result.dropboxLink)"
        Add-Result "Step 7 - Dropbox Upload" "DONE"
    }
    catch {
        Write-Step "Step 7" "FAIL" "Dropbox upload failed: $_"
        $result.warnings += "Dropbox upload failed: $_"
        Add-Result "Step 7 - Dropbox Upload" "FAIL"
    }
}

# =============================================================================
# STEP 7.5: JIRA RFT + ASSIGN QA
# =============================================================================
if ($JiraTicketId -and $env:JIRA_EMAIL -and $env:JIRA_API_TOKEN) {
    Write-Step "Step 7.5" "START" "Jira RFT + Assign for $JiraTicketId..."
    try {
        $jiraBase64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$($env:JIRA_EMAIL):$($env:JIRA_API_TOKEN)"))
        $jiraHeaders = @{ Authorization = "Basic $jiraBase64"; "Content-Type" = "application/json" }

        # Transition to RFT (251 = "Ready For Testing")
        $rftBody = @{ transition = @{ id = "251" } } | ConvertTo-Json
        Invoke-RestMethod -Uri "$($env:JIRA_BASE_URL)/rest/api/3/issue/$JiraTicketId/transitions" -Method Post -Headers $jiraHeaders -Body $rftBody -TimeoutSec 30
        Write-Step "Step 7.5" "DONE" "Transitioned $JiraTicketId to RFT"

        # Assign to QA person
        if ($QaAssignee) {
            $searchResp = Invoke-RestMethod -Uri "$($env:JIRA_BASE_URL)/rest/api/3/user/search?query=$([uri]::EscapeDataString($QaAssignee))" -Headers $jiraHeaders -Method Get -TimeoutSec 30
            $assignee = $searchResp | Where-Object { $_.displayName -match [regex]::Escape($QaAssignee.Split()[0]) } | Select-Object -First 1
            if ($assignee) {
                $assignBody = @{ accountId = $assignee.accountId } | ConvertTo-Json
                Invoke-RestMethod -Uri "$($env:JIRA_BASE_URL)/rest/api/3/issue/$JiraTicketId/assignee" -Method Put -Headers $jiraHeaders -Body $assignBody -TimeoutSec 30
                Write-Step "Step 7.5" "DONE" "Assigned to $($assignee.displayName)"
            } else {
                Write-Step "Step 7.5" "WARN" "Could not find user: $QaAssignee"
            }
        }
        Add-Result "Step 7.5 - Jira RFT + Assign" "DONE"
    }
    catch {
        Write-Step "Step 7.5" "WARN" "Jira RFT/Assign failed: $_"
        $result.warnings += "Jira RFT/Assign: $_"
    }
}

# =============================================================================
# STEP 8: QA JIRA COMMENT + SLACK NOTIFICATION
# =============================================================================
Write-Step "Step 8" "START" "Sending QA notifications..."

# --- 8a: Build QA Jira Comment ---
$jiraCommentPosted = $false
if (-not $SkipJiraComment -and $JiraTicketId -and $env:JIRA_EMAIL -and $env:JIRA_API_TOKEN) {
    try {
        # Auto-generate impact areas from git log if not provided
        if (-not $ImpactAreas) {
            $ImpactAreas = "_Auto-generated from branch commits — review for accuracy_`n"
            try {
                $gitLog = git log --oneline -20 "origin/$Branch" 2>$null
                if ($gitLog) {
                    $commits = $gitLog -split "`n" | Where-Object { $_.Trim() } | Select-Object -First 15
                    $ImpactAreas += ($commits | ForEach-Object { "- $_" }) -join "`n"
                }
                else {
                    $ImpactAreas += "- (Could not retrieve commit history for branch)"
                }
            }
            catch {
                $ImpactAreas += "- (Could not retrieve commit history)"
            }
        }

        if (-not $TestCases) {
            $TestCases = "_Review PR commits and customer requirements for specific test cases_"
        }

        $dropboxLine = if ($result.dropboxLink) { "- Dropbox: $($result.dropboxLink)" } else { "- Dropbox: N/A — not uploaded" }
        $nodeLine = if ($CustomizationNode) { $CustomizationNode } else { "TBD — check CustomizationConstant.cs" }

        $jiraComment = @"
✅ Jenkins Build Ready for QA Testing

*Branch:* $Branch
*Build No:* $expectedBuildNumber
*Customization Node:* $nodeLine

*Installer Locations:*
- Network Share: \\192.168.0.95\Kits\Unify\Customization\WebgilityInstaller-BuildNo_$expectedBuildNumber.exe
- Alternate: \\inwsfs02\UDInstaller\WebgilityInstaller-BuildNo_$expectedBuildNumber.exe
$dropboxLine

*Impact Areas (from PR commits):*
$ImpactAreas

*Test Cases:*
$TestCases

*Build Status:* SUCCESS ($($result.buildDurationMin) min)
*Generated by:* wd-jenkins-build automated pipeline
"@

        $base64JiraAuth = [Convert]::ToBase64String(
            [Text.Encoding]::ASCII.GetBytes("$($env:JIRA_EMAIL):$($env:JIRA_API_TOKEN)")
        )

        # Atlassian Document Format for Jira Cloud
        $adfBody = @{
            body = @{
                type    = "doc"
                version = 1
                content = @(
                    @{
                        type    = "paragraph"
                        content = @(
                            @{ type = "text"; text = $jiraComment }
                        )
                    }
                )
            }
        } | ConvertTo-Json -Depth 10

        Invoke-RestMethod -Uri "$($env:JIRA_BASE_URL)/rest/api/3/issue/$JiraTicketId/comment" `
            -Method Post `
            -Headers @{ Authorization = "Basic $base64JiraAuth"; "Content-Type" = "application/json" } `
            -Body $adfBody `
            -TimeoutSec 30

        Write-Host "  ✅ Jira comment posted on $JiraTicketId" -ForegroundColor Green
        $jiraCommentPosted = $true
        $result.jiraCommentPosted = $true
    }
    catch {
        Write-Step "Step 8" "WARN" "Jira comment failed: $_"
        $result.warnings += "Jira comment failed: $_"
    }
}
else {
    if ($SkipJiraComment) {
        Write-Host "  ⏭️ Jira comment skipped (SkipJiraComment flag)" -ForegroundColor DarkGray
    }
    elseif (-not $JiraTicketId) {
        Write-Host "  ⏭️ Jira comment skipped (no ticket ID)" -ForegroundColor DarkGray
    }
    else {
        Write-Host "  ⏭️ Jira comment skipped (no Jira credentials)" -ForegroundColor DarkGray
    }
}

# --- 8b: Slack QA Notification ---
if (-not $SkipSlackNotify -and $env:SLACK_BOT_TOKEN) {
    try {
        $dropboxLine = if ($result.dropboxLink) { "`nDropbox: $($result.dropboxLink)" } else { "" }
        $jiraUrl = if ($JiraTicketId) { "$($env:JIRA_BASE_URL)/browse/$JiraTicketId" } else { "" }
        $jiraLine = if ($jiraUrl) { "`nJira: $jiraUrl" } else { "" }

        $slackQaText = @"
@QA 🎯 Build #$expectedBuildNumber ready for testing!

Branch: ``$Branch``
QA Share: ``$DestinationPath\WebgilityInstaller-BuildNo_$expectedBuildNumber.exe``$dropboxLine$jiraLine
"@

        $qaSlackTarget = if ($QaSlackChannel) { $QaSlackChannel } else { $SlackChannel }

        $slackQaBody = @{
            channel = $qaSlackTarget
            text    = $slackQaText
        } | ConvertTo-Json -Compress

        $qaSlackResp = Invoke-RestMethod -Uri "https://slack.com/api/chat.postMessage" `
            -Method Post `
            -Headers @{ Authorization = "Bearer $($env:SLACK_BOT_TOKEN)" } `
            -ContentType "application/json; charset=utf-8" `
            -Body $slackQaBody `
            -TimeoutSec 15

        if ($qaSlackResp.ok) {
            Write-Host "  ✅ QA Slack sent to $qaSlackTarget" -ForegroundColor Green
            $result.slackSent = $true
        }
        else {
            Write-Step "Step 8" "WARN" "QA Slack error: $($qaSlackResp.error)"
            $result.warnings += "QA Slack failed: $($qaSlackResp.error)"
        }
    }
    catch {
        Write-Step "Step 8" "WARN" "QA Slack failed: $_"
        $result.warnings += "QA Slack exception: $_"
    }
}
else {
    Write-Host "  ⏭️ Slack QA notification skipped" -ForegroundColor DarkGray
}

Add-Result "Step 8 - QA Notifications" "DONE"
Write-Step "Step 8" "DONE" "QA notifications complete"

# =============================================================================
# FINAL SUMMARY
# =============================================================================
$totalMin = [math]::Round(((Get-Date) - $script:startTime).TotalMinutes, 1)

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  JENKINS PIPELINE COMPLETE" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Branch:        $Branch" -ForegroundColor White
Write-Host "  Build #:       $expectedBuildNumber" -ForegroundColor White
Write-Host "  Build Result:  SUCCESS" -ForegroundColor Green
Write-Host "  Build Time:    $($result.buildDurationMin)m" -ForegroundColor White
Write-Host "  Pipeline Time: ${totalMin}m" -ForegroundColor White
Write-Host ""
Write-Host "  QA Share:      $destinationFile" -ForegroundColor White
if ($result.dropboxLink) {
    Write-Host "  Dropbox:       $($result.dropboxLink)" -ForegroundColor White
}
if ($JiraTicketId) {
    Write-Host "  Jira:          $($env:JIRA_BASE_URL)/browse/$JiraTicketId" -ForegroundColor White
}
Write-Host ""
Write-Host "  Steps Done:    $($result.stepsCompleted.Count)" -ForegroundColor Green
if ($result.stepsFailed.Count -gt 0) {
    Write-Host "  Steps Failed:  $($result.stepsFailed.Count)" -ForegroundColor Red
}
if ($result.warnings.Count -gt 0) {
    Write-Host "  Warnings:      $($result.warnings.Count)" -ForegroundColor Yellow
}
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

Exit-Pipeline $true "✅ Pipeline complete — build #$expectedBuildNumber ready for QA"
