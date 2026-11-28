// The Executive Wing: where it is on the map. No imports on purpose, so the map builder and the agents' walking code can both use it.
//
// It is Meeting Rooms 1 and 2 on the right-hand side of the headquarters, joined into one open floor (the doors on the west wall stay),
// close to the private offices along the top. Meeting Room 3 below it becomes the agents' boardroom.

/** The open floor with the desks (tiles, inclusive). */
export const WING = { x0: 47, y0: 12, x1: 60, y1: 22 } as const;
/** The room where the agents meet. */
export const BOARDROOM = { x0: 47, y0: 24, x1: 60, y1: 28 } as const;

/**
 * 15 desks in three rows of five, each with its own chair (14 for the executives and one spare for the next hire).
 * A desk is 2 tiles wide and 1 deep, the chair is below its right half, and whoever sits there stands one tile below the chair.
 * The aisles between rows stay open, and the left tile of every desk row keeps a clear way in from the doors on the west wall.
 */
export const DESK_SLOTS: { x: number; y: number }[] = (() => {
  const out: { x: number; y: number }[] = [];
  for (const y of [12, 16, 20]) for (const x of [47, 50, 53, 56, 59]) out.push({ x, y });
  return out;
})();

/** Is this furniture piece inside the wing's floor? A saved layout's furniture there is replaced by the building's own. */
export function inWing(p: { x: number; y: number }): boolean {
  return p.x >= WING.x0 && p.x <= WING.x1 && p.y >= WING.y0 && p.y <= WING.y1;
}

/** The saved furniture with the wing's own furniture put back (a layout saved before the wing existed still has meeting-room furniture there). */
export function withWingFurniture<T extends { x: number; y: number }>(saved: T[], fromBuilding: T[]): T[] {
  return [...saved.filter((i) => !inWing(i)), ...fromBuilding.filter(inWing)];
}
