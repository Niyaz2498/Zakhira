/**
 * A client-chosen row id, or an error to return instead.
 *
 * Offline clients mint an id before the row can be sent — the task is already
 * on screen under it — so `POST` has to be able to take one. The shape is
 * checked rather than trusted: ids end up in URLs and foreign keys, and a
 * free-text primary key invites rows nothing can address. Anything that is not
 * a UUID is refused.
 *
 * Returns `{ id: null }` when no id was sent, which is the ordinary case: the
 * server mints one as it always has.
 */
export function readClientId(raw: unknown): { id: string | null } | { error: string } {
  if (raw === undefined || raw === null) return { id: null };
  if (typeof raw !== "string") return { error: "id must be a string" };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    return { error: "id must be a UUID" };
  }
  return { id: raw.toLowerCase() };
}
