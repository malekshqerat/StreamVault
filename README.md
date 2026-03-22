# StreamVault

A browser-based IPTV client — no app install, no subscription, bring your own service.

Supports **Xtream Codes**, **M3U playlists**, **Stalker/Ministra portals**, and **direct HLS/MP4 URLs**.

---

## Features

| Category | Details |
|----------|---------|
| **Live TV** | Channel grid with logos, EPG now-playing, quick channel switcher |
| **Movies & Series** | Poster grid with year, rating, seasons/episodes, resume progress |
| **TV Guide** | XMLTV EPG grid — load any provider's XML feed |
| **Global Search** | Searches live, movies, and series simultaneously |
| **Favorites** | Per-profile favorites across all content types |
| **Continue Watching** | Watch history with resume support (last 60 items) |
| **Themes** | Dark, Navy, AMOLED, Forest |
| **Player** | HLS.js + mpegts.js, keyboard shortcuts, PiP, OSD overlay |
| **Offline-ready** | IndexedDB caching — channels/categories persist across sessions |

**Player keyboard shortcuts:**
`Space` play/pause · `F` fullscreen · `M` mute · `←→` ±10s or channels · `↑↓` volume or channels · `P` PiP · `Esc` close

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React SPA)                                        │
│  streamvault/src/App.jsx                                    │
│  - IndexedDB for offline content cache                      │
│  - HLS.js / mpegts.js for playback                         │
└────────┬───────────────────────────┬────────────────────────┘
         │                           │
         ▼                           ▼
┌─────────────────────┐   ┌──────────────────────────────────┐
│  stalker-proxy       │   │  CF Worker (optional)            │
│  Express on Node.js  │   │  streamvault-worker/             │
│  - Stalker handshake │   │  - Stalker/Xtream/M3U proxy     │
│  - CORS proxy        │   │  - Stream proxy (HTTP→HTTPS)     │
│  - Stream proxy      │   │  - D1 database (persistent)      │
│  Deploy: Koyeb/      │   │  - KV cache (session paths)      │
│    Railway/Render     │   │  - Usage analytics               │
└─────────────────────┘   └──────────────────────────────────┘
```

You can run **either** the stalker-proxy (simple) **or** the CF Worker (full-featured), or both.

---

## Project structure

```
StreamVault/
├── streamvault/              # React + Vite frontend
│   ├── src/App.jsx           # Entire app (single-file architecture)
│   ├── functions/worker.js   # CF Pages stream proxy (legacy)
│   └── .env.example
├── stalker-proxy/            # Node.js CORS proxy
│   ├── src/index.js          # Express server
│   ├── koyeb.yaml            # Koyeb deploy config
│   ├── railway.json          # Railway deploy config
│   └── .env.example
└── streamvault-worker/       # Cloudflare Worker (optional)
    ├── src/
    │   ├── index.js           # Router + CORS
    │   ├── handlers/          # stalker, stream, catalog, analytics
    │   └── utils/             # auth, cors, stalker session mgmt
    ├── migrations/            # D1 database schema
    └── wrangler.toml
```

---

## Quick start (local dev)

### 1. Clone

```bash
git clone https://github.com/YOUR-USERNAME/StreamVault.git
cd StreamVault
```

### 2. Start the proxy *(needed for Stalker portals and CORS)*

```bash
cd stalker-proxy
cp .env.example .env
npm install
npm start
# Runs at http://localhost:3001
```

### 3. Start the frontend

```bash
cd streamvault
cp .env.example .env
npm install
npm run dev
# Runs at http://localhost:5173
```

### 4. Connect

Open `http://localhost:5173` and choose a connection type:

| Type | What you need |
|------|--------------|
| **Xtream Codes** | Server URL, username, password |
| **M3U Playlist** | Direct `.m3u` or `.m3u8` URL |
| **Stalker Portal** | Portal URL, MAC address (proxy must be running) |
| **Direct HLS** | Any `.m3u8` or media URL |

---

## Environment variables

### Frontend (`streamvault/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_PROXY_URL` | `http://localhost:3001` | Stalker proxy / Koyeb backend URL |
| `VITE_CATALOG_URL` | same as PROXY | CF Worker URL for catalog API (optional) |
| `VITE_STREAM_PROXY_URL` | same as PROXY | Stream proxy URL (optional, for split routing) |

### Proxy (`stalker-proxy/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `ALLOWED_ORIGIN` | `*` | CORS origin — set to your frontend URL in production |

---

## Deploying (free tier)

### Frontend — Cloudflare Pages

1. Fork this repo
2. Go to [pages.cloudflare.com](https://pages.cloudflare.com) → Create project → Connect to Git
3. Root directory: `streamvault` · Build: `npm run build` · Output: `dist`
4. Add env var: `VITE_PROXY_URL` = your proxy URL
5. Deploy

### Proxy — Koyeb (recommended)

1. Go to [koyeb.com](https://koyeb.com) → Create App → GitHub
2. Select your fork, work directory: `stalker-proxy`
3. Build: `npm install` · Run: `npm start`
4. Add env var: `ALLOWED_ORIGIN` = your Pages URL
5. Deploy

> `koyeb.yaml` pre-fills these settings. Also works on [Railway](https://railway.app) or [Render](https://render.com).

### CF Worker (optional, replaces proxy)

```bash
cd streamvault-worker

# Create resources
wrangler kv namespace create SV_CACHE
wrangler d1 create streamvault-db

# Add the returned IDs to wrangler.toml
# Run migrations
wrangler d1 migrations apply streamvault-db

# Deploy
wrangler deploy
```

Set `VITE_CATALOG_URL` in your frontend to the Worker URL.

---

## Proxy API

### Stalker endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/stalker/handshake` | POST | Token handshake with portal |
| `/stalker/channels` | GET | All live channels with genres |
| `/stalker/vod/categories` | GET | VOD category list |
| `/stalker/vod` | GET | VOD items by category |
| `/stalker/series/categories` | GET | Series category list |
| `/stalker/series` | GET | Series items by category |
| `/stalker/series/seasons` | GET | Seasons and episodes for a series |
| `/stalker/stream` | GET | Resolve stream `cmd` to playable URL |
| `/stalker/epg` | GET | EPG program data |
| `/stalker/profile` | GET | STB profile info |
| `/stalker/api` | GET | Generic portal API passthrough |

### Utility endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/stream` | GET | Proxy HTTP streams over HTTPS with HLS manifest rewriting |
| `/proxy` | GET | Generic CORS proxy for any URL |
| `/health` | GET | Health check |

All endpoints return JSON with CORS headers (`Access-Control-Allow-Origin: *`).

---

## How it works

### Stream routing

| Protocol | Path |
|----------|------|
| **Stalker (HTTPS page)** | Browser → Proxy `/stalker/play` → Portal `create_link` → Proxy `/stream` → IPTV server |
| **Xtream (HTTPS page)** | Browser → Proxy `/proxy` → Xtream API; Browser → Proxy `/stream` → TS/HLS stream |
| **M3U (HTTPS page)** | Browser → Proxy `/proxy` → M3U fetch; Browser → Proxy `/stream` → stream |
| **Any (HTTP page)** | Browser → IPTV server directly (no proxy needed) |

### Stalker session management

Stalker portals require a specific handshake flow:
1. **Path discovery** — try multiple API paths (`server/load.php`, `portal.php`, etc.)
2. **Handshake** — get a session token tied to the MAC address
3. **Token refresh** — auto-refresh on 401 responses
4. **`create_link`** — resolve channel commands to stream URLs (tokens may be IP-bound)

The proxy (and CF Worker) handle this transparently, including caching discovered paths.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 8, single-file App.jsx |
| Player | HLS.js (adaptive), mpegts.js (raw TS), native `<video>` |
| Proxy | Node.js 18+, Express, node-fetch |
| Worker | Cloudflare Workers, D1 (SQLite), KV |
| Storage | IndexedDB (browser), D1 (cloud sync) |
| Styling | CSS-in-JS via template literal `<style>` tag |

---

## Disclaimer

StreamVault is a **client application** — it does not provide any IPTV content. You must supply your own IPTV service credentials. Ensure you comply with your provider's terms of service and local laws.

---

## License

[Apache License 2.0](LICENSE)
