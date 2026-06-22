# =============================================================================
#  365-Email-Monitoring-Dashboard — Installer
#  Run this script as Administrator
# =============================================================================

$InstallDir  = "C:\365-Email-Monitoring-Dashboard"
$RepoZipUrl  = "https://github.com/3F-JohnIgna/365-Email-Monitoring-Dashboard/archive/refs/heads/main.zip"
$ZipTemp     = "$env:TEMP\365-EMD-download.zip"
$ExtractTemp = "$env:TEMP\365-EMD-extract"
$BatPath     = "$InstallDir\365-Email-Monitoring-Dashboard.bat"
$AppUrl      = "http://localhost:5173"

# --- Banner ---
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║       365 Email Monitoring Dashboard  —  Installer      ║" -ForegroundColor Cyan
Write-Host "  ║                    3Fold IT, LLC                        ║" -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# --- Install confirmation ---
$confirm = Read-Host "  Do you want to install 365 Email Monitoring Dashboard? (Y/N)"
if ($confirm -notmatch '^[Yy]$') {
    Write-Host ""
    Write-Host "  Installation cancelled." -ForegroundColor Yellow
    exit 0
}

function Write-Step($n, $msg) {
    Write-Host ""
    Write-Host "[$n/6] $msg" -ForegroundColor Cyan
}

# --- Require Administrator ---
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "ERROR: Please run this script as Administrator." -ForegroundColor Red
    exit 1
}

# =============================================================================
# STEP 1 — Download ZIP
# =============================================================================
Write-Step 1 "Downloading repository from GitHub..."
try {
    Invoke-WebRequest -Uri $RepoZipUrl -OutFile $ZipTemp -UseBasicParsing -ErrorAction Stop
    Write-Host "    Downloaded to $ZipTemp" -ForegroundColor Green
} catch {
    Write-Host "    ERROR: Download failed — $_" -ForegroundColor Red
    exit 1
}

# =============================================================================
# STEP 2 — Extract to C:\365-Email-Monitoring-Dashboard
# =============================================================================
Write-Step 2 "Extracting files to $InstallDir..."

if (Test-Path $ExtractTemp) { Remove-Item $ExtractTemp -Recurse -Force }
Expand-Archive -Path $ZipTemp -DestinationPath $ExtractTemp -Force

$ExtractedFolder = Get-ChildItem $ExtractTemp -Directory | Select-Object -First 1
if (-not $ExtractedFolder) {
    Write-Host "    ERROR: Could not find extracted folder." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}
Copy-Item "$($ExtractedFolder.FullName)\*" -Destination $InstallDir -Recurse -Force

Remove-Item $ZipTemp     -Force
Remove-Item $ExtractTemp -Recurse -Force

Write-Host "    Files extracted to $InstallDir" -ForegroundColor Green

# --- Remind user about .env ---
if (-not (Test-Path "$InstallDir\.env")) {
    Write-Host ""
    Write-Host "  NOTE: No .env file found. Copy .env.example to .env and fill in your" -ForegroundColor Yellow
    Write-Host "        Azure / M365 credentials before launching the app." -ForegroundColor Yellow
}

# =============================================================================
# STEP 3 — Verify / Install Node.js
# =============================================================================
Write-Step 3 "Checking Node.js..."

$nodeVersion = $null
try { $nodeVersion = & node --version 2>$null } catch {}

if ($nodeVersion) {
    Write-Host "    Node.js already installed: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "    Node.js is not installed. Installing now..." -ForegroundColor Yellow
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    ERROR: Winget install failed. Install Node.js manually from https://nodejs.org" -ForegroundColor Red
        exit 1
    }
    # Refresh PATH for current session
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path","User")
    $nodeVersion = $null
    try { $nodeVersion = & node --version 2>$null } catch {}
    Write-Host "    Node.js installed: $nodeVersion" -ForegroundColor Green
}

# =============================================================================
# STEP 4 — Install npm dependencies
# =============================================================================
Write-Step 4 "Installing project dependencies (npm install)..."
Push-Location $InstallDir
& npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "    ERROR: npm install failed." -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host "    Dependencies installed." -ForegroundColor Green

# Clear any credentials left over from a previous installation
Write-Host "    Clearing previous credentials..." -ForegroundColor Yellow
& node "$InstallDir\scripts\clear-credentials.js"
Write-Host "    Done." -ForegroundColor Green

# =============================================================================
# STEP 5 — Set admin password for Settings
# =============================================================================
Write-Step 5 "Setting admin password for Settings access..."

$pwMatch = $false
while (-not $pwMatch) {
    $pw1 = Read-Host "  Enter admin password" -AsSecureString
    $pw2 = Read-Host "  Confirm admin password" -AsSecureString

    $pw1Plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
                    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw1))
    $pw2Plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
                    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw2))

    if ($pw1Plain -ne $pw2Plain) {
        Write-Host "    Passwords do not match — try again." -ForegroundColor Yellow
    } elseif ($pw1Plain.Length -lt 4) {
        Write-Host "    Password must be at least 4 characters — try again." -ForegroundColor Yellow
    } else {
        $pwMatch = $true
    }
}

# Pipe password via stdin so it never appears as a process argument
$pw1Plain | & node "$InstallDir\scripts\set-password.js"
if ($LASTEXITCODE -ne 0) {
    Write-Host "    ERROR: Password could not be saved." -ForegroundColor Red
    exit 1
}
Write-Host "    Password saved." -ForegroundColor Green

# =============================================================================
# STEP 6 — Create launcher .bat + desktop shortcut
# =============================================================================
Write-Step 6 "Creating launcher and desktop shortcut..."

# .bat file
$batContent = @"
@echo off
title 365 Email Monitoring Dashboard
cd /d "C:\365-Email-Monitoring-Dashboard"

netstat -ano | findstr /C:":3000 " | findstr /I "LISTENING" > nul 2>&1
set "srv3000=%ERRORLEVEL%"

netstat -ano | findstr /C:":5173 " | findstr /I "LISTENING" > nul 2>&1
set "srv5173=%ERRORLEVEL%"

if "%srv3000%"=="0" if "%srv5173%"=="0" (
    echo Servers already running. Opening app...
    start "" "$AppUrl"
    exit /b 0
)

echo Starting 365 Email Monitoring Dashboard...
echo Server logs will appear below. Close this window to stop the app.
echo.
start "" cmd /k "npm run dev"
timeout /t 6 /nobreak > nul
start "" "$AppUrl"
"@
Set-Content -Path $BatPath -Value $batContent -Encoding ASCII
Write-Host "    Launcher created: $BatPath" -ForegroundColor Green

# Desktop shortcut — prefer OneDrive Desktop if it exists, then local, then Public
$DesktopPath = $null

# Check OneDrive (commercial first, then personal)
foreach ($oneDriveRoot in @($env:OneDriveCommercial, $env:OneDrive, $env:OneDriveConsumer)) {
    if ($oneDriveRoot -and (Test-Path "$oneDriveRoot\Desktop")) {
        $DesktopPath = "$oneDriveRoot\Desktop"
        Write-Host "    OneDrive Desktop detected: $DesktopPath" -ForegroundColor Green
        break
    }
}

# Fall back to local user desktop, then Public desktop
if (-not $DesktopPath) {
    if ($env:USERPROFILE -and (Test-Path "$env:USERPROFILE\Desktop")) {
        $DesktopPath = "$env:USERPROFILE\Desktop"
    } else {
        $DesktopPath = [Environment]::GetFolderPath("CommonDesktopDirectory")
    }
}
$ShortcutPath = "$DesktopPath\365-Email-Monitoring-Dashboard.lnk"

try {
    $WShell   = New-Object -ComObject WScript.Shell
    $Shortcut = $WShell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath       = $BatPath
    $Shortcut.WorkingDirectory = $InstallDir
    $Shortcut.Description      = "Launch 365 Email Monitoring Dashboard"
    $Shortcut.WindowStyle      = 1
    $Shortcut.Save()
    Write-Host "    Desktop shortcut created: $ShortcutPath" -ForegroundColor Green
} catch {
    Write-Host "    WARNING: Could not create desktop shortcut — $_" -ForegroundColor Yellow
    Write-Host "    You can manually create a shortcut pointing to: $BatPath" -ForegroundColor Yellow
}

# =============================================================================
# Done
# =============================================================================
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Installation complete!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  App location : $InstallDir"
Write-Host "  Launcher     : $BatPath"
Write-Host "  Desktop icon : 365-Email-Monitoring-Dashboard"
Write-Host ""
Write-Host "  To start the app, double-click the desktop shortcut or run:" -ForegroundColor White
Write-Host "  $BatPath" -ForegroundColor Yellow
Write-Host ""
