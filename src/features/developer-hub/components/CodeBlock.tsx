import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CodeBlockProps {
  label: string;
  code: string;
  language?: string;
}

/** A labelled code block with a keyboard-friendly copy button. */
export function CodeBlock({ label, code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700/80 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800/80">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-3xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider truncate">
            {label}
          </span>
          {language && (
            <span className="text-3xs px-1.5 py-0.5 rounded-full bg-zinc-200/70 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 font-medium">
              {language}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? `${label} copied` : `Copy ${label}`}
          className="shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-1 text-3xs font-medium text-zinc-500 hover:bg-zinc-200/60 dark:text-zinc-400 dark:hover:bg-zinc-700/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre
        tabIndex={0}
        className="px-3 py-2.5 text-xs font-mono overflow-x-auto text-zinc-700 dark:text-zinc-300 whitespace-pre leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        {code}
      </pre>
    </div>
  );
}
