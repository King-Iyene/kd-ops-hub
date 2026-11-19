import { Fragment, type ReactNode } from 'react';

// A very small markdown renderer for chat answers: paragraphs, line breaks, - lists, 1. lists, short headings, **bold**,
// *italic* and `code`. It builds React elements (never HTML strings) and does not make links, so an answer can never
// inject markup or a clickable address.

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*\n]+\*\*|`[^`\n]+`|(?<![*\w])\*[^*\n]+\*(?!\w))/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith('**')) out.push(<strong key={key} className="font-semibold text-foreground">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={key} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">{tok.slice(1, -1)}</code>);
    else out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    last = idx + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function lines(block: string, key: string): ReactNode[] {
  const ls = block.split('\n');
  return ls.map((l, i) => (
    <Fragment key={`${key}-${i}`}>{i > 0 && <br />}{inline(l, `${key}-${i}`)}</Fragment>
  ));
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = text.replace(/\r\n/g, '\n').trim().split(/\n{2,}/);
  return (
    <div className={className}>
      {blocks.map((block, bi) => {
        const ls = block.split('\n');
        const key = `b${bi}`;
        if (ls.every((l) => /^\s*[-*•]\s+/.test(l))) {
          return <ul key={key} className="my-2 list-disc space-y-1 pl-5 marker:text-muted-foreground">{ls.map((l, i) => <li key={i}>{inline(l.replace(/^\s*[-*•]\s+/, ''), `${key}-${i}`)}</li>)}</ul>;
        }
        if (ls.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
          return <ol key={key} className="my-2 list-decimal space-y-1 pl-5 marker:text-muted-foreground">{ls.map((l, i) => <li key={i}>{inline(l.replace(/^\s*\d+[.)]\s+/, ''), `${key}-${i}`)}</li>)}</ol>;
        }
        // A paragraph that ends in a list ("Two people have not reported:" then "- Tola ...") keeps its lead line.
        const firstItem = ls.findIndex((l) => /^\s*[-*•]\s+/.test(l));
        if (firstItem > 0 && ls.slice(firstItem).every((l) => /^\s*[-*•]\s+/.test(l))) {
          return (
            <Fragment key={key}>
              <p className="my-2 first:mt-0">{lines(ls.slice(0, firstItem).join('\n'), key)}</p>
              <ul className="my-2 list-disc space-y-1 pl-5 marker:text-muted-foreground">{ls.slice(firstItem).map((l, i) => <li key={i}>{inline(l.replace(/^\s*[-*•]\s+/, ''), `${key}-${i}`)}</li>)}</ul>
            </Fragment>
          );
        }
        if (/^#{1,4}\s+/.test(block) && ls.length === 1) return <p key={key} className="mb-1 mt-4 font-semibold text-foreground first:mt-0">{inline(block.replace(/^#{1,4}\s+/, ''), key)}</p>;
        return <p key={key} className="my-2 first:mt-0 last:mb-0">{lines(block, key)}</p>;
      })}
    </div>
  );
}
