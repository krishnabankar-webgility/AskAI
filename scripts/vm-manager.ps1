# VM Manager — wgin-vm-kishnab02 (192.168.0.141)
# Usage: .\vm-manager.ps1 <action>
# Actions: status, connect, restart, vpn-check, vpn-connect, full-setup, exec, info

param(
    [Parameter(Position=0)]
    [ValidateSet("status","connect","restart","vpn-check","vpn-connect","full-setup","exec","info")]
    [string]$Action = "status",

    [Parameter(Position=1, ValueFromRemainingArguments)]
    [string[]]$ExecArgs
)

$VmIp = "192.168.0.141"
$VmName = "unifytest-kibana"
$VpnName = "111.118.255.21"
$SccliPath = "C:\Program Files (x86)\Sophos\Connect\sccli.exe"

function Get-RdpCreds {
    $un = [System.Environment]::GetEnvironmentVariable("RDP_UN", "User")
    $pw = [System.Environment]::GetEnvironmentVariable("RDP_PWD", "User")
    if (-not $un -or -not $pw) { throw "RDP_UN / RDP_PWD not set in User env vars" }
    return @{ User = $un; Pass = $pw }
}

function Test-VpnConnected {
    $out = & $SccliPath get -n $VpnName -t endpoints 2>&1 | Out-String
    return $out -match "Connected: \d+ \("
}

function Connect-Vpn {
    if (Test-VpnConnected) { Write-Host "VPN already connected." -ForegroundColor Green; return $true }
    Write-Host "Connecting VPN..." -ForegroundColor Yellow
    $creds = Get-RdpCreds
    # VPN uses same creds
    & $SccliPath enable -n $VpnName -u ($creds.User -replace ".*\\","") -p $creds.Pass 2>&1 | Out-Null
    Start-Sleep -Seconds 3
    if (Test-VpnConnected) { Write-Host "VPN connected." -ForegroundColor Green; return $true }
    else { Write-Host "VPN connection FAILED." -ForegroundColor Red; return $false }
}

function Test-VmReachable {
    $t = New-Object Net.Sockets.TcpClient
    try {
        $c = $t.BeginConnect($VmIp, 3389, $null, $null)
        $ok = $c.AsyncWaitHandle.WaitOne(2000, $false)
        return $ok
    } catch { return $false }
    finally { try { $t.Close() } catch {} }
}

function Show-Status {
    Write-Host "`n=== VM Manager: $VmName ($VmIp) ===" -ForegroundColor Cyan
    
    # VPN
    $vpn = Test-VpnConnected
    Write-Host "  VPN:       $(if($vpn){'Connected'}else{'Disconnected'})" -ForegroundColor $(if($vpn){'Green'}else{'Red'})
    
    # VM reachability
    if ($vpn) {
        $rdp = Test-VmReachable
        Write-Host "  RDP 3389:  $(if($rdp){'Open'}else{'Closed'})" -ForegroundColor $(if($rdp){'Green'}else{'Red'})
        
        # Check other ports
        foreach ($port in @(445, 5601, 9200, 80)) {
            $t = New-Object Net.Sockets.TcpClient
            try { $c=$t.BeginConnect($VmIp,$port,$null,$null); $ok=$c.AsyncWaitHandle.WaitOne(1000,$false) } catch { $ok=$false }
            finally { try{$t.Close()}catch{} }
            $label = switch($port) { 445{"SMB"} 5601{"Kibana"} 9200{"ElasticSearch"} 80{"HTTP"} }
            if ($ok) { Write-Host "  ${label} ${port}:$((' '*(10-$label.Length)))Open" -ForegroundColor Green }
        }
    } else {
        Write-Host "  (VPN disconnected — cannot reach VM)" -ForegroundColor DarkGray
    }
    
    # Credential Manager
    $cred = cmdkey /list | Select-String "192.168.0.141"
    Write-Host "  Creds:     $(if($cred){'Stored in Credential Manager'}else{'NOT stored'})" -ForegroundColor $(if($cred){'Green'}else{'Yellow'})
    Write-Host ""
}

function Connect-Rdp {
    $creds = Get-RdpCreds
    # Ensure creds in Credential Manager
    cmdkey /generic:TERMSRV/$VmIp /user:"$($creds.User)" /pass:"$($creds.Pass)" | Out-Null
    Start-Process mstsc -ArgumentList "/v:$VmIp"
    Write-Host "RDP session launched." -ForegroundColor Green
}

function Restart-Vm {
    param([int]$DelaySeconds = 10)
    Write-Host "Scheduling remote restart of $VmName in $DelaySeconds seconds..." -ForegroundColor Yellow
    $result = shutdown /m \\$VmIp /r /t $DelaySeconds /c "Restart initiated by agent" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Restart scheduled. VM will reboot in $DelaySeconds seconds." -ForegroundColor Green
        Write-Host "To abort: shutdown /m \\$VmIp /a" -ForegroundColor DarkGray
    } else {
        Write-Host "Restart failed: $result" -ForegroundColor Red
    }
}

function Invoke-FullSetup {
    Write-Host "`n=== Full Setup: VPN + Credentials + RDP ===" -ForegroundColor Cyan
    
    # 1. VPN
    if (-not (Connect-Vpn)) { return }
    
    # 2. Wait for VM
    Write-Host "Waiting for VM RDP port..." -ForegroundColor Yellow
    $attempts = 0
    while (-not (Test-VmReachable) -and $attempts -lt 10) {
        Start-Sleep -Seconds 3
        $attempts++
        Write-Host "  Attempt $attempts/10..." -ForegroundColor DarkGray
    }
    if (-not (Test-VmReachable)) {
        Write-Host "VM not reachable on RDP port after 30s. It may be powered off." -ForegroundColor Red
        return
    }
    
    # 3. Store creds + launch RDP
    Connect-Rdp
}

function Get-VmCredential {
    $un = [System.Environment]::GetEnvironmentVariable("RDP_UN", "User")
    $pw = ConvertTo-SecureString ([System.Environment]::GetEnvironmentVariable("RDP_PWD", "User")) -AsPlainText -Force
    return New-Object PSCredential("$VmIp\webgility", $pw)
}

function Invoke-RemoteCommand {
    param([string]$Command)
    $cred = Get-VmCredential
    Invoke-Command -ComputerName $VmIp -Credential $cred -ScriptBlock ([ScriptBlock]::Create($Command))
}

function Show-VmInfo {
    Write-Host "`n=== VM System Info ===" -ForegroundColor Cyan
    $cred = Get-VmCredential
    Invoke-Command -ComputerName $VmIp -Credential $cred -ScriptBlock {
        $os = Get-CimInstance Win32_OperatingSystem
        $cs = Get-CimInstance Win32_ComputerSystem
        $disk = Get-PSDrive C
        Write-Host "  Hostname:   $(hostname)"
        Write-Host "  OS:         $($os.Caption)"
        Write-Host "  RAM:        $([math]::Round($cs.TotalPhysicalMemory/1GB,1)) GB"
        Write-Host "  Disk C:     $([math]::Round($disk.Free/1GB,1)) GB free / $([math]::Round(($disk.Used+$disk.Free)/1GB,1)) GB total"
        Write-Host "  Uptime:     $([math]::Round(((Get-Date) - $os.LastBootUpTime).TotalHours,1)) hours"
        Write-Host "  Boot:       $($os.LastBootUpTime)"
    }
    Write-Host ""
}

# Execute
switch ($Action) {
    "status"      { Show-Status }
    "connect"     { Connect-Rdp }
    "restart"     { Restart-Vm }
    "vpn-check"   { if (Test-VpnConnected) { "VPN: Connected" } else { "VPN: Disconnected" } }
    "vpn-connect" { Connect-Vpn }
    "full-setup"  { Invoke-FullSetup }
    "info"        { Show-VmInfo }
    "exec"        { if ($ExecArgs) { Invoke-RemoteCommand ($ExecArgs -join " ") } else { Write-Host "Usage: vm-manager.ps1 exec '<command>'" } }
}
