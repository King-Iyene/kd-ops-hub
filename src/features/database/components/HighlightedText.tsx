import { highlightRuns } from '../lib/fuzzy';

/** Text with the characters that matched a search drawn heavier and in the accent colour. */
export function HighlightedText({ text, indices }: { text: string; indices: readonly number[] }) {
  if (indices.length === 0) return <>{text}</>;
  return (
    <>
      {highlightRuns(text, indices).map((run, i) =>
        run.match ? (
          <span key={i} className="font-semibold text-primary">
            {run.text}
          </span>
        ) : (
          <span key={i}>{run.text}</span>
        ),
      )}
    </>
  );
}
