// The two office layouts: the company team office (open floor, lounge, three meeting rooms) and a personal office.
// Geometry (walls, rooms, doors) lives here; furniture is a list that a saved layout may replace.
import type { Item, ItemType, MapDef, Zone } from './types';

function grid(w: number, h: number): boolean[][] {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => false));
}

function wallRect(walls: boolean[][], x1: number, y1: number, x2: number, y2: number) {
  for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) walls[y][x] = true;
}

function gap(walls: boolean[][], x1: number, y1: number, x2: number, y2: number) {
  for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) walls[y][x] = false;
}

let seq = 0;
function it(t: ItemType, x: number, y: number, r: 0 | 1 | 2 | 3 = 0): Item {
  seq += 1;
  return { id: `t${seq}`, t, x, y, r };
}

/** Company office: open floor with desks, a lounge, three meeting rooms on the right, and a door to your own office. */
export function buildTeamOffice(): MapDef {
  seq = 0;
  const w = 40;
  const h = 26;
  const walls = grid(w, h);
  // outer walls
  wallRect(walls, 0, 0, w - 1, 0);
  wallRect(walls, 0, h - 1, w - 1, h - 1);
  wallRect(walls, 0, 0, 0, h - 1);
  wallRect(walls, w - 1, 0, w - 1, h - 1);
  // wall between the open floor and the meeting rooms (x = 28), with a two tile door for each room
  wallRect(walls, 28, 1, 28, h - 2);
  gap(walls, 28, 3, 28, 4);
  gap(walls, 28, 11, 28, 12);
  gap(walls, 28, 19, 28, 20);
  // walls between the meeting rooms
  wallRect(walls, 29, 8, w - 2, 8);
  wallRect(walls, 29, 16, w - 2, 16);
  // the door in the top wall to your own office
  gap(walls, 13, 0, 14, 0);

  const zones: Zone[] = [
    { id: 'portal-mine', name: 'Your office', kind: 'portal', x: 13, y: 0, w: 2, h: 1, target: 'mine' },
    { id: 'meeting-1', name: 'Meeting Room 1', kind: 'meeting', x: 29, y: 1, w: 10, h: 7 },
    { id: 'meeting-2', name: 'Meeting Room 2', kind: 'meeting', x: 29, y: 9, w: 10, h: 7 },
    { id: 'meeting-3', name: 'Meeting Room 3', kind: 'meeting', x: 29, y: 17, w: 10, h: 8 },
    { id: 'lounge', name: 'Lounge', kind: 'lounge', x: 2, y: 16, w: 11, h: 8 },
    { id: 'open', name: 'Open office', kind: 'area', x: 1, y: 1, w: 27, h: 24 },
  ];

  const items: Item[] = [];
  // desk clusters on the open floor
  // each cluster is two desks facing each other with their chairs between them
  for (const y of [3, 9]) {
    for (const x of [3, 8, 17, 22]) {
      items.push(it('desk', x, y), it('computer', x, y), it('chair', x, y + 1));
      items.push(it('chair', x, y + 2), it('desk', x, y + 3), it('computer', x, y + 3));
    }
  }
  // plants in the corners and by the door
  items.push(it('plant', 1, 1), it('plant', 26, 1), it('plant', 1, 14), it('plant', 26, 14), it('plant', 12, 1), it('plant', 15, 1));
  // lounge: rug, sofas, coffee machine
  items.push(it('rug', 4, 19), it('sofa', 3, 17), it('sofa', 3, 22), it('table', 4, 19), it('coffee', 11, 16), it('plant', 11, 22), it('bin', 10, 16));
  // meeting rooms: a table, chairs, a whiteboard
  for (const [x, y] of [[31, 2], [31, 10], [31, 18]] as const) {
    items.push(it('whiteboard', x + 2, y - 1), it('table', x + 2, y + 1));
    for (let dx = 0; dx < 3; dx++) items.push(it('chair', x + 2 + dx, y), it('chair', x + 2 + dx, y + 3));
  }

  return { w, h, walls, zones, spawn: { x: 14.5, y: 13.5 }, items, buildArea: { x: 1, y: 1, w: w - 2, h: h - 2 } };
}

/** A personal office: a small room with a desk, computer and a door back to the team office. */
export function buildPersonalOffice(): MapDef {
  seq = 100;
  const w = 16;
  const h = 12;
  const walls = grid(w, h);
  wallRect(walls, 0, 0, w - 1, 0);
  wallRect(walls, 0, h - 1, w - 1, h - 1);
  wallRect(walls, 0, 0, 0, h - 1);
  wallRect(walls, w - 1, 0, w - 1, h - 1);
  gap(walls, 7, h - 1, 8, h - 1); // the door

  const zones: Zone[] = [
    { id: 'portal-team', name: 'Back to the team office', kind: 'portal', x: 7, y: h - 1, w: 2, h: 1, target: 'team' },
    { id: 'office', name: 'Office', kind: 'area', x: 1, y: 1, w: w - 2, h: h - 2 },
  ];

  const items: Item[] = [
    it('desk', 6, 2), it('computer', 6, 2), it('chair', 6, 3),
    it('shelf', 2, 1), it('shelf', 12, 1),
    it('plant', 1, 9), it('plant', 14, 1),
    it('rug', 6, 5), it('sofa', 10, 8), it('lamp', 13, 8),
  ];

  return { w, h, walls, zones, spawn: { x: 7.5, y: 8.5 }, items, buildArea: { x: 1, y: 1, w: w - 2, h: h - 2 } };
}

export type TemplateName = 'team' | 'personal';

export function buildTemplate(name: TemplateName): MapDef {
  return name === 'personal' ? buildPersonalOffice() : buildTeamOffice();
}
