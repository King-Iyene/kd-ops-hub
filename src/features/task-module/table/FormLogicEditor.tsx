import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { FormCondition, FormRule, PersonOption, TableField } from '@/queries/useTaskModule';
import { FieldLabel } from './cells';
import {
  conditionComplete, conditionWith, defaultCondition, invalidConditions, isConditionSource, opLabel, opsForField, valueKind,
} from './formLogic';

// "Show/Hide this question when …" — the rule for one question. Conditions
// can only look at questions above it, so they can never loop.
export function RuleEditor({
  question, asked, rule, people, onChange,
}: {
  question: TableField;
  /** Every question on the form, in order. */
  asked: TableField[];
  rule: FormRule | undefined;
  people: PersonOption[];
  onChange: (rule: FormRule | undefined) => void;
}) {
  const index = asked.findIndex((f) => f.id === question.id);
  const sources = asked.slice(0, index).filter(isConditionSource);
  const byId = new Map(asked.map((f) => [f.id, f]));
  const orderedIds = asked.map((f) => f.id);
  const invalid = new Set(invalidConditions(rule, question.id, orderedIds, byId));

  const update = (patch: Partial<FormRule>) => rule && onChange({ ...rule, ...patch });
  const setCondition = (i: number, c: FormCondition) => rule && onChange({ ...rule, conditions: rule.conditions.map((x, j) => (j === i ? c : x)) });
  const removeCondition = (i: number) => {
    if (!rule) return;
    const conditions = rule.conditions.filter((_, j) => j !== i);
    onChange(conditions.length ? { ...rule, conditions } : undefined);
  };
  const addCondition = () => {
    const first = sources[0];
    if (!first) return;
    const c = defaultCondition(first);
    onChange(rule ? { ...rule, conditions: [...rule.conditions, c] } : { mode: 'show', match: 'all', conditions: [c] });
  };

  if (sources.length === 0) {
    return (
      <p className="text-2xs text-muted-foreground px-3 py-2" data-logic-empty>
        {index === 0
          ? 'This is the first question, so there is nothing above it to base a condition on.'
          : 'No question above this one can be used in a condition. Move this question lower, or add a question that is a choice, number, tick box or text.'}
      </p>
    );
  }

  return (
    <div className="px-3 py-2 space-y-2 bg-muted/20" data-logic-editor={question.name}>
      {!rule ? (
        <p className="text-2xs text-muted-foreground">Always shown. Add a condition to show or hide this question based on an earlier answer.</p>
      ) : (
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          <Select value={rule.mode} onValueChange={(v) => update({ mode: v as FormRule['mode'] })}>
            <SelectTrigger className="h-7 w-40 text-xs" aria-label="Show or hide"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="show">Show this question</SelectItem>
              <SelectItem value="hide">Hide this question</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">when</span>
          {rule.conditions.length > 1 && (
            <>
              <Select value={rule.match} onValueChange={(v) => update({ match: v as FormRule['match'] })}>
                <SelectTrigger className="h-7 w-20 text-xs" aria-label="All or any"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">all</SelectItem>
                  <SelectItem value="any">any</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-muted-foreground">of these are true</span>
            </>
          )}
        </div>
      )}

      {rule?.conditions.map((c, i) => {
        const source = byId.get(c.field);
        const bad = invalid.has(c);
        return (
          <div key={i} className={cn('rounded-md border bg-card p-2 space-y-1.5', bad ? 'border-destructive/50' : 'border-border/70')} data-condition={i}>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Select
                value={source && !bad ? c.field : undefined}
                onValueChange={(id) => {
                  const f = byId.get(id);
                  if (f) setCondition(i, defaultCondition(f));
                }}
              >
                <SelectTrigger className="h-7 w-44 text-xs" aria-label="Question"><SelectValue placeholder="Choose a question" /></SelectTrigger>
                <SelectContent>
                  {sources.map((f) => <SelectItem key={f.id} value={f.id}><FieldLabel field={f} /></SelectItem>)}
                </SelectContent>
              </Select>
              {source && !bad && (
                <Select value={c.op} onValueChange={(op) => setCondition(i, conditionWith(c, { op: op as FormCondition['op'] }, source))}>
                  <SelectTrigger className="h-7 w-40 text-xs" aria-label="Condition"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {opsForField(source.type).map((op) => <SelectItem key={op} value={op}>{opLabel(op, source.type)}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <button type="button" onClick={() => removeCondition(i)} aria-label="Remove condition" className="ml-auto text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {source && !bad && <ValueBox condition={c} source={source} people={people} onChange={(value) => setCondition(i, { ...c, value })} />}
            {bad && (
              <p className="text-2xs text-destructive">
                This looks at a question that is no longer above this one (moved, removed, or not usable). Pick another, or it is dropped when you save.
              </p>
            )}
            {source && !bad && !conditionComplete(c, source.type) && <p className="text-2xs text-amber-600 dark:text-amber-400">Choose or type a value.</p>}
          </div>
        );
      })}

      <Button type="button" size="sm" variant="ghost" className="h-7 text-xs gap-1 px-2" onClick={addCondition}>
        <Plus className="h-3.5 w-3.5" /> Add condition
      </Button>
      {rule && (
        <button type="button" className="ml-2 text-2xs text-muted-foreground hover:text-foreground" onClick={() => onChange(undefined)}>
          Remove the rule (always show)
        </button>
      )}
    </div>
  );
}

function ValueBox({ condition, source, people, onChange }: {
  condition: FormCondition; source: TableField; people: PersonOption[]; onChange: (v: unknown) => void;
}) {
  const kind = valueKind(source.type, condition.op);
  const options = source.config.options ?? [];
  const picked = Array.isArray(condition.value) ? (condition.value as string[]) : [];
  switch (kind) {
    case 'none':
      return null;
    case 'text':
      return <Input className="h-7 text-xs" aria-label="Value" placeholder="Type a value" value={typeof condition.value === 'string' ? condition.value : ''} onChange={(e) => onChange(e.target.value)} />;
    case 'number':
      return (
        <Input
          className="h-7 text-xs w-32"
          type="number"
          step="any"
          aria-label="Value"
          placeholder="Number"
          value={condition.value == null ? '' : String(condition.value)}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      );
    case 'option':
      return (
        <Select value={typeof condition.value === 'string' ? condition.value : undefined} onValueChange={onChange}>
          <SelectTrigger className="h-7 text-xs" aria-label="Value"><SelectValue placeholder="Choose an option" /></SelectTrigger>
          <SelectContent>{options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
        </Select>
      );
    case 'options':
      return (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {options.map((o) => (
            <label key={o} className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
              <Checkbox checked={picked.includes(o)} onCheckedChange={(c) => onChange(c ? [...picked, o] : picked.filter((x) => x !== o))} /> {o}
            </label>
          ))}
        </div>
      );
    case 'people':
      return (
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs max-w-full">
              <span className="truncate">{picked.length ? picked.map((id) => people.find((p) => p.id === id)?.full_name ?? 'Former member').join(', ') : 'Choose people'}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-2 max-h-64 overflow-y-auto space-y-0.5">
            {people.map((p) => (
              <label key={p.id} className="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted/50 cursor-pointer">
                <Checkbox checked={picked.includes(p.id)} onCheckedChange={(c) => onChange(c ? [...picked, p.id] : picked.filter((x) => x !== p.id))} /> {p.full_name}
              </label>
            ))}
          </PopoverContent>
        </Popover>
      );
  }
}
