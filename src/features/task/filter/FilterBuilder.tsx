import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FilterValueInput } from './FilterValueInput';
import {
  OPERATORS_BY_FIELD_TYPE,
  OPERATOR_LABELS,
  type FilterCondition,
  type FilterFieldDef,
  type FilterNode,
  type FilterOperator,
  type FilterTree,
} from './types';

function newCondition(field: FilterFieldDef): FilterCondition {
  return { id: crypto.randomUUID(), field: field.key, operator: OPERATORS_BY_FIELD_TYPE[field.type][0], value: null };
}

function ConditionRow({
  condition,
  fields,
  statusOptions,
  peopleOptions,
  onChange,
  onRemove,
}: {
  condition: FilterCondition;
  fields: FilterFieldDef[];
  statusOptions: { value: string; label: string }[];
  peopleOptions: { value: string; label: string }[];
  onChange: (next: FilterCondition) => void;
  onRemove: () => void;
}) {
  const fieldDef = fields.find((f) => f.key === condition.field) ?? fields[0];
  const operators = OPERATORS_BY_FIELD_TYPE[fieldDef.type];

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Select
        value={condition.field}
        onValueChange={(key) => {
          const next = fields.find((f) => f.key === key)!;
          onChange({ ...condition, field: key, operator: OPERATORS_BY_FIELD_TYPE[next.type][0], value: null });
        }}
      >
        <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {fields.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={condition.operator} onValueChange={(op: FilterOperator) => onChange({ ...condition, operator: op, value: null })}>
        <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {operators.map((op) => <SelectItem key={op} value={op}>{OPERATOR_LABELS[op]}</SelectItem>)}
        </SelectContent>
      </Select>

      <FilterValueInput
        field={fieldDef}
        operator={condition.operator}
        value={condition.value}
        onChange={(v) => onChange({ ...condition, value: v })}
        statusOptions={statusOptions}
        peopleOptions={peopleOptions}
      />

      <button onClick={onRemove} className="text-muted-foreground hover:text-destructive shrink-0" aria-label="Remove condition">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function FilterBuilder({
  tree,
  onChange,
  fields,
  statusOptions,
  peopleOptions,
}: {
  tree: FilterTree;
  onChange: (next: FilterTree) => void;
  fields: FilterFieldDef[];
  statusOptions: { value: string; label: string }[];
  peopleOptions: { value: string; label: string }[];
}) {
  const updateNode = (index: number, node: FilterNode) => {
    const next = [...tree];
    next[index] = node;
    onChange(next);
  };
  const removeNode = (index: number) => onChange(tree.filter((_, i) => i !== index));

  return (
    <div className="space-y-2 p-3 w-[480px]">
      {tree.length === 0 && <p className="text-xs text-muted-foreground">No conditions yet.</p>}

      {tree.map((node, i) => (
        <div key={node.kind === 'condition' ? node.condition.id : node.id}>
          {i > 0 && <p className="text-3xs font-bold uppercase text-muted-foreground mb-1.5">And</p>}
          {node.kind === 'condition' ? (
            <ConditionRow
              condition={node.condition}
              fields={fields}
              statusOptions={statusOptions}
              peopleOptions={peopleOptions}
              onChange={(c) => updateNode(i, { kind: 'condition', condition: c })}
              onRemove={() => removeNode(i)}
            />
          ) : (
            <div className="rounded-md border border-border p-2 space-y-1.5 bg-muted/20">
              <div className="flex items-center justify-between">
                <span className="text-3xs font-bold uppercase text-muted-foreground">Any of</span>
                <button onClick={() => removeNode(i)} className="text-muted-foreground hover:text-destructive" aria-label="Remove group">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {node.conditions.map((c, ci) => (
                <div key={c.id}>
                  {ci > 0 && <p className="text-3xs font-bold uppercase text-muted-foreground mb-1">Or</p>}
                  <ConditionRow
                    condition={c}
                    fields={fields}
                    statusOptions={statusOptions}
                    peopleOptions={peopleOptions}
                    onChange={(updated) => updateNode(i, { ...node, conditions: node.conditions.map((x, xi) => (xi === ci ? updated : x)) })}
                    onRemove={() => updateNode(i, { ...node, conditions: node.conditions.filter((_, xi) => xi !== ci) })}
                  />
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-2xs text-muted-foreground"
                onClick={() => updateNode(i, { ...node, conditions: [...node.conditions, newCondition(fields[0])] })}
              >
                <Plus className="h-3 w-3 mr-1" /> Or condition
              </Button>
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center gap-2 pt-1">
        <Button variant="outline" size="sm" className="h-7 text-2xs" onClick={() => onChange([...tree, { kind: 'condition', condition: newCondition(fields[0]) }])}>
          <Plus className="h-3 w-3 mr-1" /> Condition
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-2xs"
          onClick={() => onChange([...tree, { kind: 'or_group', id: crypto.randomUUID(), conditions: [newCondition(fields[0]), newCondition(fields[0])] }])}
        >
          <Plus className="h-3 w-3 mr-1" /> Or group
        </Button>
      </div>
    </div>
  );
}
