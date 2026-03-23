# StreamVault Worker

Cloudflare Worker that replaces `stalker-proxy` with additional features: D1 persistent storage, KV session caching, usage analytics, and daily cleanup.

## Setup

```bash
# Create Cloudflare resources
wrangler kv namespace create SV_CACHE
wrangler d1 create streamvault-db

# Add the returned IDs to wrangler.toml
# Run database migrations
wrangler d1 migrations apply streamvault-db

# Local dev
npm run dev

# Deploy
npm run deploy
```

## Routes

All routes from `stalker-proxy` plus:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/stalker/play` | GET | Resolve + stream in one request (same IP) |
| `/api/catalog/connections` | PUT/GET/DELETE | Persistent connection storage |
| `/api/catalog/content` | PUT/GET/DELETE | Content item storage |
| `/api/catalog/categories` | PUT/GET | Category storage |
| `/api/catalog/favorites` | PUT/GET | Favorites sync |
| `/api/catalog/history` | PUT/GET/PATCH | Watch history sync |
| `/api/catalog/preferences` | PUT/GET | User preferences |
| `/api/analytics` | GET | Usage stats |
| `/analytics` | GET | Dashboard HTML |

## D1 Schema

Migrations in `migrations/`:
- `0001_schema.sql` — users, connections, content, favorites, history, preferences
- `0002_last_active.sql` — guest activity tracking
- `0003_usage_log.sql` — daily request/bandwidth counters

## Key differences from stalker-proxy

| Feature | stalker-proxy | CF Worker |
|---------|--------------|-----------|
| Runtime | Node.js / Express | Cloudflare Workers |
| Session cache | In-memory Map | KV (6hr TTL) |
| Path cache | In-memory Map | KV (6hr TTL) |
| Content storage | None | D1 (SQLite) |
| Stream proxy | Body pipe | ReadableStream |
| Cost | Depends on host | Free tier (100K req/day) |
| Cleanup | None | Daily cron (7-day inactive) |
