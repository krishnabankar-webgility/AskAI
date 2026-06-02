# Remote VM Management (PSRemoting / RDP / WinRM)

## Skill Purpose
Manage remote Windows VMs over VPN — PSRemoting (WinRM), RDP auto-connect, remote restart, and command execution. Covers initial setup, common failures, and the vm-manager toolkit.

## When to Use This Skill

- RDP to internal VM fails over VPN
- Need to run commands on a remote Windows VM
- PSRemoting (WinRM) returns "Access Denied" or "WinRM cannot process"
- Need to restart a VM remotely
- Setting up first-time WinRM access to a Windows machine
- `Invoke-Command` or `Enter-PSSession` failures

---

## Infrastructure Reference

| VM | IP | DNS | OS | Purpose |
|----|----|----|----|----|
| `wgin-vm-kishnab02` | `192.168.0.141` | `unifytest-kibana` | Windows 11 Pro | Dev/Test — Kibana, ES |

| Network | Detail |
|---------|--------|
| VPN | Sophos Connect SSL VPN, gateway `111.118.255.21:8443 UDP` |
| VPN tunnel IP | `192.168.100.x` (varies) |
| VPN route | `192.168.0.0/16` via tunnel gateway |
| Local domain | `corp.webgility.com` |

---

## VM Manager Script

Location: `scripts/vm-manager.ps1` (tracked in repo)

```
Usage: .\scripts\vm-manager.ps1 <action> [args]

Actions:
  status       — Show VPN/VM/port/credential status
  connect      — Store creds + launch RDP
  restart      — Remote reboot (shutdown /r via PSRemoting)
  vpn-check    — Quick VPN connected check
  vpn-connect  — Connect VPN via sccli
  full-setup   — VPN + wait for VM + RDP
  exec <cmd>   — Run arbitrary PowerShell on VM via Invoke-Command
  info         — Show hostname, OS, RAM, disk, uptime via PSRemoting
```

**Credentials**: Read from User-level env vars `RDP_UN` and `RDP_PWD` (NOT Process-level).
```powershell
# Correct way to read User-level env vars in scripts:
[System.Environment]::GetEnvironmentVariable("RDP_UN", "User")
# WRONG: $env:RDP_UN  ← this reads Process-level only
```

---

## Root Causes — RDP/PSRemoting Failures (Ordered by Frequency)

| # | Root Cause | Symptom | Fix |
|---|---|---|---|
| 1 | **VPN disconnected** | Cannot reach VM at all, ping fails | Connect VPN via `sccli enable` |
| 2 | **VM powered off** | Ping timeout, all ports closed | Power on via hypervisor or ask someone on-site |
| 3 | **WinRM not enabled on VM** | `Test-WSMan` fails, port 5985 closed | Enable-PSRemoting on VM (one-time, requires console/RDP) |
| 4 | **UAC token filtering (LocalAccountTokenFilterPolicy)** | WinRM returns `Access Denied` despite correct creds | Set registry key on VM (requires reboot) |
| 5 | **Client TrustedHosts not configured** | Error: "WinRM client cannot process... not in TrustedHosts" | Set TrustedHosts on local machine (elevated) |
| 6 | **AllowUnencrypted=false** | Error: "WinRM cannot process... unencrypted traffic" | Enable on BOTH client and server |
| 7 | **Firewall blocking WinRM** | Port 5985 closed but VM is reachable on other ports | Add firewall rule on VM |
| 8 | **Wrong credential format** | Access denied even with correct password | Use `<IP>\<username>` format, NOT domain format |

---

## STEP 1: Diagnose Remote Access

```powershell
# 1. Check VPN is connected
& "C:\Program Files (x86)\Sophos\Connect\sccli.exe" get -n "111.118.255.21" -t endpoints

# 2. Check VM reachable (ping)
Test-Connection -ComputerName 192.168.0.141 -Count 2 -Quiet

# 3. Check RDP port (3389)
Test-NetConnection -ComputerName 192.168.0.141 -Port 3389

# 4. Check WinRM port (5985)
Test-NetConnection -ComputerName 192.168.0.141 -Port 5985

# 5. Test WinRM handshake
Test-WSMan -ComputerName 192.168.0.141

# 6. Test PSRemoting
$pw = ConvertTo-SecureString "webgility@2020" -AsPlainText -Force
$cred = New-Object PSCredential("192.168.0.141\webgility", $pw)
Invoke-Command -ComputerName 192.168.0.141 -Credential $cred -ScriptBlock { hostname }
```

---

## STEP 2: First-Time WinRM Setup on Remote VM

**Prerequisite**: Must have RDP or console access to the VM first.

### On the VM (elevated PowerShell):

```powershell
# 1. Enable PSRemoting (starts WinRM, configures listeners)
Enable-PSRemoting -Force -SkipNetworkProfileCheck

# 2. Allow unencrypted traffic (required for non-domain workgroup auth)
Set-Item WSMan:\localhost\Service\AllowUnencrypted $true

# 3. Enable Basic auth (fallback)
Set-Item WSMan:\localhost\Service\Auth\Basic $true

# 4. Fix UAC token filtering for local accounts
# WITHOUT THIS, local admin accounts get Access Denied on remote WinRM
New-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" `
  -Name "LocalAccountTokenFilterPolicy" -Value 1 -PropertyType DWord -Force

# 5. Add firewall rule for WinRM HTTP
New-NetFirewallRule -DisplayName "WinRM-HTTP" -Direction Inbound -Protocol TCP -LocalPort 5985 -Action Allow

# 6. REBOOT (required for LocalAccountTokenFilterPolicy to take effect)
Restart-Computer -Force
```

### On the local machine (elevated PowerShell):

```powershell
# 1. Add VM to TrustedHosts (required for IP-based non-domain auth)
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "192.168.0.141" -Force

# 2. Allow unencrypted traffic on client side too
Set-Item WSMan:\localhost\Client\AllowUnencrypted $true

# 3. Enable Basic auth on client
Set-Item WSMan:\localhost\Client\Auth\Basic $true
```

---

## STEP 3: Fix Common PSRemoting Errors

### Error: "Access Denied"

**Root cause**: UAC Remote Access Token Filtering. Even if the account is in local Administrators group, WinRM strips the admin token for remote connections by default.

```powershell
# Fix on VM (requires reboot after):
Set-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" `
  -Name "LocalAccountTokenFilterPolicy" -Value 1
Restart-Computer -Force
```

### Error: "WinRM client cannot process the request... not in TrustedHosts"

```powershell
# Fix on LOCAL machine (elevated):
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "192.168.0.141" -Force
# To add multiple: -Value "192.168.0.141,192.168.0.142"
```

### Error: "Unencrypted traffic is currently disabled"

Both sides must allow it for non-HTTPS (port 5985) connections:

```powershell
# On VM:
Set-Item WSMan:\localhost\Service\AllowUnencrypted $true
# On local machine:
Set-Item WSMan:\localhost\Client\AllowUnencrypted $true
```

### Error: "The WinRM client sent a request... different authentication"

Use Negotiate (default) with `<IP>\<username>` format:
```powershell
$cred = New-Object PSCredential("192.168.0.141\webgility", $securePw)
# NOT: "DOMAIN\webgility" or "webgility@domain"
```

---

## STEP 4: Credential Management

### Store RDP credentials (auto-login):
```powershell
cmdkey /generic:TERMSRV/192.168.0.141 /user:"192.168.0.141\webgility" /pass:"webgility@2020"
cmdkey /generic:192.168.0.141 /user:"192.168.0.141\webgility" /pass:"webgility@2020"
```

### Store in User-level env vars (for scripts):
```powershell
[System.Environment]::SetEnvironmentVariable("RDP_UN", "192.168.0.141\webgility", "User")
[System.Environment]::SetEnvironmentVariable("RDP_PWD", "webgility@2020", "User")
```

### Read in scripts:
```powershell
# CORRECT (reads User-level):
$un = [System.Environment]::GetEnvironmentVariable("RDP_UN", "User")
# WRONG (reads Process-level only — will be empty in new terminals):
$un = $env:RDP_UN
```

---

## STEP 5: VPN Management via CLI

Sophos Connect CLI path: `C:\Program Files (x86)\Sophos\Connect\sccli.exe`

```powershell
# Check status
& "C:\Program Files (x86)\Sophos\Connect\sccli.exe" get -n "111.118.255.21" -t endpoints

# Connect (may use cached credentials if user/pass omitted)
& "C:\Program Files (x86)\Sophos\Connect\sccli.exe" enable -n "111.118.255.21"

# Disconnect
& "C:\Program Files (x86)\Sophos\Connect\sccli.exe" disable -n "111.118.255.21"
```

**Note**: VPN connection name is the gateway IP `111.118.255.21`, NOT a friendly name.

---

## Key Learnings / Gotchas

1. **$env:VAR is Process-level only** — User-level env vars set via `SetEnvironmentVariable("X","Y","User")` are NOT visible via `$env:X` in terminals spawned before the variable was set. Always use `[System.Environment]::GetEnvironmentVariable("X", "User")`.

2. **LocalAccountTokenFilterPolicy is the #1 WinRM blocker** — Without this registry key set to 1 on the VM, local admin accounts always get "Access Denied" on remote WinRM/WMI. Requires VM reboot after setting.

3. **AllowUnencrypted must be set on BOTH sides** — Setting it only on the server (VM) is not enough. The client also rejects unencrypted by default.

4. **Credential format matters** — For workgroup (non-domain) WinRM auth, use `<IP>\<username>` (e.g., `192.168.0.141\webgility`). Using domain format or just username fails.

5. **TrustedHosts requires elevation** — `Set-Item WSMan:\localhost\Client\TrustedHosts` needs an elevated PowerShell session. Non-elevated fails silently or errors.

6. **VPN sccli uses gateway IP as connection name** — Not a friendly name. Check with `sccli list`.

7. **Shutdown /m works without PSRemoting** — `shutdown /m \\192.168.0.141 /r /t 10` uses RPC, not WinRM. Works even if WinRM is not configured, as long as SMB port 445 is open and creds are stored.

---

## Security Notes

- `AllowUnencrypted=true` is acceptable for internal trusted network over VPN — NOT for production/internet-facing
- Credentials in env vars are visible to any process running as the same user
- `LocalAccountTokenFilterPolicy=1` reduces security posture — only set on dev/test VMs
