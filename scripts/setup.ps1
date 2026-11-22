# One-time setup on the kitchen PC. Run in PowerShell as administrator:
#   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Host 'Please run this from an administrator PowerShell window.' -ForegroundColor Yellow; exit 1 }

# 1. Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host 'Installing Node.js...'
    winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-source-agreements --accept-package-agreements
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
Write-Host "Node $(node --version)"

# 2. Packages and config
npm install --omit=dev
if (-not (Test-Path config.json)) { Copy-Item config.example.json config.json; Write-Host 'Created config.json - edit it next.' }
$port = (Get-Content config.json -Raw | ConvertFrom-Json).port
if (-not $port) { $port = 8080 }

# 3. Let phones on the home network reach the phone page (private networks only)
if (-not (Get-NetFirewallRule -DisplayName 'Kitchen Hub' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName 'Kitchen Hub' -Direction Inbound -Protocol TCP -LocalPort $port -Profile Private -Action Allow | Out-Null
}
$net = Get-NetConnectionProfile | Where-Object { $_.IPv4Connectivity -ne 'Disconnected' }
foreach ($n in $net) {
    if ($n.NetworkCategory -ne 'Private') {
        Write-Host "Network '$($n.Name)' is set to Public; switching it to Private so phones can connect."
        Set-NetConnectionProfile -InterfaceIndex $n.InterfaceIndex -NetworkCategory Private
    }
}

# 3b. Stop Edge "startup boost" from keeping Edge running in the background,
#     which makes it ignore the full-screen setting when Kitchen Hub opens.
$edgePolicy = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge'
New-Item -Path $edgePolicy -Force | Out-Null
Set-ItemProperty -Path $edgePolicy -Name StartupBoostEnabled -Value 0 -Type DWord
Set-ItemProperty -Path $edgePolicy -Name BackgroundModeEnabled -Value 0 -Type DWord

# 4. Never sleep while plugged in
powercfg /change standby-timeout-ac 0
powercfg /change monitor-timeout-ac 0

# 5. Start at sign-in
$startup = [Environment]::GetFolderPath('Startup')
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut((Join-Path $startup 'Kitchen Hub.lnk'))
$lnk.TargetPath = 'powershell.exe'
$lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$root\scripts\start-kiosk.ps1`""
$lnk.WorkingDirectory = $root
$lnk.WindowStyle = 7
$lnk.Save()

Write-Host ''
Write-Host 'Done. Remaining manual steps (see README):' -ForegroundColor Green
Write-Host '  - Put your calendar links, family names and location in config.json'
Write-Host '  - Turn on automatic sign-in for this Windows account'
Write-Host '  - Open Edge once and sign in to Netflix, YouTube, etc.'
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*' } | Select-Object -First 1).IPAddress
if (-not $ip) { $ip = $env:COMPUTERNAME.ToLower() }
Write-Host "  - Phone page: http://$($env:COMPUTERNAME.ToLower()).local:$port/phone (or http://${ip}:$port/phone)"
