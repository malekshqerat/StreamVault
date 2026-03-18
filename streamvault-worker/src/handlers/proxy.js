// Generic CORS proxy — used for Xtream API calls and M3U playlist fetching
import { corsHeaders, errorResponse } from "../utils/cors.js";

// GET /proxy?url=...
export async function handleProxy(url) {
  const target = url.searchParams.get("url");
  if (!target) return errorResponse("url parameter required", 400);

  try {
    const upstream = await fetch(target, {
      headers: { "User-Agent": "StreamVault/1.0" },
      redirect: "follow",
    });

    const ct = upstream.headers.get("content-type") || "";
    const headers = corsHeaders();

    if (ct.includes("json")) {
      const data = await upstream.json();
      headers["Content-Type"] = "application/json";
      return new Response(JSON.stringify(data), { status: upstream.status, headers });
    }

    // Text responses (M3U playlists, XML, etc.)
    const text = await upstream.text();
    headers["Content-Type"] = ct || "text/plain";
    return new Response(text, { status: upstream.status, headers });
  } catch (e) {
    return errorResponse(e.message);
  }
}
