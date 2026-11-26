// A key may be limited to one base (nc_meta.api_keys.base_id). Keep the rule in one tiny pure function so it can be
// tested without a database.

/** True when a key with this base limit may use this base. A key with no limit may use any base the workspace allows. */
export function keyMayUseBase(keyBaseId: string | null | undefined, baseId: string): boolean {
  if (!keyBaseId) return true;
  return keyBaseId.toLowerCase() === baseId.toLowerCase();
}
