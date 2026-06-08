---
name: network-profile-fix
description: "Use when: network adapter stuck on Public, cannot change network to Private, file sharing not working, network discovery disabled, Windows says network is Public but should be Private, VPN adapter shows Public profile, cannot see other computers on network, HomeGroup or workgroup not working, SMB blocked by Public firewall profile."
---

# Network Profile Fix

## When to Use

- A network adapter (especially VPN) is set to **Public** but should be **Private**
- File sharing, network discovery, or SMB is blocked due to Public profile
- Windows firewall is blocking traffic based on Public profile rules

---

## Quick Diagnosis

```powershell
Get-NetConnectionProfile | Format-Table Name, InterfaceAlias, NetworkCategory, IPv4Connectivity
```

- `Public` → restricts file sharing, network discovery, NTLM/SMB
- `Private` → allows file sharing and domain-style auth
- `DomainAuthenticated` → auto-set when DC is reachable at login (ideal)

---

## Fix: Change Adapter Profile

```powershell
# Change a specific adapter to Private
Set-NetConnectionProfile -InterfaceAlias "<AdapterName>" -NetworkCategory Private

# Common adapter names:
# "OpenVPN TAP-Windows6"    — Sophos / OpenVPN VPN
# "Ethernet"                — Wired
# "Wi-Fi"                   — Wireless
# "Local Area Connection"   — Legacy wired

# Verify
Get-NetConnectionProfile | Format-Table InterfaceAlias, NetworkCategory
```

---

## Verify Firewall Rules After Change

After changing to Private, confirm File & Printer Sharing rules are enabled:

```powershell
Get-NetFirewallRule -DisplayGroup "File and Printer Sharing" |
  Where-Object { $_.Enabled -eq $true } |
  Format-Table DisplayName, Profile, Direction
```

Key rules to check are enabled:
- `File and Printer Sharing (SMB-In)` — Private, Domain
- `File and Printer Sharing (NB-Session-In)` — Private, Domain

---

## Notes

- Profile change takes effect immediately — no reboot needed
- VPN adapters often reset to Public on reconnect; re-apply after each VPN reconnect if needed
- For a permanent fix, ask your VPN admin to configure the VPN profile as DomainAuthenticated
