// Stream proxy — pipes IPTV streams through CF Worker to bypass CORS + mixed content
// Also handles HLS manifest rewriting
import { corsHeaders, errorResponse } from "../utils/cors.js";

// GET /stream?url=...
export async function handleStream(url) {
  const target = url.searchParams.get("url");
  if (!target) return errorResponse("url parameter required", 400);

  try {
    const upstream = await fetch(target, {
      headers: { "User-Agent": "StreamVault/1.0" },
      redirect: "follow",
    });

    if (!upstream.ok) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: corsHeaders(),
      });
    }

    const ct = upstream.headers.get("content-type") || "";
    const headers = corsHeaders();

    // HLS manifest — rewrite segment URLs to go through /stream
    if (ct.includes("mpegurl") || target.includes(".m3u8")) {
      let body = await upstream.text();
      // Rewrite absolute HTTP URLs in the manifest
      body = body.replace(/^(http:\/\/[^\s]+)/gm, (match) =>
        `${url.origin}/stream?url=${encodeURIComponent(match)}`
      );
      headers["Content-Type"] = "application/vnd.apple.mpegurl";
      return new Response(body, { status: 200, headers });
    }

    // Everything else (TS segments, MP4, MPEG-TS) — pipe through
    if (ct) headers["Content-Type"] = ct;
    const cl = upstream.headers.get("content-length");
    if (cl) headers["Content-Length"] = cl;
    const cr = upstream.headers.get("content-range");
    if (cr) headers["Content-Range"] = cr;

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (e) {
    return errorResponse(e.message);
  }
}

// HEAD /stream?url=...
export async function handleStreamHead(url) {
  const target = url.searchParams.get("url");
  if (!target) return new Response(null, { status: 400, headers: corsHeaders() });

  try {
    const upstream = await fetch(target, {
      method: "HEAD",
      headers: { "User-Agent": "StreamVault/1.0" },
      redirect: "follow",
    });

    const headers = corsHeaders();
    const ct = upstream.headers.get("content-type");
    if (ct) headers["Content-Type"] = ct;
    const cl = upstream.headers.get("content-length");
    if (cl) headers["Content-Length"] = cl;

    return new Response(null, { status: upstream.status, headers });
  } catch {
    return new Response(null, { status: 502, headers: corsHeaders() });
  }
}
