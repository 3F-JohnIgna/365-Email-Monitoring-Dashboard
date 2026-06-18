# DL Monitor Dashboard — Setup

## Prerequisites
- Node.js 18+
- An Azure App Registration with **Mail.Read** (application) permission

## 1. Install dependencies
```
npm install
```

## 2. Configure environment
Copy `.env.example` to `.env` and fill in your Azure credentials:
```
TENANT_ID=your-tenant-id
CLIENT_ID=your-client-id
```

The **Client Secret** is stored in Windows Credential Manager (via keytar).  
Enter it through the Settings → Connection page in the dashboard, or set `CLIENT_SECRET` in `.env` as a fallback.

## 3. Run in development
```
npm run dev
```
- Express API: http://localhost:3000
- Vite dev server: http://localhost:5173 (proxies /api to Express)

Open **http://localhost:5173** in your browser.

## 4. Run in production
```
npm run build
npm start
```
Open **http://localhost:3000** in your browser.

## 5. Add distribution lists
Open Settings (gear icon) → Distribution Lists.  
Enter the DL email address and a display name.  
The proxy member is auto-resolved on the first dashboard load.

## Notes
- Cache files are written to `cache/` automatically.
- Members cache TTL: 1 hour. Counts cache TTL: 5 minutes.
- Pure Exchange Distribution Lists only (not M365 Groups or mail-enabled security groups).
