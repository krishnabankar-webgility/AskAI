---
name: vpn-smb-access
description: "Use when: cannot access UNC path over VPN, network share not accessible from home, net use hangs, SMB share access denied, \\\\server\\share not opening, file share works at office but not remote, VPN connected but cannot browse shares, Kerberos authentication failed, MTU issue VPN, SMB negotiation timeout, net use hangs forever."
---

# VPN + SMB Network Share Access Fix

## When to Use

- You are connected to a VPN (Sophos, OpenVPN, Cisco AnyConnect, etc.)
- You can **ping** the server but `net use \\server\share` **hangs or fails**
- The share works from the office but not from a remote/home location
- You get: `The password is invalid`, `System error 53/64/67`, or the command just freezes
- Cannot access internal web services (Jenkins, web apps) over VPN
- RDP/Remote Desktop fails to connect to VMs over VPN

### Real-World Success Examples

This skill has successfully fixed:

1. **Jenkins access** — http://jenkins.webgility.com:8080 not loading (MTU 1200 + Private profile fixed HTTP over VPN)
2. **RDP to VMs** — Remote Desktop connection failing over VPN (network profile + Kerberos refresh)
3. **Multiple UNC paths** — `\\inwsfs02\UDInstaller` and other shares inaccessible from home (MTU + NTLM auth)

**Pattern**: Same MTU fix resolves HTTP, RDP, and SMB issues simultaneously.

---

## Root Causes (in order of frequency)

| # | Root Cause | Symptom |
|---|---|---|
| 1 | **MTU too high on VPN adapter** | `net use` hangs forever; TCP port 445 is open but SMB never completes |
| 2 | **No Kerberos tickets** (logged in before VPN connected) | `klist` shows 0 tickets; auth fails silently |
| 3 | **Network adapter on Public profile** | File sharing / NTLM blocked by Windows firewall |
| 4 | **Stale credentials in Credential Manager** | Wrong password cached for server |
| 5 | **Wrong VPN split-tunnel route** | Traffic to server subnet not routed through VPN |

---

## Step 1 — Gather Diagnostics

Run all at once to get full picture:

```powershell
# 1. Adapters & network profiles
Get-NetConnectionProfile | Format-Table Name, InterfaceAlias, NetworkCategory, IPv4Connectivity

# 2. VPN adapter IP
Get-NetIPAddress | Where-Object AddressFamily -eq 'IPv4' | Format-Table InterfaceAlias, IPAddress, PrefixLength

# 3. DNS resolve the server
[System.Net.Dns]::GetHostAddresses("inwsfs02")   # replace hostname

# 4. Check SMB port (TCP 445) is reachable
Test-NetConnection -ComputerName <server-ip> -Port 445 -WarningAction SilentlyContinue

# 5. Check Kerberos tickets
$r = & cmd /c "klist 2>&1"; $r | ForEach-Object { $_ }

# 6. Routing to server subnet
route print | Select-String "192.168."   # adjust subnet

# 7. Current MTU on VPN adapter
netsh interface ipv4 show subinterface

# 8. Stored credentials
cmdkey /list | Select-String -Pattern "Target:|User:" -Context 0,1
```

---

## Step 2 — Fix: MTU Issue (Most Common Root Cause)

**Diagnosis**: `net use` hangs, but `Test-NetConnection -Port 445` returns `TcpTestSucceeded = True`.

This means TCP handshake works (small packets) but SMB negotiation packets (large) are silently dropped by the VPN tunnel.

### Find actual working MTU

```powershell
# Test with DF-bit set — find highest payload that gets a reply
cmd /c "ping -n 1 -f -l 1200 <server-ip>"   # if reply → good
cmd /c "ping -n 1 -f -l 1300 <server-ip>"   # if timeout → too big
# Binary search between 1200-1400 to find exact boundary
# Max working MTU = payload + 28 (IP + ICMP headers)
```

### Apply the fix (requires UAC / admin elevation)

```powershell
# Get the VPN adapter name first
Get-NetAdapter | Where-Object Status -eq 'Up'

# Set MTU to safe value (payload limit + 28, round down to nearest 50)
# For Sophos/OpenVPN a safe value is typically 1200–1350
Start-Process -FilePath "netsh" `
  -ArgumentList 'interface ipv4 set subinterface "OpenVPN TAP-Windows6" mtu=1200 store=persistent' `
  -Verb RunAs -Wait

# Verify
netsh interface ipv4 show subinterface | Select-String "OpenVPN"
```

> **Known values for this environment:**
> VPN adapter: `OpenVPN TAP-Windows6` | Working MTU: **1200** | Server: `inwsfs02` (192.168.0.95)

---

## Step 3 — Fix: No Kerberos Tickets

**Diagnosis**: `klist` shows `Cached Tickets: (0)` AND `klist get krbtgt/CORP` fails with `No authority could be contacted`.

This happens when you log in to Windows with cached creds (offline/home), then connect VPN later. Your logon session has no live Kerberos tokens.

### Option A — Use explicit credentials with `net use`

```powershell
# Works via NTLM fallback — does NOT require Kerberos
net use \\<server>\<share> /user:<DOMAIN>\<username> "<password>"

# Example:
net use \\inwsfs02\UDInstaller /user:CORP\krishna.bankar "Password@123"
```

### Option B — Lock & Unlock workstation (gets fresh TGT)

```powershell
# Lock workstation — unlock with your domain password while VPN is connected
rundll32.exe user32.dll,LockWorkStation
# After unlocking, check: klist should now show tickets
```

---

## Step 4 — Fix: VPN Adapter on Public Network Profile

**Diagnosis**: `Get-NetConnectionProfile` shows VPN adapter as `NetworkCategory = Public`.

```powershell
# Change VPN adapter to Private
Set-NetConnectionProfile -InterfaceAlias "OpenVPN TAP-Windows6" -NetworkCategory Private

# Verify
Get-NetConnectionProfile | Format-Table InterfaceAlias, NetworkCategory
```

---

## Step 5 — Fix: Stale Credentials

**Diagnosis**: `cmdkey /list` shows an old entry for the server with wrong credentials.

```powershell
# Remove stale entry
cmdkey /delete:<servername>         # e.g. cmdkey /delete:inwsfs02
cmdkey /delete:<server-ip>          # also try by IP

# Re-add correct credentials
cmdkey /add:<servername> /user:<DOMAIN>\<username> /pass:<password>
```

---

## Step 6 — Verify & Clean Up

```powershell
# Test: should complete immediately with "The command completed successfully."
net use \\inwsfs02\UDInstaller /user:CORP\krishna.bankar "<password>"

# List directory to confirm access
dir \\inwsfs02\UDInstaller | Select-Object -First 10

# Open in Explorer
explorer.exe "\\inwsfs02\UDInstaller"

# Check active connections
net use

# Clean up any stored credentials used only for this session
cmdkey /delete:<servername>
```

---

## Environment Notes (corp.webgility.com)

| Item | Value |
|---|---|
| Domain | `CORP` / `corp.webgility.com` |
| Domain Controller | `INWSDC01` @ `192.168.0.51` |
| File Server | `inwsfs02` @ `192.168.0.95` |
| VPN Adapter | `OpenVPN TAP-Windows6` |
| VPN IP assigned | `192.168.100.x` subnet |
| Route to office subnet | `192.168.0.0/16` via `192.168.100.1` |
| Working MTU | **1200** (anything above causes silent packet drop) |
| DNS servers (VPN) | `192.168.0.51`, `192.168.0.70` |
| Domain user | `CORP\krishna.bankar` |

---

## Full Automated Fix Script

Use this when the issue is a confirmed VPN+SMB access problem on this machine:

```powershell
param(
    [string]$Share = "\\inwsfs02\UDInstaller",
    [string]$User = "CORP\krishna.bankar",
    [string]$Pass = "",           # pass in at runtime, never hardcode
    [string]$VPNAdapter = "OpenVPN TAP-Windows6",
    [int]$MTU = 1200
)

Write-Host "=== Step 1: Set VPN network to Private ===" -ForegroundColor Cyan
Set-NetConnectionProfile -InterfaceAlias $VPNAdapter -NetworkCategory Private -ErrorAction SilentlyContinue

Write-Host "=== Step 2: Fix MTU (requires admin) ===" -ForegroundColor Cyan
Start-Process -FilePath "netsh" `
  -ArgumentList "interface ipv4 set subinterface `"$VPNAdapter`" mtu=$MTU store=persistent" `
  -Verb RunAs -Wait

Write-Host "=== Step 3: Clear stale net use connections ===" -ForegroundColor Cyan
net use * /delete /y 2>$null

Write-Host "=== Step 4: Map the share ===" -ForegroundColor Cyan
if ($Pass) {
    net use $Share /user:$User $Pass
} else {
    $cred = Get-Credential -UserName $User -Message "Enter your domain password"
    net use $Share /user:$User $cred.GetNetworkCredential().Password
}

Write-Host "=== Step 5: Verify ===" -ForegroundColor Cyan
net use
dir $Share | Select-Object -First 5
```
