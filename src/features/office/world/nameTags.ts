/**
 * Name tags of people standing close together used to be drawn on top of each other, so none could be read.
 * Each tag is drawn a fixed height above its person; this works out, for everybody on screen, how far to lift a tag so that it
 * clears the ones already placed. Me first (my tag never moves), then the people in front (lower on the screen), and the ones
 * behind them step up. Pure, so it is unit tested.
 */
export interface TagPerson { x: number; y: number; name: string; isMe?: boolean }

/** A tag's width in pixels (the text, its padding and the little status dot), close enough for placing. */
export const tagWidth = (name: string, dot = false) => name.length * 5.4 + 14 + (dot ? 8 : 0);
const TAG_H = 16;
const STEP = 16;
const MAX_STEPS = 4;

/** For each person (same order as given), how many pixels to lift the tag above where it would normally be. */
export function stackTags(people: TagPerson[], tile: number, above = 38): number[] {
  const lifts = new Array<number>(people.length).fill(0);
  const order = people.map((_, i) => i).filter((i) => !!people[i].name).sort((a, b) => {
    const pa = people[a], pb = people[b];
    if (!!pa.isMe !== !!pb.isMe) return pa.isMe ? -1 : 1;
    return pb.y - pa.y;
  });
  const placed: { l: number; r: number; t: number; b: number }[] = [];
  for (const i of order) {
    const p = people[i];
    const w = tagWidth(p.name);
    const cx = p.x * tile;
    const base = p.y * tile - above;
    let lift = 0;
    for (let s = 0; s <= MAX_STEPS; s++) {
      lift = s * STEP;
      const t = base - lift - TAG_H / 2, b = t + TAG_H, l = cx - w / 2, r = cx + w / 2;
      if (!placed.some((q) => l < q.r && r > q.l && t < q.b && b > q.t)) break;
    }
    const t = base - lift - TAG_H / 2;
    placed.push({ l: cx - w / 2, r: cx + w / 2, t, b: t + TAG_H });
    lifts[i] = lift;
  }
  return lifts;
}
