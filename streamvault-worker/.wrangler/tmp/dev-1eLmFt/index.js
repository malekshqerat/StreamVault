var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-OUiSbS/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader.apply(null, argArray)
    ]);
  }
});

// src/utils/cors.js
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Range",
  "Access-Control-Max-Age": "86400"
};
function corsHeaders(extra = {}) {
  return { ...CORS_HEADERS, ...extra };
}
__name(corsHeaders, "corsHeaders");
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
}
__name(jsonResponse, "jsonResponse");
function errorResponse(message, status = 502) {
  return jsonResponse({ error: message }, status);
}
__name(errorResponse, "errorResponse");
function handleOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
__name(handleOptions, "handleOptions");

// src/utils/stalker.js
var API_PATHS = [
  "server/load.php",
  "portal.php",
  "stalker_portal/server/load.php"
];
function cacheKey(portal, mac) {
  return `path:${portal.replace(/\/+$/, "")}|${mac}`;
}
__name(cacheKey, "cacheKey");
function stalkerHeaders(mac, token = "", portalUrl = "", opts = {}) {
  const referer = portalUrl ? portalUrl.replace(/\/+$/, "").replace(/\/c$/, "") + "/c/" : "http://localhost/";
  const headers = {
    "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3",
    Accept: "*/*",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "X-User-Agent": "Model: MAG250; Link: WiFi",
    Authorization: token ? `Bearer ${token}` : "Bearer ",
    Cookie: `mac=${encodeURIComponent(mac)}; stb_lang=en; timezone=Europe%2FParis`,
    Referer: referer
  };
  if (opts.serial)
    headers["Cookie"] += `; sn=${opts.serial}`;
  return headers;
}
__name(stalkerHeaders, "stalkerHeaders");
async function tryHandshake(base, apiPath, mac, portalUrl) {
  const qs = `type=stb&action=handshake&prehash=0&token=&JsHttpRequest=1-xml`;
  const url = `${base}${apiPath}?${qs}`;
  const headers = stalkerHeaders(mac, "", portalUrl);
  try {
    const res = await fetch(url, { headers });
    if (res.status === 429) {
      throw Object.assign(new Error("rate limited"), { code: "RATE_LIMITED" });
    }
    if (res.status === 404)
      return null;
    if (res.ok) {
      const data = await res.json();
      const token = data?.js?.token;
      if (token)
        return { token, base, apiPath };
    }
  } catch (e) {
    if (e.code === "RATE_LIMITED")
      throw e;
  }
  return null;
}
__name(tryHandshake, "tryHandshake");
async function getSession(portal, mac, opts = {}, kvCache = null) {
  const key = cacheKey(portal, mac);
  let cached = null;
  if (kvCache) {
    const raw = await kvCache.get(key, "json");
    if (raw)
      cached = raw;
  }
  if (cached) {
    const result = await tryHandshake(cached.base, cached.apiPath, mac, portal);
    if (result) {
      return makeSession(result.token, cached.base, cached.apiPath, portal, mac, opts, kvCache);
    }
    if (kvCache)
      await kvCache.delete(key);
  }
  const stripped = portal.replace(/\/+$/, "");
  const bases = [stripped + "/"];
  if (stripped.endsWith("/c")) {
    bases.push(stripped.replace(/\/c$/, "") + "/");
    const root = stripped.replace(/\/[^/]+\/c$/, "");
    if (root !== stripped)
      bases.push(root + "/");
  } else {
    bases.push(stripped + "/c/");
  }
  for (const base of bases) {
    for (const path of API_PATHS) {
      try {
        const result = await tryHandshake(base, path, mac, portal);
        if (result) {
          if (kvCache) {
            await kvCache.put(key, JSON.stringify({ base, apiPath: path }), {
              expirationTtl: 6 * 60 * 60
            });
          }
          return makeSession(result.token, base, path, portal, mac, opts, kvCache);
        }
      } catch (e) {
        if (e.code === "RATE_LIMITED")
          throw new Error("Portal rate limited (429). Try again in a minute.");
        throw e;
      }
    }
  }
  throw new Error("Handshake failed: could not obtain token from portal");
}
__name(getSession, "getSession");
function makeSession(token, base, apiPath, portal, mac, opts, kvCache) {
  return {
    token,
    base,
    apiPath,
    portal,
    mac,
    opts,
    headers: stalkerHeaders(mac, token, portal, opts),
    async refresh() {
      return getSession(portal, mac, opts, kvCache);
    }
  };
}
__name(makeSession, "makeSession");
async function portalFetch(session, params, timeout = 12e3) {
  const qs = new URLSearchParams({ ...params, JsHttpRequest: "1-xml" }).toString();
  const url = `${session.base}${session.apiPath}?${qs}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      headers: session.headers,
      signal: controller.signal
    });
    clearTimeout(timer);
    if (res.ok) {
      const text = await res.text();
      if (text.includes("Authorization failed"))
        return null;
      return JSON.parse(text);
    }
  } catch (e) {
    clearTimeout(timer);
    if (e.name === "AbortError")
      throw new Error(`Timeout after ${timeout}ms`);
  }
  const controller2 = new AbortController();
  const timer2 = setTimeout(() => controller2.abort(), timeout);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: session.headers,
      body: qs,
      signal: controller2.signal
    });
    clearTimeout(timer2);
    if (res.ok) {
      const text = await res.text();
      if (text.includes("Authorization failed"))
        return null;
      return JSON.parse(text);
    }
  } catch (e) {
    clearTimeout(timer2);
    if (e.name === "AbortError")
      throw new Error(`Timeout after ${timeout}ms`);
  }
  throw new Error(`Portal request failed: ${params.action || "unknown"}`);
}
__name(portalFetch, "portalFetch");
async function portalFetchRetry(session, params, timeout) {
  let result = await portalFetch(session, params, timeout);
  if (result === null) {
    const fresh = await session.refresh();
    Object.assign(session, fresh);
    result = await portalFetch(session, params, timeout);
  }
  if (result === null)
    throw new Error(`Authorization failed for ${params.action || "unknown"}`);
  return result;
}
__name(portalFetchRetry, "portalFetchRetry");
async function fetchAllPages(session, type, category, maxItems = 500) {
  const all = [];
  for (let page = 1; all.length < maxItems; page++) {
    let data;
    try {
      data = await portalFetchRetry(
        session,
        { type, action: "get_ordered_list", category, page, p: page },
        2e4
      );
    } catch {
      break;
    }
    const items = data?.js?.data;
    if (!items || !items.length)
      break;
    all.push(...items);
    const declaredTotal = parseInt(data.js.total_items || data.js.results_num || 0);
    if (declaredTotal > 0 && all.length >= declaredTotal)
      break;
    const declaredPages = parseInt(data.js.total_pages || data.js.pages_count || 0);
    if (declaredPages > 0 && page >= declaredPages)
      break;
  }
  return all;
}
__name(fetchAllPages, "fetchAllPages");

// src/handlers/stalker.js
async function handleHandshake(request, env) {
  const { portal, mac, serial } = await request.json();
  if (!portal || !mac)
    return errorResponse("portal and mac required", 400);
  try {
    const session = await getSession(portal, mac, { serial }, env.SV_CACHE);
    return jsonResponse({ token: session.token });
  } catch (e) {
    return errorResponse(e.message);
  }
}
__name(handleHandshake, "handleHandshake");
async function handleChannels(url, env) {
  const portal = url.searchParams.get("portal");
  const mac = url.searchParams.get("mac");
  if (!portal || !mac)
    return errorResponse("portal and mac required", 400);
  try {
    const session = await getSession(portal, mac, {}, env.SV_CACHE);
    const genreData = await portalFetchRetry(session, { type: "itv", action: "get_genres" }, 1e4);
    const chData = await portalFetchRetry(session, { type: "itv", action: "get_all_channels" }, 15e3);
    const genres = genreData?.js || [];
    const genreMap = Object.fromEntries(genres.map((g) => [g.id, g.title]));
    const channels = chData?.js?.data || [];
    const result = channels.map((ch) => ({
      id: ch.id,
      name: ch.name,
      num: ch.number,
      logo: ch.logo || ch.icon || null,
      group: genreMap[ch.tv_genre_id] || "Other",
      url: ch.cmd || null,
      epgId: ch.xmltv_id || null,
      type: "live"
    }));
    return jsonResponse({ channels: result, total: result.length });
  } catch (e) {
    return errorResponse(e.message);
  }
}
__name(handleChannels, "handleChannels");
async function handleVodCategories(url, env) {
  const portal = url.searchParams.get("portal");
  const mac = url.searchParams.get("mac");
  if (!portal || !mac)
    return errorResponse("portal and mac required", 400);
  try {
    const session = await getSession(portal, mac, {}, env.SV_CACHE);
    const catData = await portalFetchRetry(session, { type: "vod", action: "get_categories" }, 1e4);
    const categories = (catData?.js || []).map((c) => ({
      id: String(c.id),
      title: c.title,
      count: parseInt(c.count || c.videos_count || c.censored_count || 0)
    }));
    return jsonResponse({ categories });
  } catch (e) {
    return errorResponse(e.message);
  }
}
__name(handleVodCategories, "handleVodCategories");
async function handleVod(url, env) {
  const portal = url.searchParams.get("portal");
  const mac = url.searchParams.get("mac");
  const cat = url.searchParams.get("cat");
  if (!portal || !mac)
    return errorResponse("portal and mac required", 400);
  if (!cat)
    return errorResponse("cat (category id) required", 400);
  try {
    const session = await getSession(portal, mac, {}, env.SV_CACHE);
    const rawItems = await fetchAllPages(session, "vod", cat);
    const items = rawItems.map((v) => ({
      id: v.id,
      name: v.name,
      logo: v.screenshot_uri || v.cover || null,
      year: v.year,
      rating: v.rating_imdb || v.rating || null,
      url: v.cmd || null,
      type: "vod"
    }));
    return jsonResponse({ items, total: items.length });
  } catch (e) {
    return errorResponse(e.message);
  }
}
__name(handleVod, "handleVod");
async function handleSeriesCategories(url, env) {
  const portal = url.searchParams.get("portal");
  const mac = url.searchParams.get("mac");
  if (!portal || !mac)
    return errorResponse("portal and mac required", 400);
  try {
    const session = await getSession(portal, mac, {}, env.SV_CACHE);
    const catData = await portalFetchRetry(session, { type: "series", action: "get_categories" }, 1e4);
    const categories = (catData?.js || []).map((c) => ({
      id: String(c.id),
      title: c.title,
      count: parseInt(c.count || c.videos_count || c.censored_count || 0)
    }));
    return jsonResponse({ categories });
  } catch (e) {
    return errorResponse(e.message);
  }
}
__name(handleSeriesCategories, "handleSeriesCategories");
async function handleSeries(url, env) {
  const portal = url.searchParams.get("portal");
  const mac = url.searchParams.get("mac");
  const cat = url.searchParams.get("cat");
  if (!portal || !mac)
    return errorResponse("portal and mac required", 400);
  if (!cat)
    return errorResponse("cat (category id) required", 400);
  try {
    const session = await getSession(portal, mac, {}, env.SV_CACHE);
    const rawItems = await fetchAllPages(session, "series", cat);
    const items = rawItems.map((s) => ({
      id: s.id,
      name: s.name,
      logo: s.screenshot_uri || s.cover || null,
      year: s.year,
      rating: s.rating_imdb || s.rating || null,
      type: "series"
    }));
    return jsonResponse({ items, total: items.length });
  } catch (e) {
    return errorResponse(e.message);
  }
}
__name(handleSeries, "handleSeries");
async function handleSeriesSeasons(url, env) {
  const portal = url.searchParams.get("portal");
  const mac = url.searchParams.get("mac");
  const seriesId = url.searchParams.get("seriesId");
  if (!portal || !mac)
    return errorResponse("portal and mac required", 400);
  if (!seriesId)
    return errorResponse("seriesId required", 400);
  try {
    const session = await getSession(portal, mac, {}, env.SV_CACHE);
    const movieId = seriesId.split(":")[0];
    const data = await portalFetchRetry(
      session,
      { type: "series", action: "get_ordered_list", movie_id: movieId, page: 1, p: 1 },
      2e4
    );
    const rawSeasons = data?.js?.data || [];
    const seasons = rawSeasons.map((s) => ({
      id: s.id,
      name: s.name,
      cmd: s.cmd || "",
      episodes: Array.isArray(s.series) ? s.series : [],
      logo: s.screenshot_uri || s.cover || null
    }));
    return jsonResponse({ seasons });
  } catch (e) {
    return errorResponse(e.message);
  }
}
__name(handleSeriesSeasons, "handleSeriesSeasons");
async function handleStalkerStream(url, env) {
  const portal = url.searchParams.get("portal");
  const mac = url.searchParams.get("mac");
  const cmd = url.searchParams.get("cmd");
  const contentType = url.searchParams.get("content_type") || "live";
  if (!portal || !mac || !cmd)
    return errorResponse("portal, mac and cmd required", 400);
  const stalkerType = contentType === "vod" || contentType === "series" ? "vod" : "itv";
  try {
    const session = await getSession(portal, mac, {}, env.SV_CACHE);
    const data = await portalFetchRetry(session, {
      type: stalkerType,
      action: "create_link",
      cmd,
      series: 0,
      forced_storage: 0,
      disable_ad: 0,
      download: 0,
      force_ch_link_check: 0
    });
    const streamUrl = data?.js?.cmd;
    if (!streamUrl)
      throw new Error("No stream URL returned");
    const cleanUrl = streamUrl.replace(/^ffmpeg\s+/, "").trim();
    return jsonResponse({ url: cleanUrl });
  } catch (e) {
    return errorResponse(e.message);
  }
}
__name(handleStalkerStream, "handleStalkerStream");
async function handleEpisodeStream(url, env) {
  const portal = url.searchParams.get("portal");
  const mac = url.searchParams.get("mac");
  const cmd = url.searchParams.get("cmd");
  const episode = url.searchParams.get("episode");
  if (!portal || !mac || !cmd || !episode) {
    return errorResponse("portal, mac, cmd and episode required", 400);
  }
  try {
    const session = await getSession(portal, mac, {}, env.SV_CACHE);
    const data = await portalFetchRetry(session, {
      type: "vod",
      action: "create_link",
      cmd,
      series: episode,
      forced_storage: 0,
      disable_ad: 0,
      download: 0,
      force_ch_link_check: 0
    });
    const streamUrl = data?.js?.cmd;
    if (!streamUrl)
      throw new Error("No stream URL returned for episode");
    const cleanUrl = streamUrl.replace(/^ffmpeg\s+/, "").trim();
    return jsonResponse({ url: cleanUrl });
  } catch (e) {
    return errorResponse(e.message);
  }
}
__name(handleEpisodeStream, "handleEpisodeStream");
async function handleProfile(url, env) {
  const portal = url.searchParams.get("portal");
  const mac = url.searchParams.get("mac");
  const serial = url.searchParams.get("serial");
  const deviceId = url.searchParams.get("deviceId");
  const deviceId2 = url.searchParams.get("deviceId2");
  if (!portal || !mac)
    return errorResponse("portal and mac required", 400);
  try {
    const session = await getSession(portal, mac, { serial }, env.SV_CACHE);
    const params = {
      type: "stb",
      action: "get_profile",
      auth_second_step: 1,
      hw_version_2: "8b80dfaa8cf83485567849b7202a79360fc988e3"
    };
    if (serial)
      params.sn = serial;
    if (deviceId)
      params.device_id = deviceId;
    if (deviceId2 || deviceId)
      params.device_id2 = deviceId2 || deviceId;
    const data = await portalFetchRetry(session, params);
    return jsonResponse(data?.js || {});
  } catch (e) {
    return errorResponse(e.message);
  }
}
__name(handleProfile, "handleProfile");
async function handleAccount(url, env) {
  const portal = url.searchParams.get("portal");
  const mac = url.searchParams.get("mac");
  if (!portal || !mac)
    return errorResponse("portal and mac required", 400);
  try {
    const session = await getSession(portal, mac, {}, env.SV_CACHE);
    const data = await portalFetchRetry(session, {
      type: "account_info",
      action: "get_main_info"
    });
    return jsonResponse(data?.js || {});
  } catch (e) {
    return errorResponse(e.message);
  }
}
__name(handleAccount, "handleAccount");
async function handleEpg(url, env) {
  const portal = url.searchParams.get("portal");
  const mac = url.searchParams.get("mac");
  const period = url.searchParams.get("period") || "4";
  if (!portal || !mac)
    return errorResponse("portal and mac required", 400);
  try {
    const session = await getSession(portal, mac, {}, env.SV_CACHE);
    const data = await portalFetchRetry(
      session,
      { type: "itv", action: "get_epg_info", period },
      2e4
    );
    const programs = {};
    const epgData = data?.js?.data || data?.js || {};
    for (const [channelId, shows] of Object.entries(epgData)) {
      if (!Array.isArray(shows))
        continue;
      programs[channelId] = shows.map((s) => ({
        title: s.name || s.title || "",
        start: (s.start_timestamp || s.start || 0) * 1e3,
        stop: (s.stop_timestamp || s.stop || 0) * 1e3
      }));
    }
    return jsonResponse({ programs });
  } catch (e) {
    return errorResponse(e.message);
  }
}
__name(handleEpg, "handleEpg");
async function handleApi(url, env) {
  const portal = url.searchParams.get("portal");
  const mac = url.searchParams.get("mac");
  if (!portal || !mac)
    return errorResponse("portal and mac required", 400);
  const apiParams = {};
  for (const [key, val] of url.searchParams.entries()) {
    if (key !== "portal" && key !== "mac")
      apiParams[key] = val;
  }
  try {
    const session = await getSession(portal, mac, {}, env.SV_CACHE);
    const data = await portalFetchRetry(session, apiParams);
    return jsonResponse(data);
  } catch (e) {
    return errorResponse(e.message);
  }
}
__name(handleApi, "handleApi");

// src/handlers/stream.js
async function handleStream(url) {
  const target = url.searchParams.get("url");
  if (!target)
    return errorResponse("url parameter required", 400);
  try {
    const upstream = await fetch(target, {
      headers: { "User-Agent": "StreamVault/1.0" },
      redirect: "follow"
    });
    if (!upstream.ok) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: corsHeaders()
      });
    }
    const ct = upstream.headers.get("content-type") || "";
    const headers = corsHeaders();
    if (ct.includes("mpegurl") || target.includes(".m3u8")) {
      let body = await upstream.text();
      body = body.replace(
        /^(http:\/\/[^\s]+)/gm,
        (match) => `${url.origin}/stream?url=${encodeURIComponent(match)}`
      );
      headers["Content-Type"] = "application/vnd.apple.mpegurl";
      return new Response(body, { status: 200, headers });
    }
    if (ct)
      headers["Content-Type"] = ct;
    const cl = upstream.headers.get("content-length");
    if (cl)
      headers["Content-Length"] = cl;
    const cr = upstream.headers.get("content-range");
    if (cr)
      headers["Content-Range"] = cr;
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (e) {
    return errorResponse(e.message);
  }
}
__name(handleStream, "handleStream");
async function handleStreamHead(url) {
  const target = url.searchParams.get("url");
  if (!target)
    return new Response(null, { status: 400, headers: corsHeaders() });
  try {
    const upstream = await fetch(target, {
      method: "HEAD",
      headers: { "User-Agent": "StreamVault/1.0" },
      redirect: "follow"
    });
    const headers = corsHeaders();
    const ct = upstream.headers.get("content-type");
    if (ct)
      headers["Content-Type"] = ct;
    const cl = upstream.headers.get("content-length");
    if (cl)
      headers["Content-Length"] = cl;
    return new Response(null, { status: upstream.status, headers });
  } catch {
    return new Response(null, { status: 502, headers: corsHeaders() });
  }
}
__name(handleStreamHead, "handleStreamHead");

// src/handlers/proxy.js
async function handleProxy(url) {
  const target = url.searchParams.get("url");
  if (!target)
    return errorResponse("url parameter required", 400);
  try {
    const upstream = await fetch(target, {
      headers: { "User-Agent": "StreamVault/1.0" },
      redirect: "follow"
    });
    const ct = upstream.headers.get("content-type") || "";
    const headers = corsHeaders();
    if (ct.includes("json")) {
      const data = await upstream.json();
      headers["Content-Type"] = "application/json";
      return new Response(JSON.stringify(data), { status: upstream.status, headers });
    }
    const text = await upstream.text();
    headers["Content-Type"] = ct || "text/plain";
    return new Response(text, { status: upstream.status, headers });
  } catch (e) {
    return errorResponse(e.message);
  }
}
__name(handleProxy, "handleProxy");

// src/index.js
var src_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;
    if (method === "OPTIONS")
      return handleOptions();
    if (pathname === "/health") {
      return jsonResponse({ status: "ok", runtime: "cloudflare-worker" });
    }
    if (pathname === "/stream") {
      if (method === "HEAD")
        return handleStreamHead(url);
      if (method === "GET")
        return handleStream(url);
    }
    if (pathname === "/proxy" && method === "GET") {
      return handleProxy(url);
    }
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
    return jsonResponse({ error: "Not found" }, 404);
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-OUiSbS/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-OUiSbS/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
