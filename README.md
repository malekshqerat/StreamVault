# StreamVault

> A personal IPTV client that runs entirely in the browser — no app install, no subscription, bring your own service.

Supports **Xtream Codes**, **M3U playlists**, **Stalker/Ministra portals**, and **direct HLS/MP4 URLs**.

---

## Features

| Category | Details |
|----------|---------|
| Live TV | Channel grid with logos, live EPG now-playing, channel switching |
| Movies & Series | Poster grid with year, rating, and resume progress bar |
| TV Guide | XMLTV EPG grid (load any provider's XML feed) |
| Global Search | Searches live, movies, and series simultaneously |
| Favorites | Per-profile favorites across all content types |
| Continue Watching | Watch history with resume support (last 60 items) |
| Themes | Dark · Navy · AMOLED · Forest |
| Player | HLS.js, mpegts.js, keyboard shortcuts, Picture-in-Picture, OSD, quick channel switcher |

**Keyboard shortcuts in player:**
`Space` play/pause · `F` fullscreen · `M` mute · `←→` channels / ±10s · `↑↓` channels / volume · `P` PiP · `Esc` close

---

## Project structure

```
StreamVault/
├── streamvault/           # React + Vite frontend
│   ├── src/App.jsx        # Entire app (single-file architecture)
│   └── .env.example
├── stalker-proxy/         # Node.js CORS proxy for Stalker portals
│   ├── src/index.js
│   └── .env.example
└── streamvault-worker/    # Cloudflare Worker (optional)
    ├── src/               # Stalker proxy, stream proxy, catalog API
    ├── migrations/        # D1 database schema
    └── wrangler.toml
```

---

## Quick start

### 1. Clone

```bash
git clone https://github.com/YOUR-USERNAME/StreamVault.git
cd StreamVault
```

### 2. Start the Stalker proxy *(only needed for Stalker Portal connections)*

```bash
cd stalker-proxy
cp .env.example .env
npm install
npm start
# Proxy runs at http://localhost:3001
```

### 3. Start the frontend

```bash
cd streamvault
cp .env.example .env
npm install
npm run dev
# App runs at http://localhost:5173
```

### 4. Open and connect

Go to `http://localhost:5173` and choose your connection type:

| Type | What you need |
|------|--------------|
| **Xtream Codes** | Server URL · username · password |
| **M3U Playlist** | Direct `.m3u` or `.m3u8` URL |
| **Stalker Portal** | Portal URL · MAC address · proxy running |
| **Direct HLS** | Any `.m3u8`, DASH, or media URL |

---

## Environment variables

### `streamvault/.env`

```env
# URL of the stalker-proxy (local or deployed)
VITE_PROXY_URL=http://localhost:3001

# Optional: CF Worker URL for catalog API
# VITE_CATALOG_URL=https://your-worker.workers.dev

# Optional: Separate stream proxy URL
# VITE_STREAM_PROXY_URL=https://your-proxy.koyeb.app
```

### `stalker-proxy/.env`

```env
PORT=3001
# Lock down to your frontend origin in production
ALLOWED_ORIGIN=*
```

---

## Build for production

```bash
cd streamvault
npm run build
# Output in streamvault/dist/
```

---

## Deploying (free tier)

### Option A — Proxy only (Koyeb)

1. Go to [koyeb.com](https://koyeb.com) → **Create App**
2. Choose **GitHub** → select your StreamVault fork
3. Set **Work directory** to `stalker-proxy`
4. Build command: `npm install` · Run command: `npm start`
5. Add env var: `ALLOWED_ORIGIN` → `*` *(lock down after deploying frontend)*
6. Deploy — note the Koyeb URL

> `koyeb.yaml` in `stalker-proxy/` pre-fills most of these settings.

### Option B — Frontend (Cloudflare Pages)

1. Go to [pages.cloudflare.com](https://pages.cloudflare.com) → **Create a project** → **Connect to Git**
2. Select your StreamVault fork
3. Set **Root directory** to `streamvault`
4. Build command: `npm run build` · Build output directory: `dist`
5. Add env var: `VITE_PROXY_URL` → your Koyeb proxy URL from step A
6. Deploy

### Option C — Cloudflare Worker (optional, replaces proxy)

The CF Worker provides the same proxy functionality plus persistent storage (D1) and KV caching:

```bash
cd streamvault-worker
# Create KV namespace and D1 database
wrangler kv namespace create SV_CACHE
wrangler d1 create streamvault-db

# Update wrangler.toml with the returned IDs
# Run migrations
wrangler d1 migrations apply streamvault-db

# Deploy
wrangler deploy
```

Then set `VITE_CATALOG_URL` in your frontend env to the Worker URL.

### Lock down CORS

Once deployed, set `ALLOWED_ORIGIN` on Koyeb to your frontend URL.

---

## Tech stack

- **Frontend** — React 19, Vite 8, HLS.js, mpegts.js (lazy-loaded)
- **Proxy** — Node.js 18+, Express, node-fetch
- **Worker** — Cloudflare Workers, D1, KV
- **Styling** — CSS-in-JS via template literal, injected as `<style>` tag (no build-time CSS)
- **Storage** — IndexedDB (browser), D1 (cloud sync)

---

## License

[MIT](LICENSE)
