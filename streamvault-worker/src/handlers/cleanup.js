// Scheduled cleanup: delete all data for guests inactive > 7 days

const INACTIVE_DAYS = 7;

export async function handleCleanup(env) {
  const db = env.SV_DB;
  const kv = env.SV_CACHE;
  const cutoff = Math.floor(Date.now() / 1000) - (INACTIVE_DAYS * 86400);

  // Find inactive guests
  const { results: staleUsers } = await db.prepare(
    "SELECT id FROM users WHERE last_active < ? OR last_active IS NULL"
  ).bind(cutoff).all();

  if (!staleUsers.length) {
    return { cleaned: 0 };
  }

  const userIds = staleUsers.map(u => u.id);
  let totalDeleted = 0;

  // Process in batches (D1 batch limit)
  for (const userId of userIds) {
    const stmts = [
      db.prepare("DELETE FROM content_items WHERE connection_id IN (SELECT id FROM connections WHERE user_id = ?)").bind(userId),
      db.prepare("DELETE FROM stalker_categories WHERE connection_id IN (SELECT id FROM connections WHERE user_id = ?)").bind(userId),
      db.prepare("DELETE FROM sync_meta WHERE user_id = ?").bind(userId),
      db.prepare("DELETE FROM watch_history WHERE user_id = ?").bind(userId),
      db.prepare("DELETE FROM favorites WHERE user_id = ?").bind(userId),
      db.prepare("DELETE FROM user_preferences WHERE user_id = ?").bind(userId),
      db.prepare("DELETE FROM connections WHERE user_id = ?").bind(userId),
      db.prepare("DELETE FROM users WHERE id = ?").bind(userId),
    ];
    await db.batch(stmts);
    totalDeleted++;
  }

  // Clean up stale KV cache entries (stalker tokens/paths older than 7 days)
  if (kv) {
    try {
      const list = await kv.list();
      for (const key of list.keys) {
        // KV entries have metadata or we can just delete old stalker session keys
        // Stalker tokens are short-lived anyway, safe to purge all
        if (key.name.startsWith("tok:") || key.name.startsWith("path:")) {
          await kv.delete(key.name);
        }
      }
    } catch {}
  }

  return { cleaned: totalDeleted, userIds };
}
