# =============================================================================
#  365-Email-Monitoring-Dashboard — Uninstaller
#  Run this script as Administrator
# =============================================================================

$InstallDir   = "C:\365-Email-Monitoring-Dashboard"
$ShortcutName = "365-Email-Monitoring-Dashboard.lnk"

# --- Banner ---
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║     365 Email Monitoring Dashboard  —  Uninstaller      ║" -ForegroundColor Cyan
Write-Host "  ║                    3Fold IT, LLC                        ║" -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "  This will stop the app, remove all stored credentials," -ForegroundColor Yellow
Write-Host "  delete the desktop shortcut, and remove the install folder." -ForegroundColor Yellow
Write-Host ""

$confirm = Read-Host "  Are you sure you want to uninstall? (Y/N)"
if ($confirm -notmatch '^[Yy]$') {
    Write-Host ""
    Write-Host "  Uninstall cancelled." -ForegroundColor Yellow
    exit 0
}

Write-Host ""

# --- Require Administrator ---
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "ERROR: Please run this script as Administrator." -ForegroundColor Red
    exit 1
}

# =============================================================================
# STEP 1 — Stop running servers
# =============================================================================
Write-Host "[1/3] Stopping servers if running..." -ForegroundColor Cyan

foreach ($port in @(3000, 5173)) {
    try {
        $lines = netstat -ano 2>$null | Select-String ":$port\s" | Select-String "LISTENING"
        foreach ($line in $lines) {
            $pidValue = ($line.ToString().Trim() -split '\s+')[-1]
            if ($pidValue -match '^\d+$' -and $pidValue -ne '0') {
                Stop-Process -Id ([int]$pidValue) -Force -ErrorAction Stop
                Write-Host "    Stopped process on port $port (PID $pidValue)" -ForegroundColor Green
            }
        }
    } catch {
        Write-Host "    Could not stop process on port $port — $_" -ForegroundColor Yellow
    }
}

# =============================================================================
# STEP 2 — Clear stored credentials
# =============================================================================
Write-Host ""
Write-Host "[2/3] Clearing stored credentials..." -ForegroundColor Cyan

$nodeAvailable = $false
try { & node --version 2>$null | Out-Null; $nodeAvailable = $true } catch {}

if ($nodeAvailable -and (Test-Path "$InstallDir\scripts\clear-credentials.js")) {
    & node "$InstallDir\scripts\clear-credentials.js"
} else {
    # Fallback: remove entries directly via cmdkey
    foreach ($target in @("DLMonitorDashboard/client_secret", "DLMonitorDashboard/settings_password")) {
        cmdkey /delete:$target 2>$null | Out-Null
    }
}
Write-Host "    Credentials cleared." -ForegroundColor Green

# =============================================================================
# STEP 3 — Remove shortcut and install folder
# =============================================================================
Write-Host ""
Write-Host "[3/3] Removing files..." -ForegroundColor Cyan

# Remove desktop shortcut from all possible locations
$desktopRoots = @($env:OneDriveCommercial, $env:OneDrive, $env:OneDriveConsumer,
                  $env:USERPROFILE, [Environment]::GetFolderPath("CommonDesktopDirectory"))

foreach ($root in ($desktopRoots | Where-Object { $_ } | Select-Object -Unique)) {
    $lnk = "$root\Desktop\$ShortcutName"
    if (Test-Path $lnk) {
        Remove-Item $lnk -Force
        Write-Host "    Removed shortcut: $lnk" -ForegroundColor Green
    }
}

# Remove install folder
if (Test-Path $InstallDir) {
    Remove-Item $InstallDir -Recurse -Force
    Write-Host "    Removed folder:   $InstallDir" -ForegroundColor Green
} else {
    Write-Host "    Install folder not found — nothing to remove." -ForegroundColor Yellow
}

# =============================================================================
# Done
# =============================================================================
Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "  Uninstall complete!" -ForegroundColor Green
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host ""
