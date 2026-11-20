import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { CONNECTION_PRESETS, type ConnectionPreset } from '../connectionPresets';
import { ToolIcon } from './ToolIcon';

/** Step 1: pick the tool. A searchable grid; "Any other tool (API)" is always last. */
export function ToolPicker({ onPick }: { onPick: (p: ConnectionPreset) => void }) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? CONNECTION_PRESETS.filter((p) => `${p.name} ${p.tagline}`.toLowerCase().includes(q)) : CONNECTION_PRESETS;
    return [...list.filter((p) => p.id !== 'custom'), ...list.filter((p) => p.id === 'custom')];
  }, [query]);
  return (
    <div className="space-y-3" data-testid="tool-picker">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tools, for example Slack or Airtable" aria-label="Search tools" className="pl-9" />
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tool matches "{query}". Pick "Any other tool (API)" to connect anything that has an API.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 md:grid-cols-3" aria-label="Tools">
          {shown.map((p) => (
            <li key={p.id}>
              <button
                type="button" onClick={() => onPick(p)} data-testid={`tool-${p.id}`}
                className="flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left kd-transition hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ToolIcon preset={p} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{p.tagline}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
