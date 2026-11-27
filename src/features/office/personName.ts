/** The full name, the way people appear in the office. */
export function shortName(full: string | null | undefined, email?: string | null): string {
  const name = (full ?? '').split(' ').filter(Boolean).join(' ');
  if (name) return name;
  // no full name on the profile: the part of the email before the @, as words ("king.iyene@..." is "King Iyene"), so nobody shows as "Someone"
  const local = (email ?? '').split('@')[0].replace(/[._\-+]+/g, ' ').replace(/\d+$/, '').trim();
  return local ? local.split(' ').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'Team member';
}


/**
 * One source of names. A person's name comes from their profile (the directory) whenever we have it, so the same person is called the
 * same thing in the people list, the map, chat and meetings, whatever their browser last told us. What they told us is only the
 * fallback (visitors who are not in the directory), and a blank or "Someone" never reaches the screen.
 * Returns the same array (and the same entries) when nothing needs changing, so the screen is not told something changed.
 */
export function withDirectoryNames<T extends { uid: string; name: string }>(people: T[], nameByUid: ReadonlyMap<string, string>): T[] {
  let changed = false;
  const out = people.map((w) => {
    const bad = !w.name.trim() || w.name === 'Someone';
    const want = nameByUid.get(w.uid) || (bad ? 'Teammate' : w.name);
    if (want === w.name) return w;
    changed = true;
    return { ...w, name: want };
  });
  return changed ? out : people;
}
