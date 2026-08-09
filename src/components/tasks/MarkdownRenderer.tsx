import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderInline(text: string): string {
  let result = escapeHtml(text);

  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  result = result.replace(/_(.+?)_/g, '<em>$1</em>');

  // Strikethrough
  result = result.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // Inline code
  result = result.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-muted text-[11px] font-mono">$1</code>');

  // Links
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline underline-offset-2 hover:text-primary/80">$1</a>',
  );

  // Auto-link URLs
  result = result.replace(
    /(?<!["\w])(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-primary underline underline-offset-2 hover:text-primary/80">$1</a>',
  );

  // @mentions
  result = result.replace(
    /@(\w[\w.-]*)/g,
    '<span class="text-primary font-medium">@$1</span>',
  );

  return result;
}

function parseMarkdown(source: string): string {
  const lines = source.split('\n');
  const html: string[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let inList = false;
  let listItems: string[] = [];

  const flushList = () => {
    if (inList && listItems.length > 0) {
      html.push('<ul class="list-disc list-inside space-y-0.5 my-1">');
      for (const item of listItems) {
        html.push(`<li>${renderInline(item)}</li>`);
      }
      html.push('</ul>');
      listItems = [];
      inList = false;
    }
  };

  for (const line of lines) {
    // Code blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        html.push(`<pre class="bg-muted rounded p-2 text-[11px] font-mono overflow-x-auto my-1"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        codeLines = [];
        inCodeBlock = false;
      } else {
        flushList();
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Headers
    const h3Match = line.match(/^###\s+(.+)/);
    if (h3Match) { flushList(); html.push(`<h3 class="text-xs font-bold mt-2 mb-0.5">${renderInline(h3Match[1])}</h3>`); continue; }

    const h2Match = line.match(/^##\s+(.+)/);
    if (h2Match) { flushList(); html.push(`<h2 class="text-sm font-bold mt-2 mb-0.5">${renderInline(h2Match[1])}</h2>`); continue; }

    const h1Match = line.match(/^#\s+(.+)/);
    if (h1Match) { flushList(); html.push(`<h1 class="text-base font-bold mt-2 mb-0.5">${renderInline(h1Match[1])}</h1>`); continue; }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) { flushList(); html.push('<hr class="my-2 border-border" />'); continue; }

    // Blockquote
    const bqMatch = line.match(/^>\s?(.*)/);
    if (bqMatch) { flushList(); html.push(`<blockquote class="border-l-2 border-primary/40 pl-2 text-muted-foreground italic my-1">${renderInline(bqMatch[1])}</blockquote>`); continue; }

    // Unordered list
    const ulMatch = line.match(/^[-*+]\s+(.*)/);
    if (ulMatch) { inList = true; listItems.push(ulMatch[1]); continue; }

    // Ordered list
    const olMatch = line.match(/^\d+\.\s+(.*)/);
    if (olMatch) { inList = true; listItems.push(olMatch[1]); continue; }

    // Checkbox
    const cbMatch = line.match(/^- \[([ xX])\]\s+(.*)/);
    if (cbMatch) {
      flushList();
      const checked = cbMatch[1] !== ' ';
      html.push(`<div class="flex items-center gap-1.5"><span class="${checked ? 'text-green-500' : 'text-muted-foreground'}">${checked ? '☑' : '☐'}</span><span${checked ? ' class="line-through text-muted-foreground"' : ''}>${renderInline(cbMatch[2])}</span></div>`);
      continue;
    }

    // Empty line
    if (line.trim() === '') { flushList(); html.push('<div class="h-1"></div>'); continue; }

    // Paragraph
    flushList();
    html.push(`<p>${renderInline(line)}</p>`);
  }

  flushList();
  if (inCodeBlock) {
    html.push(`<pre class="bg-muted rounded p-2 text-[11px] font-mono overflow-x-auto my-1"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  }

  return html.join('\n');
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const html = useMemo(() => parseMarkdown(content), [content]);

  return (
    <div
      className={cn('text-xs leading-relaxed prose-compact', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
