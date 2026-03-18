// StreamVault CF Worker — main router
// Replaces stalker-proxy + existing CF Pages worker
import { jsonResponse, handleOptions } from "./utils/cors.js";
import {
  handleHandshake, handleChannels, handleVodCategories, handleVod,
  handleSeriesCategories, handleSeries, handleSeriesSeasons,
  handleStalkerStream, handleEpisodeStream, handleStalkerPlay,
  handleProfile, handleAccount, handleEpg, handleApi,
} from "./handlers/stalker.js";
import { handleStream, handleStreamHead } from "./handlers/stream.js";
import { handleProxy } from "./handlers/proxy.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    // CORS preflight for all routes
    if (method === "OPTIONS") return handleOptions();

    // Health check
    if (pathname === "/health") {
      return jsonResponse({ status: "ok", runtime: "cloudflare-worker" });
    }

    // ── Stream proxy
    if (pathname === "/stream") {
      if (method === "HEAD") return handleStreamHead(url);
      if (method === "GET") return handleStream(url);
    }

    // ── Generic CORS proxy (Xtream API, M3U fetches)
    if (pathname === "/proxy" && method === "GET") {
      return handleProxy(url);
    }

    // ── Stalker routes
    if (pathname === "/stalker/handshake" && method === "POST") {
      return handleHandshake(request, env);
    }
    if (pathname === "/stalker/channels" && method === "GET") {
      return handleChannels(url, env);
    }
    if (pathname === "/stalker/vod/categories" && method === "GET") {
      return handleVodCategories(url, env);
    }
    if (pathname === "/stalker/vod" && method === "GET") {
      return handleVod(url, env);
    }
    if (pathname === "/stalker/series/categories" && method === "GET") {
      return handleSeriesCategories(url, env);
    }
    if (pathname === "/stalker/series/episode/stream" && method === "GET") {
      return handleEpisodeStream(url, env);
    }
    if (pathname === "/stalker/series/seasons" && method === "GET") {
      return handleSeriesSeasons(url, env);
    }
    if (pathname === "/stalker/series" && method === "GET") {
      return handleSeries(url, env);
    }
    if (pathname === "/stalker/play" && method === "GET") {
      return handleStalkerPlay(url, env);
    }
    if (pathname === "/stalker/stream" && method === "GET") {
      return handleStalkerStream(url, env);
    }
    if (pathname === "/stalker/profile" && method === "GET") {
      return handleProfile(url, env);
    }
    if (pathname === "/stalker/account" && method === "GET") {
      return handleAccount(url, env);
    }
    if (pathname === "/stalker/epg" && method === "GET") {
      return handleEpg(url, env);
    }
    if (pathname === "/stalker/api" && method === "GET") {
      return handleApi(url, env);
    }

    // 404
    return jsonResponse({ error: "Not found" }, 404);
  },
};
