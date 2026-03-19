// Extract guest ID from request, auto-create user row if needed

export function getGuestId(request) {
  return request.headers.get("X-Guest-Id") || null;
}

export async function ensureUser(db, guestId) {
  await db.prepare(
    "INSERT INTO users (id, last_active) VALUES (?, unixepoch()) ON CONFLICT(id) DO UPDATE SET last_active = unixepoch()"
  ).bind(guestId).run();
}
