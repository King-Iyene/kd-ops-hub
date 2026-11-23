import { useCallback, useEffect, useState, type RefObject } from 'react';
import { assignHeadingIds } from '../lib/toc';

interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

interface SectionTocProps {
  /** The element that holds the section's content. */
  contentRef: RefObject<HTMLElement | null>;
  /** Changes whenever a different section is shown, so the list is rebuilt. */
  sectionKey: string;
}

const MAX_ITEMS = 40;

/**
 * Left-hand "On this page" list for wide screens. It reads the h2/h3 headings
 * inside the content element (giving them ids when they have none), so it works
 * for every section without each one having to describe its own outline.
 */
export function SectionToc({ contentRef, sectionKey }: SectionTocProps) {
  const [items, setItems] = useState<TocItem[]>([]);

  const rebuild = useCallback(() => {
    const root = contentRef.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>('h2, h3')).filter((el) => (el.textContent ?? '').trim());
    const assigned = assignHeadingIds(
      els.map((el) => ({ text: (el.textContent ?? '').trim(), id: el.id || null })),
    );
    const next: TocItem[] = [];
    els.forEach((el, i) => {
      if (assigned[i].isNew) el.id = assigned[i].id;
      if (!el.classList.contains('scroll-mt-32')) el.classList.add('scroll-mt-32');
      next.push({ id: assigned[i].id, text: assigned[i].text, level: el.tagName === 'H2' ? 2 : 3 });
    });
    const trimmed = next.slice(0, MAX_ITEMS);
    setItems((prev) =>
      prev.length === trimmed.length && prev.every((p, i) => p.id === trimmed[i].id && p.text === trimmed[i].text)
        ? prev
        : trimmed,
    );
  }, [contentRef]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    rebuild();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(rebuild, 150);
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [contentRef, rebuild, sectionKey]);

  if (items.length < 2) return null;

  return (
    <nav aria-label="On this page" className="sticky top-36 max-h-[calc(100vh-10rem)] overflow-y-auto pr-2 text-xs">
      <p className="mb-2 px-2 text-3xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        On this page
      </p>
      <ul className="space-y-0.5 border-l border-zinc-200 dark:border-zinc-800">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={
                'block rounded-r px-3 py-1 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100 ' +
                (item.level === 3 ? 'pl-6 text-2xs' : 'font-medium')
              }
            >
              <span className="line-clamp-2">{item.text}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
