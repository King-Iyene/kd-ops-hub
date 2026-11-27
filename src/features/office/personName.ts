/** The full name, the way people appear in the office. */
export function shortName(full: string | null | undefined, email?: string | null): string {
  const name = (full ?? '').split(' ').filter(Boolean).join(' ');
  if (name) return name;
  // no full name on the profile: the part of the email before the @, as words ("king.iyene@..." is "King Iyene"), so nobody shows as "Someone"
  const local = (email ?? '').split('@')[0].replace(/[._\-+]+/g, ' ').replace(/\d+$/, '').trim();
  return local ? local.split(' ').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'Someone';
}

