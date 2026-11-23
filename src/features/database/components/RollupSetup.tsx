import { useId, type ReactNode } from 'react';
import { ArrowRight, Check, Info } from 'lucide-react';
import type { FieldMeta } from '../types';
import {
  canonicalFunction,
  describeSetup,
  fieldChoiceLabel,
  functionsForTarget,
  reconcileFunction,
  rollupFunction,
  setupProblem,
  type RollupKind,
} from '../lib/rollupSetup';
import { SETTINGS_INPUT } from './SettingsParts';

/**
 * Setting up a Lookup, Rollup or Count in three clear steps instead of three bare dropdowns:
 * 1. which link to follow, 2. which field to read, 3. how to combine the values.
 * Each step opens when the one before is done, the function menu offers only what fits the field chosen and
 * says in plain words what each does, and a sentence with a worked example shows the result before saving.
 */

interface RollupSetupProps {
  kind: RollupKind;
  linkFields: FieldMeta[];
  tables: Array<{ id: string; name: string }>;
  linkFieldId: string;
  onLinkField: (id: string) => void;
  /** The linked table's fields. */
  targetFields: FieldMeta[];
  /** Lookup: the field to show. Rollup: the field to work on ('' means just count). */
  targetFieldId: string;
  onTargetField: (id: string) => void;
  fn: string;
  onFn: (fn: string) => void;
  /** Called from the "no link fields yet" message. Without it the message just says what to do. */
  onCreateLinkField?: () => void;
}

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-3xs font-semibold transition-colors ${
          done ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground'
        }`}
      >
        {done ? <Check size={11} /> : n}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-xs-plus font-medium text-foreground">
          <span className="sr-only">Step {n}: </span>
          {title}
        </p>
        {children}
      </div>
    </li>
  );
}

export function RollupSetup({
  kind,
  linkFields,
  tables,
  linkFieldId,
  onLinkField,
  targetFields,
  targetFieldId,
  onTargetField,
  fn,
  onFn,
  onCreateLinkField,
}: RollupSetupProps) {
  const linkId = useId();
  const fieldId = useId();
  const groupId = useId();

  if (linkFields.length === 0) {
    return (
      <div className="rounded-xl border border-border/70 bg-muted/30 p-4 flex items-start gap-3" data-rollup-empty>
        <Info size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
        <div className="space-y-2 min-w-0">
          <p className="text-xs-plus font-medium text-foreground">This table has no link fields yet</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            A {kind.toLowerCase()} reads from records in another table, so it needs a link to that table first.
          </p>
          {onCreateLinkField ? (
            <button
              type="button"
              onClick={onCreateLinkField}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 h-8 text-xs font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              Create a link field <ArrowRight size={13} aria-hidden="true" />
            </button>
          ) : (
            <p className="text-xs text-muted-foreground">Add a link field to this table, then come back to set this up.</p>
          )}
        </div>
      </div>
    );
  }

  const link = linkFields.find((f) => f.id === linkFieldId);
  const linkedTable = tables.find((t) => t.id === link?.options?.relatedTableId);
  const target = targetFields.find((f) => f.id === targetFieldId);
  const hasField = !!target;
  const showFieldStep = kind !== 'Count' && !!link;
  const showFunctionStep = kind === 'Rollup' && !!link;
  const functions = functionsForTarget(target?.ui_type, hasField);
  const info = rollupFunction(fn);
  const problem = setupProblem({ kind, linkFieldId, targetFieldId, fn }, true);
  const summary = problem
    ? ''
    : describeSetup({ kind, fn, linkName: link?.name ?? '', fieldName: target?.name ?? '' });
  const example = kind === 'Rollup' && info ? info.example : null;

  const chooseField = (id: string) => {
    onTargetField(id);
    if (kind === 'Rollup') {
      const next = targetFields.find((f) => f.id === id);
      onFn(reconcileFunction(fn, next?.ui_type, !!next));
    }
  };

  return (
    <div className="rounded-xl border border-border/70 bg-muted/30 p-4 space-y-4" data-rollup-setup>
      <ol className="space-y-4">
        <Step n={1} done={!!link} title="Which link should it follow?">
          <label htmlFor={linkId} className="sr-only">Link field</label>
          <select
            id={linkId}
            value={linkFieldId}
            onChange={(e) => onLinkField(e.target.value)}
            className={SETTINGS_INPUT}
          >
            <option value="">Choose a link field…</option>
            {linkFields.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          {link && (
            <p className="text-2xs text-muted-foreground">
              {linkedTable ? <>Reads from the records in <strong className="font-medium text-foreground">{linkedTable.name}</strong>.</> : 'Reads from the linked records.'}
            </p>
          )}
        </Step>

        {showFieldStep && (
          <Step
            n={2}
            done={kind === 'Lookup' ? hasField : true}
            title={kind === 'Lookup' ? 'Which field do you want to show?' : 'Which field do you want to work on?'}
          >
            <label htmlFor={fieldId} className="sr-only">{kind === 'Lookup' ? 'Field to show' : 'Field to work on'}</label>
            <select id={fieldId} value={targetFieldId} onChange={(e) => chooseField(e.target.value)} className={SETTINGS_INPUT}>
              <option value="">{kind === 'Lookup' ? 'Choose a field…' : 'No field: just count the linked records'}</option>
              {targetFields.map((f) => (
                <option key={f.id} value={f.id}>{fieldChoiceLabel(f)}</option>
              ))}
            </select>
          </Step>
        )}

        {showFunctionStep && (
          <Step n={3} done={!!info && (!info.needsField || hasField)} title="How should the values be combined?">
            <div role="radiogroup" aria-label="How to combine the values" className="space-y-1.5">
              {functions.map((f) => {
                const selected = canonicalFunction(fn) === f.name;
                return (
                  <label
                    key={f.name}
                    htmlFor={`${groupId}-${f.name}`}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors ${
                      selected ? 'border-primary/50 bg-primary/5' : 'border-border/70 hover:bg-muted/60'
                    }`}
                  >
                    <input
                      id={`${groupId}-${f.name}`}
                      type="radio"
                      name={groupId}
                      checked={selected}
                      onChange={() => onFn(f.name)}
                      className="mt-0.5 accent-primary"
                    />
                    <span className="min-w-0">
                      <span className="block text-xs-plus font-medium text-foreground">{f.label}</span>
                      <span className="block text-2xs text-muted-foreground leading-snug">{f.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </Step>
        )}
      </ol>

      <div className="rounded-lg border border-border/70 bg-background px-3 py-2.5" aria-live="polite" data-rollup-summary>
        {summary ? (
          <div className="space-y-1.5">
            <p className="text-xs-plus text-foreground">{summary}</p>
            {example && (
              <p className="text-2xs text-muted-foreground">
                Example: linked records with{' '}
                <span className="font-mono text-foreground">{example.values.join(' · ')}</span>
                <ArrowRight size={11} className="mx-1 inline" aria-hidden="true" />
                <span className="font-mono font-medium text-foreground">{example.result}</span>
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{setupProblem({ kind, linkFieldId, targetFieldId, fn }, true)}</p>
        )}
      </div>
    </div>
  );
}
