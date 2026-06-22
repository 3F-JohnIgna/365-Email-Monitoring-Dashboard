# 365 Email Monitoring Dashboard

A local web dashboard for monitoring Microsoft 365 **Exchange Distribution Lists** — member counts, proxy addresses, and message activity — powered by the Microsoft Graph API via an Azure App Registration.

---

## What It Does

- Displays member counts and proxy email addresses for configured distribution lists
- Tracks inbound/outbound message activity per distribution list
- Connects to Microsoft 365 via an Azure App Registration (application-level `Mail.Read` permission)
- Stores your Client Secret securely in **Windows Credential Manager** — never in plain text
- Caches member and count data locally to minimize API calls
  - Members: 1-hour TTL
  - Message counts: 5-minute TTL

> **Supports pure Exchange Distribution Lists only.**  
> Microsoft 365 Groups and mail-enabled security groups are not supported.

---

## Requirements

- Windows 10/11
- Node.js 18+ *(the installer handles this automatically)*
- An Azure App Registration with **Mail.Read** (application) permission granted and admin-consented
- Your Azure **Tenant ID** and **Client ID**

---

## Install

Open **PowerShell as Administrator** and run:

```powershell
irm https://raw.githubusercontent.com/3F-JohnIgna/365-Email-Monitoring-Dashboard/main/Install-Dashboard.ps1 | iex
```

The installer will:

1. Download this repository as a ZIP and extract it to `C:\365-Email-Monitoring-Dashboard`
2. Verify Node.js is installed — installs it via Winget if not
3. Run `npm install` to install all project dependencies
4. Create a launcher (`365-Email-Monitoring-Dashboard.bat`) in the install folder
5. Add a **desktop shortcut** for one-click launch *(OneDrive Desktop is detected automatically)*

---

## First-Time Configuration

After installation, launch the app via the desktop shortcut. On first run:

1. Open **Settings → Connection** in the dashboard
2. Enter your **Tenant ID**, **Client ID**, and **Client Secret**
   - The Client Secret is saved to Windows Credential Manager — not written to disk
3. Open **Settings → Distribution Lists** and add your DL email addresses and display names

Alternatively, copy `.env.example` to `.env` in the install folder and pre-fill `TENANT_ID` and `CLIENT_ID` before launching.

---

## Running the App

| Method | Command |
|--------|---------|
| Desktop shortcut | Double-click `365-Email-Monitoring-Dashboard` on the desktop |
| Manual | Run `C:\365-Email-Monitoring-Dashboard\365-Email-Monitoring-Dashboard.bat` |
| CLI | `cd C:\365-Email-Monitoring-Dashboard` then `npm run dev` |

The app opens automatically at **http://localhost:5173** after a few seconds.

- Vite dev server: `http://localhost:5173`
- Express API: `http://localhost:3000`

---

## Uninstall

Open **PowerShell as Administrator** and run:

```powershell
irm https://raw.githubusercontent.com/3F-JohnIgna/365-Email-Monitoring-Dashboard/main/Uninstall-Dashboard.ps1 | iex
```

The uninstaller will:

1. Stop any running servers on ports 3000 and 5173
2. Remove all stored credentials from Windows Credential Manager
3. Delete the desktop shortcut
4. Delete the `C:\365-Email-Monitoring-Dashboard` folder

A confirmation prompt is shown before anything is removed.

---

## Ports Used

| Service | Port |
|---------|------|
| Express API | 3000 |
| Vite (UI) | 5173 |

Ensure these ports are not blocked by a local firewall or already in use.
