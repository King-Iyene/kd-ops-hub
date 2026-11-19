// The two office layouts: the company team office (open floor, lounge, three meeting rooms) and a personal office.
// Geometry (walls, rooms, doors) lives here; furniture is a list that a saved layout may replace.
import type { AvatarStyle, Item, ItemType, MapDef, Zone } from './types';

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

  const zones: Zone[] = [
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
      items.push(it('desk', x, y), it('computer', x, y), it('papers', x + 1, y), it('chair', x, y + 1));
      items.push(it('chair', x, y + 2), it('desk', x, y + 3), it('computer', x, y + 3), it('mug', x + 1, y + 3));
    }
  }
  // plants in the corners and by the door
  items.push(it('tree', 1, 1), it('tree', 26, 1), it('plant', 1, 14), it('plant', 26, 14), it('plant', 12, 1), it('plant', 15, 1));
  // a little garden in the middle of the floor, and a corner for printing and water
  items.push(it('grass', 11, 5), it('flowers', 11, 5), it('flowers', 13, 6), it('lamp', 12, 7));
  items.push(it('cooler', 26, 12), it('printer', 26, 13), it('flowers', 14, 1));
  // lounge: rug, sofas, coffee machine
  items.push(it('rug', 4, 19), it('sofa', 3, 17), it('sofa', 3, 22), it('table', 4, 19), it('coffee', 11, 16), it('plant', 11, 22), it('bin', 10, 16));
  items.push(it('grass', 8, 19), it('beanbag', 8, 19), it('beanbag', 10, 20), it('lamp', 2, 17), it('flowers', 12, 23), it('papers', 5, 19), it('mug', 6, 20));
  // meeting rooms: a table, chairs, a whiteboard
  for (const [x, y] of [[31, 2], [31, 10], [31, 18]] as const) {
    items.push(it('whiteboard', x + 2, y - 1), it('tv', x + 5, y - 1), it('table', x + 2, y + 1));
    items.push(it('papers', x + 3, y + 1), it('mug', x + 2, y + 2), it('mug', x + 4, y + 1), it('flowers', x + 7, y - 1), it('plant', x + 7, y + 4));
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
    it('desk', 6, 2), it('computer', 6, 2), it('papers', 7, 2), it('chair', 6, 3),
    it('shelf', 2, 1), it('shelf', 12, 1), it('tv', 4, 1),
    it('plant', 1, 9), it('flowers', 14, 1), it('tree', 14, 9),
    it('rug', 6, 5), it('sofa', 10, 8), it('lamp', 13, 8),
    it('grass', 2, 5), it('beanbag', 3, 5), it('coffeetable', 10, 6), it('mug', 11, 6), it('printer', 1, 7),
  ];

  return { w, h, walls, zones, spawn: { x: 7.5, y: 8.5 }, items, buildArea: { x: 1, y: 1, w: w - 2, h: h - 2 } };
}


export interface HqPerson { name: string; avatar?: AvatarStyle }

/**
 * The shared headquarters (modelled on a Gather HQ): a wooden building in a garden. Private offices with name plates
 * along the top (one per leader, then free ones), open desk pods, a courtyard with a fountain, a lounge, three meeting
 * rooms, a boardroom, an auditorium, a music corner and a reception at the entrance.
 */
export function buildHQ(people: (HqPerson | undefined)[] = []): MapDef {
  seq = 200;
  const w = 64;
  const h = 52;
  const walls = grid(w, h);
  // the building shell, with the entrance in the middle of the bottom wall
  wallRect(walls, 2, 2, 61, 2);
  wallRect(walls, 2, 49, 61, 49);
  wallRect(walls, 2, 2, 2, 49);
  wallRect(walls, 61, 2, 61, 49);
  gap(walls, 30, 49, 31, 49);
  // nine private offices along the top
  const OFFICES = 9;
  wallRect(walls, 3, 9, 56, 9);
  for (let i = 0; i < OFFICES; i++) {
    const x0 = 3 + i * 6;
    wallRect(walls, x0 + 5, 3, x0 + 5, 9);
    gap(walls, x0 + 1, 9, x0 + 2, 9);
  }
  // three meeting rooms down the right side
  wallRect(walls, 46, 11, 61, 11);
  wallRect(walls, 46, 17, 61, 17);
  wallRect(walls, 46, 23, 61, 23);
  wallRect(walls, 46, 29, 61, 29);
  wallRect(walls, 46, 11, 46, 29);
  for (const y0 of [12, 18, 24]) gap(walls, 46, y0 + 1, 46, y0 + 2);
  // the boardroom
  wallRect(walls, 16, 34, 28, 34);
  wallRect(walls, 16, 44, 28, 44);
  wallRect(walls, 16, 34, 16, 44);
  wallRect(walls, 28, 34, 28, 44);
  gap(walls, 21, 34, 22, 34);
  // the auditorium
  wallRect(walls, 37, 31, 60, 31);
  wallRect(walls, 37, 31, 37, 48);
  gap(walls, 37, 39, 37, 40);

  const zones: Zone[] = [
    { id: 'outdoor', name: 'Garden', kind: 'area', x: 0, y: 0, w, h, floor: 'grass' },
    { id: 'path', name: 'Path', kind: 'area', x: 30, y: 49, w: 2, h: 3, floor: 'stone' },
    { id: 'building', name: 'Headquarters', kind: 'area', x: 3, y: 3, w: 58, h: 46, floor: 'wood' },
    { id: 'courtyard', name: 'Courtyard', kind: 'area', x: 33, y: 12, w: 12, h: 11, floor: 'grass' },
  ];
  const pods = [[4, 13], [14, 13], [4, 22], [14, 22]] as const;
  pods.forEach(([px, py], i) => zones.push({ id: `pod-${i + 1}`, name: 'Desks', kind: 'area', x: px, y: py, w: 8, h: 7, floor: 'gray' }));
  // every desk is its own private seat: claim it, lock it, and what you say there stays there
  pods.forEach(([px, py], pi) => {
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        const n = pi * 6 + r * 3 + c + 1;
        const p = people[8 + n];
        const dy = py + 1 + r * 3;
        zones.push({ id: `seat-${n}`, name: p ? `${p.name}'s seat` : 'Free seat', kind: 'office', seat: true, x: px + 1 + c * 2, y: r === 0 ? dy : dy - 1, w: 2, h: 2, sign: { name: p ? p.name : 'Free seat', avatar: p?.avatar } });
      }
    }
  });
  for (let i = 0; i < OFFICES; i++) {
    const p = people[i];
    zones.push({
      id: `office-${i + 1}`, name: p ? `${p.name}'s office` : 'Free office', kind: 'office', x: 3 + i * 6, y: 3, w: 5, h: 6, floor: 'gray',
      sign: { name: p ? p.name : 'Free office', avatar: p?.avatar },
    });
  }
  [12, 18, 24].forEach((y0, i) => zones.push({ id: `meeting-${i + 1}`, name: `Meeting Room ${i + 1}`, kind: 'meeting', x: 47, y: y0, w: 14, h: 5, floor: 'carpet' }));
  zones.push(
    { id: 'boardroom', name: 'Boardroom', kind: 'meeting', x: 17, y: 35, w: 11, h: 9, floor: 'carpet' },
    { id: 'auditorium', name: 'Auditorium', kind: 'meeting', x: 38, y: 32, w: 23, h: 17, floor: 'stone' },
    { id: 'lounge', name: 'Lounge', kind: 'lounge', x: 33, y: 24, w: 12, h: 7 },
    { id: 'music', name: 'Music corner', kind: 'lounge', x: 3, y: 34, w: 11, h: 13 },
  );

  const items: Item[] = [];
  const desk = (x: number, y: number, extra: 'papers' | 'mug' | 'globe' | 'laptop') => {
    items.push(it('desk', x, y), it('computer', x, y), it(extra, x + 1, y));
  };

  // private offices
  for (let i = 0; i < OFFICES; i++) {
    const x0 = 3 + i * 6;
    desk(x0 + 1, 4, (['papers', 'globe', 'laptop', 'mug'] as const)[i % 4]);
    items.push(it('chair', x0 + 1, 5), it('shelf', x0 + 3, 3), it('plant', x0, 3), it('rug', x0 + 1, 6), it('lamp', x0 + 4, 6));
  }
  // the walls that tell people who we are: core values, notices, and the time in a few places
  items.push(it('valueswall', 12, 10), it('wallclock', 18, 10), it('noticeboard', 24, 10));
  // a dog and a cat in the lounge
  items.push(it('dog', 36, 27), it('cat', 41, 26));
  // power bikes by the front door: press F to ride, F again to get off
  items.push(it('bike', 28, 50), it('bike', 33, 50), it('bike', 43, 20), it('kart', 37, 50), it('kart', 38, 51));
  // more pets out in the courtyard and the garden
  items.push(it('dog', 38, 16), it('cat', 35, 20), it('dog', 24, 50), it('cat', 40, 50));
  // open desk pods: six desks facing each other, chairs between
  pods.forEach(([px, py]) => {
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        const dx = px + 1 + c * 2;
        const dy = py + 1 + r * 3;
        desk(dx, dy, (['papers', 'mug', 'laptop'] as const)[(c + r) % 3]);
        items.push(it('chair', dx, r === 0 ? dy + 1 : dy - 1));
      }
    }
    items.push(it('plant', px, py), it('plant', px + 7, py + 6));
  });
  // a corner of the workspace for printing, water and snacks
  items.push(it('printer', 26, 13), it('cooler', 27, 13), it('vending', 28, 13), it('plant', 26, 20), it('flowers', 28, 20), it('tree', 29, 22));
  items.push(it('lamp', 24, 21), it('bench', 25, 25), it('flowers', 24, 25));

  // courtyard: fountain, palms, hedges, benches and flowers
  items.push(it('fountain', 37, 15), it('palm', 34, 13), it('palm', 42, 13), it('palm', 34, 19), it('palm', 42, 19));
  items.push(it('hedge', 35, 12), it('hedge', 40, 12), it('bench', 36, 19), it('bench', 39, 19));
  items.push(it('flowers', 35, 17), it('flowers', 41, 17), it('flowers', 36, 21), it('flowers', 41, 21), it('mat', 37, 21));

  // meeting rooms
  [12, 18, 24].forEach((y0) => {
    items.push(it('whiteboard', 48, y0), it('tv', 55, y0), it('table', 51, y0 + 2));
    for (let dx = 0; dx < 3; dx++) items.push(it('chair', 51 + dx, y0 + 1), it('chair', 51 + dx, y0 + 4));
    items.push(it('papers', 52, y0 + 2), it('mug', 51, y0 + 3), it('plant', 60, y0 + 4), it('flowers', 60, y0), it('plant', 47, y0 + 4), it('lamp', 58, y0 + 2));
  });

  // boardroom: a long table, ten chairs, screens
  items.push(it('table', 20, 38), it('table', 23, 38));
  for (let dx = 0; dx < 6; dx++) items.push(it('chair', 20 + dx, 37), it('chair', 20 + dx, 40));
  items.push(it('chair', 19, 38), it('chair', 19, 39), it('chair', 26, 38), it('chair', 26, 39));
  items.push(it('whiteboard', 19, 35), it('tv', 23, 35), it('shelf', 26, 35), it('plant', 17, 43), it('plant', 27, 43), it('lamp', 17, 35));
  items.push(it('papers', 21, 38), it('globe', 22, 39), it('mug', 24, 38), it('plate', 25, 39), it('trophy', 20, 39));

  // auditorium: a stage with screens and a podium, then rows of seats either side of an aisle
  items.push(it('tv', 45, 32), it('tv', 51, 32), it('desk', 48, 34), it('computer', 48, 34), it('papers', 49, 34));
  items.push(it('plant', 38, 32), it('plant', 60, 32), it('flowers', 40, 34), it('flowers', 58, 34), it('speaker', 43, 34), it('speaker', 54, 34));
  for (const y of [38, 40, 42, 44, 46]) for (let x = 40; x <= 58; x++) if (x < 48 || x > 50) items.push(it('chair', x, y));

  // lounge
  items.push(it('rug', 36, 26), it('sofa', 36, 25), it('sofa', 36, 28), it('coffeetable', 37, 26), it('mug', 37, 26), it('beanbag', 34, 27), it('beanbag', 41, 27), it('beanbag', 42, 25));
  items.push(it('lamp', 34, 25), it('coffee', 44, 24), it('cooler', 44, 25), it('vending', 44, 27), it('plant', 33, 29), it('balloons', 41, 29), it('mat', 39, 29));

  // music corner
  items.push(it('piano', 4, 36), it('speaker', 6, 36), it('beanbag', 8, 36), it('beanbag', 10, 37), it('beanbag', 8, 39), it('rug', 6, 41), it('sofa', 5, 44), it('frame', 11, 35));
  items.push(it('lamp', 12, 34), it('plant', 13, 34), it('balloons', 12, 40), it('stool', 10, 43), it('stool', 11, 44), it('flowers', 3, 46));

  // reception at the entrance
  items.push(it('table', 27, 45), it('table', 33, 45), it('globe', 28, 45), it('trophy', 34, 45), it('plant', 25, 47), it('plant', 36, 47), it('flowers', 29, 44), it('flowers', 36, 44), it('bench', 22, 46), it('palm', 24, 46));

  // outside: trees and palms along the edges, hedges and flowers by the path
  for (const y of [6, 14, 22, 30, 38]) items.push(it('tree', 0, y), it('tree', 62, y));
  for (const x of [6, 14, 22, 40, 48, 56]) items.push(it('palm', x, 0));
  for (const x of [4, 8, 12, 16, 20, 40, 44, 48, 52, 56]) items.push(it('hedge', x, 50));
  items.push(it('palm', 27, 50), it('palm', 34, 50), it('flowers', 28, 50), it('flowers', 33, 50), it('flowers', 26, 51), it('flowers', 35, 51), it('bench', 23, 50));

  return { w, h, walls, zones, spawn: { x: 31, y: 47.6 }, items, buildArea: { x: 0, y: 0, w, h }, style: 'hq' };
}

/** A new empty space: a wooden floor inside brick walls, ready to be built. */
export function buildBlank(): MapDef {
  seq = 300;
  const w = 40;
  const h = 30;
  const walls = grid(w, h);
  wallRect(walls, 0, 0, w - 1, 0);
  wallRect(walls, 0, h - 1, w - 1, h - 1);
  wallRect(walls, 0, 0, 0, h - 1);
  wallRect(walls, w - 1, 0, w - 1, h - 1);
  const zones: Zone[] = [{ id: 'room', name: 'Room', kind: 'area', x: 1, y: 1, w: w - 2, h: h - 2, floor: 'wood' }];
  return { w, h, walls, zones, spawn: { x: 20, y: 15 }, items: [], buildArea: { x: 1, y: 1, w: w - 2, h: h - 2 }, style: 'hq' };
}

export type TemplateName = 'team' | 'personal' | 'hq' | 'blank';

export function buildTemplate(name: TemplateName, people: (HqPerson | undefined)[] = []): MapDef {
  return name === 'personal' ? buildPersonalOffice() : name === 'hq' ? buildHQ(people) : name === 'blank' ? buildBlank() : buildTeamOffice();
}
