/** Ids of the rows from one clicked row to another, both included (works in either direction). Empty if either is not listed. */
export function rowIdsBetween(ids: readonly string[], fromId: string, toId: string): string[] {
  const a = ids.indexOf(fromId);
  const b = ids.indexOf(toId);
  if (a === -1 || b === -1) return [];
  const [start, end] = a <= b ? [a, b] : [b, a];
  return ids.slice(start, end + 1);
}
