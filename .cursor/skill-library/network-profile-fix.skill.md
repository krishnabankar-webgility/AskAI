# Network Profile Fix (Public → Private)

## Skill Purpose
Change Windows network adapter profiles from Public to Private to enable file sharing, network discovery, and SMB/NTLM authentication.

## When to Use This Skill

- Network adapter (especially VPN) shows `NetworkCategory = Public` but should be `Private`
- File sharing is blocked or not working
- Network discovery is disabled
- Windows says "Public network" but you need file sharing capabilities
- VPN adapter defaults to Public after each connection
- Cannot see other computers on the network
- HomeGroup or workgroup features not working
- SMB/NTLM protocols blocked by Public profile firewall rules

---

## Network Profile Types Explained

| Profile | Firewall Behavior | Use Case |
|---|---|---|
| **Public** | 🔒 Restrictive — blocks file sharing, network discovery, SMB, NTLM | Coffee shops, airports, untrusted networks |
| **Private** | 🏠 Permissive — allows file sharing, network discovery, domain auth | Home, office, trusted networks |
| **DomainAuthenticated** | 🏢 Optimal — auto-set when domain controller reachable at login | Corporate domain-joined machines |

**Key Insight**: VPN adapters often default to Public for security, but this blocks the very file sharing you need over VPN.

---

## Quick Diagnosis

```powershell
Get-NetConnectionProfile | Format-Table Name, InterfaceAlias, NetworkCategory, IPv4Connectivity
```

**Look for:**
- VPN adapter showing `NetworkCategory = Public`
- Wi-Fi/Ethernet showing `Public` when it should be `Private`

**Example output:**
```
Name                 InterfaceAlias       NetworkCategory IPv4Connectivity
----                 --------------       --------------- ----------------
OpenVPN TAP-Windows6 OpenVPN TAP-Windows6 Public          LocalNetwork
Wi-Fi                Wi-Fi                Private         Internet
```

---

## Fix: Change Adapter to Private

### Single Adapter

```powershell
# Change a specific adapter to Private
Set-NetConnectionProfile -InterfaceAlias "<AdapterName>" -NetworkCategory Private

# Verify the change
Get-NetConnectionProfile | Format-Table InterfaceAlias, NetworkCategory
```

### Common Adapter Names

| Adapter Type | Common Names |
|---|---|
| **VPN** | `OpenVPN TAP-Windows6`, `Cisco AnyConnect`, `Sophos SSL VPN` |
| **Wired** | `Ethernet`, `Ethernet 2`, `Local Area Connection` |
| **Wireless** | `Wi-Fi`, `Wireless Network Connection` |

### Change All Public Adapters at Once

```powershell
# Find all adapters currently set to Public
Get-NetConnectionProfile | Where-Object NetworkCategory -eq 'Public' | Format-Table InterfaceAlias, Name

# Change all Public adapters to Private (use with caution)
Get-NetConnectionProfile | Where-Object NetworkCategory -eq 'Public' | ForEach-Object {
    Set-NetConnectionProfile -InterfaceIndex $_.InterfaceIndex -NetworkCategory Private
    Write-Host "Changed $($_.InterfaceAlias) to Private" -ForegroundColor Green
}
```

---

## Verification Steps

### 1. Verify Profile Changed

```powershell
Get-NetConnectionProfile | Format-Table InterfaceAlias, NetworkCategory
```

Expected: Adapter now shows `Private` instead of `Public`.

### 2. Verify Firewall Rules Enabled

After changing to Private, file sharing rules should be active:

```powershell
Get-NetFirewallRule -DisplayGroup "File and Printer Sharing" |
  Where-Object { $_.Enabled -eq $true } |
  Format-Table DisplayName, Profile, Direction
```

**Key rules to check:**
- ✅ `File and Printer Sharing (SMB-In)` — Private, Domain
- ✅ `File and Printer Sharing (NB-Session-In)` — Private, Domain
- ✅ `File and Printer Sharing (NB-Name-In)` — Private, Domain

### 3. Test File Sharing Works

```powershell
# Test accessing a network share
net use \\<server>\<share>

# Or test network discovery
net view \\<server>
```

---

## Troubleshooting

### Issue: "Cannot find the network path"

**Cause**: Even with Private profile, specific firewall rules might be disabled.

**Fix**: Enable file sharing rules manually:

```powershell
# Enable inbound SMB on Private profile
Enable-NetFirewallRule -DisplayGroup "File and Printer Sharing" -Profile Private
```

### Issue: VPN Adapter Resets to Public on Reconnect

**Cause**: VPN client or Windows resets the profile after each connection.

**Temporary Fix**: Run this after each VPN connection:

```powershell
Set-NetConnectionProfile -InterfaceAlias "OpenVPN TAP-Windows6" -NetworkCategory Private
```

**Permanent Fix**: Ask your IT/VPN administrator to:
1. Configure the VPN profile to mark the adapter as `Private` or `DomainAuthenticated`
2. Deploy a Group Policy to set network location for VPN connections
3. Use PowerShell logon script to auto-set profile after VPN connects

### Issue: No Permission to Change Profile

**Cause**: Requires administrator privileges.

**Fix**: Run PowerShell as Administrator:

```powershell
# Open elevated PowerShell window
Start-Process powershell -Verb RunAs

# Then run the Set-NetConnectionProfile command
```

---

## Advanced: Set via Registry (Alternative Method)

If `Set-NetConnectionProfile` fails, you can set it via registry (requires admin + reboot):

```powershell
# Find the network profile GUID
Get-NetConnectionProfile | Format-Table InterfaceAlias, Name, InterfaceIndex

# Set category in registry (1 = Private, 0 = Public)
# Replace {GUID} with actual profile GUID from:
# HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\NetworkList\Profiles\
Set-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\NetworkList\Profiles\{GUID}" `
  -Name "Category" -Value 1

# Restart network adapter
Restart-NetAdapter -Name "OpenVPN TAP-Windows6"
```

---

## Automated Fix Script

```powershell
param(
    [string]$AdapterName = "OpenVPN TAP-Windows6",
    [switch]$AllPublicAdapters
)

if ($AllPublicAdapters) {
    Write-Host "Changing ALL Public adapters to Private..." -ForegroundColor Yellow
    Get-NetConnectionProfile | Where-Object NetworkCategory -eq 'Public' | ForEach-Object {
        Set-NetConnectionProfile -InterfaceIndex $_.InterfaceIndex -NetworkCategory Private
        Write-Host "✅ Changed $($_.InterfaceAlias) to Private" -ForegroundColor Green
    }
} else {
    Write-Host "Changing adapter '$AdapterName' to Private..." -ForegroundColor Cyan
    Set-NetConnectionProfile -InterfaceAlias $AdapterName -NetworkCategory Private
    Write-Host "✅ Changed $AdapterName to Private" -ForegroundColor Green
}

Write-Host "`nCurrent network profiles:" -ForegroundColor Cyan
Get-NetConnectionProfile | Format-Table InterfaceAlias, NetworkCategory, IPv4Connectivity

Write-Host "`nVerifying file sharing rules are enabled..." -ForegroundColor Cyan
$rules = Get-NetFirewallRule -DisplayGroup "File and Printer Sharing" |
  Where-Object { $_.Enabled -eq $true -and $_.Profile -match 'Private' }

if ($rules.Count -gt 0) {
    Write-Host "✅ File sharing rules are active" -ForegroundColor Green
} else {
    Write-Host "⚠️  File sharing rules might need to be enabled manually" -ForegroundColor Yellow
}
```

**Usage:**

```powershell
# Single adapter
.\network-profile-fix.ps1 -AdapterName "OpenVPN TAP-Windows6"

# All Public adapters
.\network-profile-fix.ps1 -AllPublicAdapters
```

---

## Notes & Best Practices

✅ **No reboot required** — profile change takes effect immediately
✅ **Safe on trusted networks** — only use Private on VPNs and trusted LANs
✅ **Reversible** — change back to Public with `-NetworkCategory Public`
⚠️ **VPN adapters often reset** — may need to re-apply after each VPN reconnect
⚠️ **Don't use Private on public Wi-Fi** — keep coffee shop networks as Public

## Environment-Specific Notes (corp.webgility.com)

| Item | Recommended Setting |
|---|---|
| **VPN Adapter** (`OpenVPN TAP-Windows6`) | Private |
| **Office Ethernet/Wi-Fi** | Private or DomainAuthenticated |
| **Home Wi-Fi** | Private (if trusted) |
| **Public Wi-Fi** | Public (always) |

---

## Success Indicators

✅ Adapter shows `NetworkCategory = Private`
✅ File sharing firewall rules enabled for Private profile
✅ `net use \\server\share` works without hanging
✅ Network discovery shows other computers
✅ Can browse network shares in File Explorer
