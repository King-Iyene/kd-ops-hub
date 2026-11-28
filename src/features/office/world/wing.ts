// The Executive Wing: where it is on the map. No imports on purpose, so the map builder and the agents' walking code can both use it.
//
// It is Meeting Rooms 1 and 2 on the right-hand side of the headquarters, joined into one open floor and pushed five tiles west into the
// courtyard so there is room to breathe. It sits close to the private offices along the top. Meeting Room 3 below it becomes the agents' boardroom.

/** The open floor with the desks (tiles, inclusive). */
export const WING = { x0: 33, y0: 12, x1: 60, y1: 22 } as const;
/** The room where the agents meet. */
export const BOARDROOM = { x0: 47, y0: 24, x1: 60, y1: 28 } as const;
/** Where the executives go for a coffee, water or a snack: the standing places beside the coffee machine, the cooler and the vending machine in the lounge. */
export const BREAK_SPOTS: { x: number; y: number }[] = [{ x: 43.5, y: 24.5 }, { x: 43.5, y: 25.5 }, { x: 43.5, y: 27.5 }];

/**
 * 21 desks in three rows of seven, each with its own chair (15 for the executives and six ready for the next hires).
 * A desk is 2 tiles wide and 1 deep, the chair is below its right half, and whoever sits there faces the screen on the desk.
 * Desks are four tiles apart, so there are wide aisles between them to walk along.
 */
export const DESK_SLOTS: { x: number; y: number }[] = (() => {
  const out: { x: number; y: number }[] = [];
  for (const y of [12, 16, 20]) for (const x of [35, 39, 43, 47, 51, 55, 59]) out.push({ x, y });
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
