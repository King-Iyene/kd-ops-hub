import { useId } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { describeRelation, relationLabel, singular } from '../lib/linkSetup';
import { SETTINGS_INPUT } from './SettingsParts';

/**
 * Linking to another table, asked as two plain questions (one or many, each way) with a sentence that says
 * what they mean, and a name for the matching field that appears on the other table.
 */

interface LinkSetupProps {
  thisTableName: string;
  tables: Array<{ id: string; name: string }>;
  targetTableId: string;
  onTarget: (id: string) => void;
  linksToMany: boolean;
  onLinksToMany: (many: boolean) => void;
  linkedFromMany: boolean;
  onLinkedFromMany: (many: boolean) => void;
  reciprocalName: string;
  onReciprocalName: (name: string) => void;
}

function Choice({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex-1 rounded-lg border px-3 py-2 text-xs-plus font-medium transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
        selected ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
      )}
    >
      {label}
    </button>
  );
}

export function LinkSetup({
  thisTableName,
  tables,
  targetTableId,
  onTarget,
  linksToMany,
  onLinksToMany,
  linkedFromMany,
  onLinkedFromMany,
  reciprocalName,
  onReciprocalName,
}: LinkSetupProps) {
  const tableId = useId();
  const nameId = useId();
  const target = tables.find((t) => t.id === targetTableId);
  const here = singular(thisTableName);
  const there = target ? singular(target.name) : 'record';

  return (
    <div className="rounded-xl border border-border/70 bg-muted/30 p-4 space-y-4" data-link-setup>
      <div className="space-y-1.5">
        <label htmlFor={tableId} className="block text-xs-plus font-medium text-foreground">Which table do you want to link to?</label>
        <select id={tableId} value={targetTableId} onChange={(e) => onTarget(e.target.value)} className={SETTINGS_INPUT}>
          <option value="">Choose a table…</option>
          {tables.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {target && (
        <>
          <div className="space-y-1.5" role="radiogroup" aria-label={`How many ${target.name} can one ${here} link to`}>
            <p className="text-xs-plus font-medium text-foreground">
              How many <span className="text-primary">{target.name}</span> can one <span className="text-primary">{here}</span> link to?
            </p>
            <div className="flex gap-2">
              <Choice label={`Only one ${there}`} selected={!linksToMany} onSelect={() => onLinksToMany(false)} />
              <Choice label={`Many ${target.name}`} selected={linksToMany} onSelect={() => onLinksToMany(true)} />
            </div>
          </div>

          <div className="space-y-1.5" role="radiogroup" aria-label={`How many ${thisTableName} can one ${there} be linked from`}>
            <p className="text-xs-plus font-medium text-foreground">
              How many <span className="text-primary">{thisTableName}</span> can one <span className="text-primary">{there}</span> be linked from?
            </p>
            <div className="flex gap-2">
              <Choice label={`Only one ${here}`} selected={!linkedFromMany} onSelect={() => onLinkedFromMany(false)} />
              <Choice label={`Many ${thisTableName}`} selected={linkedFromMany} onSelect={() => onLinkedFromMany(true)} />
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-background px-3 py-2.5 space-y-1" aria-live="polite" data-link-summary>
            <p className="flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
              <ArrowLeftRight size={11} aria-hidden="true" /> {relationLabel(linksToMany, linkedFromMany)}
            </p>
            <p className="text-xs-plus text-foreground leading-snug">{describeRelation(thisTableName, target.name, linksToMany, linkedFromMany)}</p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor={nameId} className="block text-xs-plus font-medium text-foreground">
              Name of the matching field in {target.name}
            </label>
            <input
              id={nameId}
              value={reciprocalName}
              onChange={(e) => onReciprocalName(e.target.value)}
              placeholder={thisTableName}
              className={SETTINGS_INPUT}
            />
            <p className="text-2xs text-muted-foreground leading-snug">
              A matching field is added to {target.name}, so you can see the links from both tables.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
