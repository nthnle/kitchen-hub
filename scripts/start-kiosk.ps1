# Runs at sign-in (via the Startup folder shortcut that setup.ps1 creates).
# Starts the Kitchen Hub server, restarting it if it ever stops, then opens the display full screen.
param([switch]$Watchdog)

$root = Split-Path $PSScriptRoot -Parent
$config = Get-Content (Join-Path $root 'config.json') -Raw | ConvertFrom-Json
$port = if ($config.port) { $config.port } else { 8080 }
$log = Join-Path $root 'data\server.log'

if ($Watchdog) {
    while ($true) {
        "$(Get-Date -Format s) starting server" | Out-File $log -Append -Encoding utf8
        $p = Start-Process node -ArgumentList 'server.js' -WorkingDirectory $root -WindowStyle Hidden -PassThru `
            -RedirectStandardError (Join-Path $root 'data\server-error.log')
        $null = $p.Handle  # keeps the handle so ExitCode is available afterwards
        $p.WaitForExit()
        "$(Get-Date -Format s) server stopped (exit $($p.ExitCode)); restarting in 5s" | Out-File $log -Append -Encoding utf8
        Start-Sleep -Seconds 5
    }
}

# Start the watchdog in its own hidden window unless the server is already up.
function Test-Hub { try { Invoke-RestMethod "http://localhost:$port/api/version" -TimeoutSec 2 | Out-Null; $true } catch { $false } }
# A busy server (e.g. receiving a big video) can miss the 2-second check, so also look for a watchdog
# that's already running; a second one would just crash over and over on the port the first one holds.
function Test-Watchdog { [bool](Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'start-kiosk\.ps1.*-Watchdog' }) }
if (-not (Test-Hub) -and -not (Test-Watchdog)) {
    Start-Process powershell -WindowStyle Hidden -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Watchdog')
    for ($i = 0; $i -lt 60 -and -not (Test-Hub); $i++) { Start-Sleep -Seconds 1 }
}

# --app gives a window with no address bar; --start-fullscreen fills the screen.
# Streaming links open in a normal Edge window on top, so signing in to Netflix etc. is remembered.
# --autoplay-policy lets slideshow videos play with sound ("videoSound": true) before anyone has tapped the screen.
# --disable-direct-composition-video-overlays: older Intel graphics flicker when Edge hands videos to the
# display's video overlay and takes them back (fades, the clock on top); drawing them normally avoids it.
Start-Process msedge -ArgumentList @("--app=http://localhost:$port", '--start-fullscreen', '--no-first-run', '--disable-features=Translate', '--autoplay-policy=no-user-gesture-required', '--disable-direct-composition-video-overlays')

# Edge ignores --start-fullscreen when it's already running in the background
# ("startup boost"), so check the window and press F11 for it if needed.
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class KioskWin {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
}
'@
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    $win = Get-Process msedge -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like 'Kitchen Hub*' } | Select-Object -First 1
    if (-not $win) { continue }
    Start-Sleep -Seconds 2 # let the window settle
    $r = New-Object KioskWin+RECT
    [void][KioskWin]::GetWindowRect($win.MainWindowHandle, [ref]$r)
    $full = ($r.R - $r.L) -ge $screen.Width -and ($r.B - $r.T) -ge $screen.Height -and $r.T -ge $screen.Top
    if (-not $full) {
        [void][KioskWin]::SetForegroundWindow($win.MainWindowHandle)
        Start-Sleep -Milliseconds 300
        [System.Windows.Forms.SendKeys]::SendWait('{F11}')
    }
    break
}
