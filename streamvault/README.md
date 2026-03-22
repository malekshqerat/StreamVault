# StreamVault Frontend

React SPA built with Vite. The entire app lives in a single file (`src/App.jsx`).

## Setup

```bash
cp .env.example .env
npm install
npm run dev
# Opens at http://localhost:5173
```

## Build

```bash
npm run build
# Output: dist/
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_PROXY_URL` | `http://localhost:3001` | Backend proxy URL |
| `VITE_CATALOG_URL` | same as PROXY | CF Worker catalog API (optional) |
| `VITE_STREAM_PROXY_URL` | same as PROXY | Stream proxy URL (optional) |

## Deploy to Cloudflare Pages

1. Connect your GitHub repo
2. Root directory: `streamvault`
3. Build command: `npm run build`
4. Build output: `dist`
5. Add env vars as needed
