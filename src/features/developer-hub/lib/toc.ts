/** Pure helpers for the in-page table of contents. */

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'section';
}

/**
 * Give every heading an id that is unique within the list. Headings that
 * already have an id keep it (and reserve it), so existing anchors still work.
 */
export function assignHeadingIds(
  headings: { text: string; id?: string | null }[],
  prefix = 'toc',
): { text: string; id: string; isNew: boolean }[] {
  const used = new Set<string>();
  for (const h of headings) if (h.id) used.add(h.id);
  return headings.map((h) => {
    if (h.id) return { text: h.text, id: h.id, isNew: false };
    const base = `${prefix}-${slugify(h.text)}`;
    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    return { text: h.text, id, isNew: true };
  });
}
