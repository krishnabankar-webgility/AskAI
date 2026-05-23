# System Cleanup & Performance Optimization

## Skill Purpose
Diagnose system slowness and perform safe cleanup/optimization of Windows system — temp files, caches, unused apps, startup items, and developer artifacts.

## When to Use This Skill

- System is slow or sluggish
- C: drive running low on space
- Too many processes running
- Boot time is slow
- User requests "system cleanup", "optimize", "free up space", "speed up"
- Periodic maintenance requested

---

## System Info (Krishna's Machine)

| Component | Detail |
|-----------|--------|
| OS | Windows 11 Pro |
| CPU | 13th Gen Intel i5-1335U |
| RAM | 39.5 GB |
| Disk | Samsung MZVL2512HDJD SSD, 477 GB (GPT) |
| Partitions | C: ~243 GB, D: ~195 GB |

## Required Apps (DO NOT TOUCH)

These are Krishna's daily-use apps — never uninstall or disable:
- **Unify** (Webgility desktop app)
- **Unify-Scheduler**
- **QuickBooks Desktop** (current version in use — v24)
- **Visual Studio** (devenv)
- **VS Code**
- **Slack**
- **Notepad++**
- **Sophos VPN** & **OpenVPN GUI**
- **Postman**
- **SQL Server** (sqlservr — used via VS Object Explorer)

## Protected Folders (NEVER DELETE)

These folders on C: must never be removed or modified:
- `C:\WD`
- `C:\Webgility`
- `C:\WG-Agentic`
- `C:\LoadDesigner`
- `C:\MSSQL_DATA`
- `C:\Users\krishna.bankar\Documents`

---

## Workflow

### Phase 1 — Diagnose

Run these read-only commands to assess current state:

```powershell
# System overview
Get-CimInstance Win32_OperatingSystem | Select-Object Caption, TotalVisibleMemorySize, FreePhysicalMemory, NumberOfProcesses | Format-List

# CPU load
Get-CimInstance Win32_Processor | Select-Object Name, LoadPercentage | Format-List

# Disk space
Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID, @{N='SizeGB';E={[math]::Round($_.Size/1GB,1)}}, @{N='FreeGB';E={[math]::Round($_.FreeSpace/1GB,1)}}, @{N='UsedPct';E={[math]::Round(($_.Size-$_.FreeSpace)/$_.Size*100,1)}} | Format-Table -AutoSize

# Top memory consumers
Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 15 Name, @{N='MemMB';E={[math]::Round($_.WorkingSet64/1MB,0)}}, CPU, Id | Format-Table -AutoSize

# Temp folder sizes
@($env:TEMP, "$env:SystemRoot\Temp", "$env:SystemRoot\Prefetch") | ForEach-Object { $size = (Get-ChildItem $_ -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum ; Write-Host ("{0,-55} {1,8:N0} MB" -f $_, [math]::Round($size/1MB,0)) }

# Uptime
$os = Get-CimInstance Win32_OperatingSystem ; $uptime = (Get-Date) - $os.LastBootUpTime ; Write-Host ("Uptime: {0}d {1}h {2}m" -f $uptime.Days, $uptime.Hours, $uptime.Minutes)

# Large AppData folders
Get-ChildItem "$env:LOCALAPPDATA" -Directory -Force -ErrorAction SilentlyContinue | ForEach-Object { $size = (Get-ChildItem $_.FullName -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum ; [PSCustomObject]@{Folder=$_.Name; SizeMB=[math]::Round($size/1MB,0)} } | Where-Object { $_.SizeMB -gt 100 } | Sort-Object SizeMB -Descending | Format-Table -AutoSize
```

### Phase 2 — Quick Cleanup (Safe, No Confirmation Needed)

These are always safe to run:

```powershell
# 1. Clear User Temp
Get-ChildItem $env:TEMP -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

# 2. Clear Windows Temp
Get-ChildItem "$env:SystemRoot\Temp" -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

# 3. Empty Recycle Bin
Clear-RecycleBin -Force -ErrorAction SilentlyContinue

# 4. Clear Chrome cache
@("$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Cache", "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Code Cache", "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\GPUCache") | ForEach-Object { if (Test-Path $_) { Get-ChildItem $_ -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue } }

# 5. Clear Edge cache
@("$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Cache", "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Code Cache", "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\GPUCache") | ForEach-Object { if (Test-Path $_) { Get-ChildItem $_ -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue } }

# 6. Clear CrashDumps
if (Test-Path "$env:LOCALAPPDATA\CrashDumps") { Get-ChildItem "$env:LOCALAPPDATA\CrashDumps" -Force | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue }

# 7. Clear Windows Prefetch
Get-ChildItem "$env:SystemRoot\Prefetch" -Force -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

# 8. Clear C:\Temp (root level temp)
if (Test-Path "C:\Temp") { Get-ChildItem "C:\Temp" -Force | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue }
```

### Phase 3 — Developer Cache Cleanup (Ask Before If Large)

```powershell
# NuGet cache (~3 GB typically, re-downloads on need)
dotnet nuget locals all --clear

# npm cache
if (Test-Path "$env:LOCALAPPDATA\npm-cache") { Get-ChildItem "$env:LOCALAPPDATA\npm-cache" -Force | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue }

# Python uv cache
if (Test-Path "$env:LOCALAPPDATA\uv") { Get-ChildItem "$env:LOCALAPPDATA\uv" -Force | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue }

# .NET bin/obj in work projects (ONLY in WD, Webgility, WG-Agentic)
@("C:\WD", "C:\Webgility", "C:\WG-Agentic") | ForEach-Object { if (Test-Path $_) { Get-ChildItem $_ -Recurse -Directory -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'bin' -or $_.Name -eq 'obj' } | ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue } } }

# Old VS Code extension versions
$extPath = "$env:USERPROFILE\.vscode\extensions"
Get-ChildItem $extPath -Directory | Where-Object { $_.Name -match '^(.+?)-(\d+.*)$' } | ForEach-Object { [PSCustomObject]@{Name=($_.Name -replace '-[\d].*$',''); Version=($_.Name -replace '^.*?-(\d)','$1'); FullPath=$_.FullName} } | Group-Object Name | Where-Object { $_.Count -gt 1 } | ForEach-Object { $_.Group | Sort-Object Version -Descending | Select-Object -Skip 1 | ForEach-Object { Remove-Item $_.FullPath -Recurse -Force -ErrorAction SilentlyContinue } }
```

### Phase 4 — Startup Optimization

Startup items that should be **DISABLED** (non-essential):
- `com.squirrel.FathomVideo.Fathom` — meeting recorder, not needed
- `Logitech Download Assistant` — unnecessary background updater
- `MicrosoftCopilotAutoLaunch_*` — Copilot Desktop (VS Code Copilot is used instead)
- `GoogleChromeAutoLaunch_*` — Chrome pre-launch not needed

Startup items that should **STAY ENABLED**:
- `OpenVPN-GUI` — required for VPN
- `OneDrive` — file sync
- `SecurityHealth` — Windows Security
- `RtkAudUService` — audio driver
- `com.squirrel.slack.slack` — Slack (daily use)

```powershell
# Disable specific startup entries
$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
@("com.squirrel.FathomVideo.Fathom", "Logitech Download Assistant", "GoogleChromeAutoLaunch_*") | ForEach-Object {
    $props = Get-ItemProperty $runKey -ErrorAction SilentlyContinue
    $props.PSObject.Properties | Where-Object { $_.Name -like $_ } | ForEach-Object {
        Remove-ItemProperty $runKey -Name $_.Name -ErrorAction SilentlyContinue
        Write-Host "Disabled: $($_.Name)"
    }
}
# Disable Copilot desktop (pattern match)
Get-ItemProperty $runKey | ForEach-Object { $_.PSObject.Properties } | Where-Object { $_.Name -like "MicrosoftCopilotAutoLaunch*" } | ForEach-Object { Remove-ItemProperty $runKey -Name $_.Name -ErrorAction SilentlyContinue ; Write-Host "Disabled: $($_.Name)" }
```

### Phase 5 — Identify & Uninstall Unused Apps (ASK FIRST)

Apps previously identified as removable:
- **Cursor** — uninstall + remove `AppData\Roaming\Cursor` (can be 10-16 GB!)
- **TeamViewer** — if not actively used
- **Zoom** — if not actively used
- **Fathom** — meeting recorder not needed
- **SSMS** — if SQL Object Explorer in VS is sufficient
- **Old QuickBooks versions** (keep only current)

Always confirm with user before uninstalling.

```powershell
# Find installed apps
Get-ItemProperty "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*","HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*","HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*" -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | Select-Object DisplayName, DisplayVersion, InstallDate, @{N='SizeMB';E={[math]::Round($_.EstimatedSize/1024,0)}} | Sort-Object DisplayName | Format-Table -AutoSize
```

---

## Thresholds & Alerts

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| C: Free Space | > 50 GB | 30-50 GB | < 30 GB |
| RAM Used % | < 70% | 70-85% | > 85% |
| CPU Load | < 50% | 50-75% | > 75% |
| Process Count | < 250 | 250-350 | > 350 |
| Uptime | < 3 days | 3-7 days | > 7 days (suggest restart) |

## Previous Cleanup Results (May 2026)

| Item | Space Freed |
|------|-------------|
| Cursor app + cache | ~16.3 GB |
| User Temp | 2.2 GB |
| .NET bin/obj | 1.9 GB |
| uv Python cache | 980 MB |
| Copilot Desktop cache | 776 MB |
| NuGet cache | 3.2 GB |
| CrashDumps | 370 MB |
| npm cache | 171 MB |
| Browser caches | ~400 MB |
| **Total** | **~24.4 GB** |

## Safety Rules

- **NEVER** delete protected folders listed above
- **NEVER** delete Documents, Videos, or user data without explicit permission
- **NEVER** uninstall apps without user confirmation
- **NEVER** modify partitions without explicit instruction
- **ASK** before clearing developer caches > 1 GB (NuGet, npm)
- Temp files, browser caches, CrashDumps, Prefetch = always safe to clear
