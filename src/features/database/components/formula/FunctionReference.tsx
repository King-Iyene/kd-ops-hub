import { useId, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { searchFunctionDocs } from '../../lib/formulaDocs';

/**
 * Every formula function by category, with a search box. Each row shows the signature, what it does and an
 * example; clicking one puts it into the formula. Fed by the same table as autocomplete and the hint, so they agree.
 */
export function FunctionReference({ onPick }: { onPick: (name: string) => void }) {
  const [query, setQuery] = useState('');
  const searchId = useId();
  const groups = useMemo(() => searchFunctionDocs(query), [query]);

  return (
    <div className="rounded-lg border border-border bg-card" data-function-reference>
      <div className="relative border-b border-border p-2">
        <label htmlFor={searchId} className="sr-only">Search functions</label>
        <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          id={searchId}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search functions, e.g. round or date"
          className="w-full h-8 pl-7 pr-2 rounded-md border border-input bg-background text-xs-plus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />
      </div>
      <div className="max-h-56 overflow-y-auto p-1" role="list" aria-label="Functions">
        {groups.length === 0 && <p className="px-3 py-4 text-xs text-muted-foreground">No function matches “{query}”.</p>}
        {groups.map((group) => (
          <section key={group.category} aria-label={group.category}>
            <h4 className="px-2 pt-2 pb-1 text-3xs font-semibold uppercase tracking-wider text-muted-foreground">{group.category}</h4>
            {group.items.map((fn) => (
              <button
                key={fn.name}
                type="button"
                role="listitem"
                onClick={() => onPick(fn.name)}
                className="w-full text-left rounded-md px-2 py-1.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <span className="block font-mono text-xs text-foreground">{fn.signature}</span>
                <span className="block text-2xs text-muted-foreground leading-snug">{fn.description}</span>
                <span className="block font-mono text-3xs text-muted-foreground/80 mt-0.5">{fn.example}</span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
