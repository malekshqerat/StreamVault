// GET /api/analytics — admin dashboard data
import { jsonResponse, errorResponse } from "../utils/cors.js";

export async function handleAnalytics(request, env, url) {
  const db = env.SV_DB;
  const now = Math.floor(Date.now() / 1000);
  const h1 = now - 3600;        // 1 hour
  const h24 = now - 86400;      // 24 hours
  const d7 = now - 7 * 86400;   // 7 days
  const d30 = now - 30 * 86400; // 30 days

  const [
    totalUsers,
    activeH1,
    activeH24,
    activeD7,
    activeD30,
    totalConnections,
    connectionsByType,
    totalContent,
    contentByType,
    totalFavorites,
    totalHistory,
    recentUsers,
    topContent,
  ] = await Promise.all([
    // Total users
    db.prepare("SELECT COUNT(*) as count FROM users").first(),
    // Active in last hour
    db.prepare("SELECT COUNT(*) as count FROM users WHERE last_active >= ?").bind(h1).first(),
    // Active in last 24h
    db.prepare("SELECT COUNT(*) as count FROM users WHERE last_active >= ?").bind(h24).first(),
    // Active in last 7 days
    db.prepare("SELECT COUNT(*) as count FROM users WHERE last_active >= ?").bind(d7).first(),
    // Active in last 30 days
    db.prepare("SELECT COUNT(*) as count FROM users WHERE last_active >= ?").bind(d30).first(),
    // Total connections
    db.prepare("SELECT COUNT(*) as count FROM connections").first(),
    // Connections by type
    db.prepare("SELECT type, COUNT(*) as count FROM connections GROUP BY type ORDER BY count DESC").all(),
    // Total content items
    db.prepare("SELECT COUNT(*) as count FROM content_items").first(),
    // Content by type
    db.prepare("SELECT type, COUNT(*) as count FROM content_items GROUP BY type ORDER BY count DESC").all(),
    // Total favorites
    db.prepare("SELECT COUNT(*) as count FROM favorites").first(),
    // Total history entries
    db.prepare("SELECT COUNT(*) as count FROM watch_history").first(),
    // Recent users with details
    db.prepare(`
      SELECT u.id, u.created_at, u.last_active,
        (SELECT COUNT(*) FROM connections WHERE user_id = u.id) as connections,
        (SELECT COUNT(*) FROM favorites WHERE user_id = u.id) as favorites,
        (SELECT COUNT(*) FROM watch_history WHERE user_id = u.id) as history_items
      FROM users u
      ORDER BY u.last_active DESC
      LIMIT 20
    `).all(),
    // Most watched content (by unique users)
    db.prepare(`
      SELECT name, type, COUNT(DISTINCT user_id) as viewers
      FROM watch_history
      WHERE name IS NOT NULL
      GROUP BY name, type
      ORDER BY viewers DESC
      LIMIT 15
    `).all(),
  ]);

  return jsonResponse({
    users: {
      total: totalUsers.count,
      active_1h: activeH1.count,
      active_24h: activeH24.count,
      active_7d: activeD7.count,
      active_30d: activeD30.count,
    },
    connections: {
      total: totalConnections.count,
      by_type: connectionsByType.results,
    },
    content: {
      total: totalContent.count,
      by_type: contentByType.results,
    },
    favorites: totalFavorites.count,
    history: totalHistory.count,
    recent_users: recentUsers.results.map(u => ({
      id: u.id.slice(0, 8) + "...",
      created: u.created_at ? new Date(u.created_at * 1000).toISOString() : null,
      last_active: u.last_active ? new Date(u.last_active * 1000).toISOString() : null,
      connections: u.connections,
      favorites: u.favorites,
      history_items: u.history_items,
    })),
    top_content: topContent.results,
    generated_at: new Date().toISOString(),
  });
}

// GET /api/analytics/dashboard — self-contained HTML dashboard
export function handleDashboardHTML() {
  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>StreamVault Analytics</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#07070f;color:#dde0f5;font-family:'Segoe UI',system-ui,sans-serif;padding:2rem}
h1{font-size:1.6rem;margin-bottom:.3rem;background:linear-gradient(135deg,#00d4ff,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.sub{color:#8080aa;font-size:.82rem;margin-bottom:2rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:1rem;margin-bottom:2rem}
.card{background:#0f0f1c;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:1.2rem}
.card-label{font-size:.7rem;color:#8080aa;text-transform:uppercase;letter-spacing:.08em;margin-bottom:.4rem}
.card-value{font-size:1.8rem;font-weight:700;color:#00d4ff}
.card-value.green{color:#00e896}
.card-value.orange{color:#ff6b35}
.card-value.purple{color:#a78bfa}
.section{margin-bottom:2rem}
.section-title{font-size:1rem;font-weight:600;margin-bottom:.8rem;color:#dde0f5;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:.4rem}
table{width:100%;border-collapse:collapse;font-size:.82rem}
th{text-align:left;color:#8080aa;font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;padding:.5rem .6rem;border-bottom:1px solid rgba(255,255,255,0.1)}
td{padding:.5rem .6rem;border-bottom:1px solid rgba(255,255,255,0.04);color:#dde0f5}
tr:hover td{background:rgba(255,255,255,0.02)}
.tag{display:inline-block;padding:.15rem .4rem;border-radius:4px;font-size:.65rem;font-weight:600;text-transform:uppercase}
.tag-xtream{background:#00d4ff22;color:#00d4ff}
.tag-stalker{background:#ff6b3522;color:#ff6b35}
.tag-m3u{background:#00e89622;color:#00e896}
.tag-live{background:#ff2d5522;color:#ff2d55}
.tag-vod{background:#a78bfa22;color:#a78bfa}
.tag-series{background:#fbbf2422;color:#fbbf24}
.loading{text-align:center;padding:3rem;color:#8080aa}
.err{color:#ff4466;padding:1rem;background:#ff446612;border-radius:8px;margin:1rem 0}
.refresh{background:#0f0f1c;border:1px solid rgba(255,255,255,0.1);color:#00d4ff;padding:.4rem .8rem;border-radius:6px;cursor:pointer;font-size:.75rem;float:right}
.refresh:hover{background:#16162a}
.bar{height:6px;background:#16162a;border-radius:3px;overflow:hidden;margin-top:.3rem}
.bar-fill{height:100%;border-radius:3px;transition:width .3s}
</style>
</head><body>
<button class="refresh" onclick="load()">Refresh</button>
<h1>STREAMVAULT</h1>
<div class="sub">Analytics Dashboard</div>
<div id="app"><div class="loading">Loading analytics...</div></div>
<script>
function tag(type){return '<span class="tag tag-'+type+'">'+type+'</span>'}
function ago(iso){if(!iso)return'—';const d=Date.now()-new Date(iso).getTime();const m=Math.floor(d/60000);if(m<1)return'just now';if(m<60)return m+'m ago';const h=Math.floor(m/60);if(h<24)return h+'h ago';return Math.floor(h/24)+'d ago'}
function pct(n,t){return t?Math.round(n/t*100):0}

async function load(){
  const app=document.getElementById('app');
  app.innerHTML='<div class="loading">Loading...</div>';
  try{
    const r=await fetch('/api/analytics');
    const d=await r.json();
    if(d.error){app.innerHTML='<div class="err">'+d.error+'</div>';return}
    let h='';

    // User stats
    h+='<div class="grid">';
    h+='<div class="card"><div class="card-label">Total Users</div><div class="card-value">'+d.users.total+'</div></div>';
    h+='<div class="card"><div class="card-label">Active (1h)</div><div class="card-value green">'+d.users.active_1h+'</div></div>';
    h+='<div class="card"><div class="card-label">Active (24h)</div><div class="card-value green">'+d.users.active_24h+'</div></div>';
    h+='<div class="card"><div class="card-label">Active (7d)</div><div class="card-value">'+d.users.active_7d+'</div></div>';
    h+='<div class="card"><div class="card-label">Active (30d)</div><div class="card-value">'+d.users.active_30d+'</div></div>';
    h+='<div class="card"><div class="card-label">Connections</div><div class="card-value orange">'+d.connections.total+'</div></div>';
    h+='<div class="card"><div class="card-label">Content Items</div><div class="card-value purple">'+d.content.total.toLocaleString()+'</div></div>';
    h+='<div class="card"><div class="card-label">Favorites</div><div class="card-value">'+d.favorites+'</div></div>';
    h+='<div class="card"><div class="card-label">History Entries</div><div class="card-value">'+d.history+'</div></div>';
    h+='</div>';

    // Connections by type
    if(d.connections.by_type.length){
      h+='<div class="section"><div class="section-title">Connections by Type</div><div class="grid">';
      d.connections.by_type.forEach(c=>{
        const p=pct(c.count,d.connections.total);
        h+='<div class="card"><div class="card-label">'+tag(c.type)+'</div><div class="card-value">'+c.count+'</div><div class="bar"><div class="bar-fill" style="width:'+p+'%;background:var(--accent,#00d4ff)"></div></div></div>';
      });
      h+='</div></div>';
    }

    // Content by type
    if(d.content.by_type.length){
      h+='<div class="section"><div class="section-title">Content by Type</div><div class="grid">';
      d.content.by_type.forEach(c=>{
        h+='<div class="card"><div class="card-label">'+tag(c.type)+'</div><div class="card-value">'+c.count.toLocaleString()+'</div></div>';
      });
      h+='</div></div>';
    }

    // Recent users
    if(d.recent_users.length){
      h+='<div class="section"><div class="section-title">Recent Users (last 20)</div>';
      h+='<table><tr><th>Guest ID</th><th>Created</th><th>Last Active</th><th>Connections</th><th>Favorites</th><th>History</th></tr>';
      d.recent_users.forEach(u=>{
        h+='<tr><td><code>'+u.id+'</code></td><td>'+ago(u.created)+'</td><td>'+ago(u.last_active)+'</td><td>'+u.connections+'</td><td>'+u.favorites+'</td><td>'+u.history_items+'</td></tr>';
      });
      h+='</table></div>';
    }

    // Top content
    if(d.top_content.length){
      h+='<div class="section"><div class="section-title">Most Watched</div>';
      h+='<table><tr><th>Title</th><th>Type</th><th>Unique Viewers</th></tr>';
      d.top_content.forEach(c=>{
        h+='<tr><td>'+c.name+'</td><td>'+tag(c.type)+'</td><td>'+c.viewers+'</td></tr>';
      });
      h+='</table></div>';
    }

    h+='<div class="sub" style="margin-top:2rem">Generated: '+new Date(d.generated_at).toLocaleString()+'</div>';
    app.innerHTML=h;
  }catch(e){app.innerHTML='<div class="err">Failed to load: '+e.message+'</div>'}
}
load();
</script>
</body></html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html;charset=utf-8" },
  });
}
