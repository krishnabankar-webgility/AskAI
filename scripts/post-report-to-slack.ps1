#Requires -Version 7.0
<#
.SYNOPSIS
    Post WD Kibana daily report to Slack #my-daily-update channel

.DESCRIPTION
    Reads the generated markdown report file and posts a formatted message to Slack with:
    - Key metrics (Total Events, Errors, Fatals)
    - File path link
    - Kibana WD direct link
    - Day-over-day comparison data (if available)

.PARAMETER ReportDate
    Date of report in format YYYY-MM-DD (defaults to today)

.PARAMETER Channel
    Slack channel name without # (defaults to "my-daily-update")

.PARAMETER SlackWebhookUrl
    Slack incoming webhook URL (reads from SLACK_WEBHOOK_MY_DAILY_UPDATE env var if not provided)

.EXAMPLE
    .\post-report-to-slack.ps1
    # Posts today's report to #my-daily-update

.EXAMPLE
    .\post-report-to-slack.ps1 -ReportDate "2026-05-04" -Channel "daily-reports"
    # Posts May 4 report to #daily-reports

.NOTES
    Prerequisites:
    - SLACK_WEBHOOK_MY_DAILY_UPDATE environment variable must be set (or pass -SlackWebhookUrl)
    - Report file must exist at reports/wd-kibana-logs/{ReportDate}-wd-kibana-daily-report.md
    - PowerShell 7.0+ required
#>

param(
    [string]$ReportDate = (Get-Date -Format "yyyy-MM-dd"),
    [string]$Channel = "",
    [string]$SlackWebhookUrl = ""
)

# Support both local env vars and Cursor Cloud secrets
if (-not $Channel) {
    $Channel = [System.Environment]::GetEnvironmentVariable('SLACK_CHANNEL', 'User') -or `
               [System.Environment]::GetEnvironmentVariable('SLACK_CHANNEL', 'Process') -or `
               "wd_performance"
}

# Verify report exists
$reportPath = "reports/wd-kibana-logs/$ReportDate-wd-kibana-daily-report.md"

if (-not (Test-Path $reportPath)) {
    Write-Error "❌ Report not found: $reportPath"
    exit 1
}

Write-Host "📖 Loading report: $reportPath"
$reportContent = Get-Content $reportPath -Raw

# Get Slack webhook URL - support both local User env and Cursor Cloud Process env
if (-not $SlackWebhookUrl) {
    $SlackWebhookUrl = [System.Environment]::GetEnvironmentVariable('SLACK_WEBHOOK_MY_DAILY_UPDATE', 'User')
    if (-not $SlackWebhookUrl) {
        $SlackWebhookUrl = [System.Environment]::GetEnvironmentVariable('SLACK_WEBHOOK_MY_DAILY_UPDATE', 'Process')
    }
}

if (-not $SlackWebhookUrl) {
    Write-Error "❌ SLACK_WEBHOOK_MY_DAILY_UPDATE not set. Set it with:"
    Write-Error "   Local (User env): [System.Environment]::SetEnvironmentVariable('SLACK_WEBHOOK_MY_DAILY_UPDATE', 'your-webhook-url', 'User')"
    Write-Error "   Cursor Cloud: Add SLACK_WEBHOOK_MY_DAILY_UPDATE to agent secrets"
    exit 1
}

# Parse report metrics using regex
Write-Host "🔍 Extracting metrics..."

$metrics = @{
    TotalEvents = [regex]::Match($reportContent, '^\s*\|\s*\*\*Total Events\*\*\s*\|\s*\[([0-9,]+)\]').Groups[1].Value
    Errors      = [regex]::Match($reportContent, '^\s*\|\s*\*\*Errors\*\*\s*\|\s*\[([0-9,]+)\]').Groups[1].Value
    Fatals      = [regex]::Match($reportContent, '^\s*\|\s*\*\*Fatals\*\*\s*\|\s*\[([0-9,]+)\]').Groups[1].Value
    Warnings    = [regex]::Match($reportContent, '^\s*\|\s*\*\*Warnings\*\*\s*\|\s*\[([0-9,]+)\]').Groups[1].Value
    ErrorRate   = [regex]::Match($reportContent, '^\s*\|\s*\*\*Error Rate\*\*\s*\|\s*([0-9.%]+)').Groups[1].Value
}

# Get top error
$topErrorMatch = [regex]::Match($reportContent, '^# (\d+)\s+\|\s+([^|]+)\s+\|\s+(\d+,?\d*)')
$topError = if ($topErrorMatch.Success) {
    "$($topErrorMatch.Groups[3].Value.Trim()) — $($topErrorMatch.Groups[2].Value.Trim())"
} else {
    "N/A"
}

# Get top subscriber
$topSubMatch = [regex]::Match($reportContent, '^#\s+91162\s+\|\s+(\d+,?\d*)')
$topSub = if ($topSubMatch.Success) {
    "91162: $($topSubMatch.Groups[1].Value)"
} else {
    "N/A"
}

Write-Host "📊 Metrics extracted:"
Write-Host "   Total: $($metrics.TotalEvents)"
Write-Host "   Errors: $($metrics.Errors)"
Write-Host "   Error Rate: $($metrics.ErrorRate)"

# Build Slack message
$slackBlocks = @(
    @{
        type = "header"
        text = @{
            type = "plain_text"
            text = "📊 WD Kibana Daily Report — $ReportDate"
            emoji = $true
        }
    },
    @{
        type = "section"
        fields = @(
            @{
                type = "mrkdwn"
                text = "*Total Events:*`n$($metrics.TotalEvents)"
            },
            @{
                type = "mrkdwn"
                text = "*Error Count:*`n$($metrics.Errors)"
            },
            @{
                type = "mrkdwn"
                text = "*Fatal Events:*`n$($metrics.Fatals)"
            },
            @{
                type = "mrkdwn"
                text = "*Error Rate:*`n$($metrics.ErrorRate)"
            }
        )
    }
)

# Add warning if error rate is high
$errorRateNum = [double]($metrics.ErrorRate -replace '%', '')
if ($errorRateNum -gt 10) {
    $slackBlocks += @{
        type = "section"
        text = @{
            type = "mrkdwn"
            text = "⚠️ *High Error Rate!* Error rate is $($metrics.ErrorRate) (threshold: 10%)"
        }
        accessory = @{
            type = "image"
            image_url = "https://emoji.slack-edge.com/T0GGQYADC/U04GFDKFA/0b2bfed86c2c5849-32"
            alt_text = "warning"
        }
    }
}

# Add key insights
$slackBlocks += @{
    type = "section"
    text = @{
        type = "mrkdwn"
        text = "*Top Issue:* `n$topError`n`n*Top Subscriber:* `n$topSub"
    }
}

# Add action buttons
$slackBlocks += @{
    type = "section"
    text = @{
        type = "mrkdwn"
        text = "📄 *Full Report:*`n`reports/wd-kibana-logs/$ReportDate-wd-kibana-daily-report.md`"
    }
}

$slackBlocks += @{
    type = "actions"
    elements = @(
        @{
            type = "button"
            text = @{
                type = "plain_text"
                text = "🔍 View in Kibana"
                emoji = $true
            }
            url = "https://kibana-wd.webgility.com"
            style = "primary"
        },
        @{
            type = "button"
            text = @{
                type = "plain_text"
                text = "📂 Open Report File"
                emoji = $true
            }
            url = "vscode://file/$((Get-Location).Path)/$reportPath"
        }
    )
}

# Add divider
$slackBlocks += @{
    type = "divider"
}

# Add footer
$slackBlocks += @{
    type = "context"
    elements = @(
        @{
            type = "mrkdwn"
            text = "_Generated by WD ES Kibana Agent • $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'z)_"
        }
    )
}

# Build complete payload
$slackPayload = @{
    channel  = "#$Channel"
    username = "WD Kibana Reporter"
    icon_emoji = ":chart_with_upwards_trend:"
    blocks   = $slackBlocks
}

# Convert to JSON
$jsonPayload = $slackPayload | ConvertTo-Json -Depth 10 -AsArray

Write-Host "📮 Posting to Slack webhook..."
Write-Host "   Channel: #$Channel"
Write-Host "   Webhook: $($SlackWebhookUrl.Substring(0, 50))..."

try {
    $response = Invoke-WebRequest `
        -Uri $SlackWebhookUrl `
        -Method Post `
        -Body $jsonPayload `
        -ContentType "application/json" `
        -UseBasicParsing `
        -ErrorAction Stop

    if ($response.StatusCode -eq 200 -or $response.Content -eq "ok") {
        Write-Host "✅ Report posted successfully to Slack #$Channel"
        Write-Host "📋 Report: $reportPath"
        Write-Host "📊 Metrics: $($metrics.TotalEvents) events, $($metrics.Errors) errors, $($metrics.ErrorRate) error rate"
        exit 0
    } else {
        Write-Error "❌ Slack returned status $($response.StatusCode)"
        Write-Error "Response: $($response.Content)"
        exit 1
    }
}
catch {
    Write-Error "❌ Failed to post to Slack"
    Write-Error "Error: $_"
    exit 1
}
