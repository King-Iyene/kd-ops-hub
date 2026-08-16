import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { confirm } from '@/hooks/use-confirm';
import type { CustomFieldDefinition, CustomFieldValue } from '@/lib/task-types';

interface CustomFieldsPanelProps {
  taskId: string;
  spaceId: string | null;
}

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Text',
  number: 'Number',
  dropdown: 'Dropdown',
  checkbox: 'Checkbox',
  date: 'Date',
  email: 'Email',
  phone: 'Phone',
  url: 'URL',
  currency: 'Currency',
  rating: 'Rating',
  labels: 'Labels',
};

export function CustomFieldsPanel({ taskId, spaceId }: CustomFieldsPanelProps) {
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const [definitions, setDefinitions] = useState<CustomFieldDefinition[]>([]);
  const [values, setValues] = useState<Map<string, CustomFieldValue>>(new Map());
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState('text');
  const [newFieldOptions, setNewFieldOptions] = useState('');

  const loadFields = useCallback(async () => {
    const filters = spaceId
      ? `space_id.eq.${spaceId},space_id.is.null`
      : 'space_id.is.null';
    const { data: defs } = await supabase
      .from('custom_field_definitions')
      .select('*')
      .or(filters)
      .order('sort_order');
    setDefinitions((defs as CustomFieldDefinition[]) || []);

    const { data: vals } = await supabase
      .from('custom_field_values')
      .select('*')
      .eq('task_id', taskId);
    const map = new Map<string, CustomFieldValue>();
    for (const v of (vals as CustomFieldValue[]) || []) map.set(v.field_id, v);
    setValues(map);
  }, [taskId, spaceId]);

  useEffect(() => { loadFields(); }, [loadFields]);

  const addField = async () => {
    if (!newFieldName.trim()) return;
    const options = newFieldType === 'dropdown' || newFieldType === 'labels'
      ? { choices: newFieldOptions.split(',').map((s) => s.trim()).filter(Boolean) }
      : null;
    const { error } = await supabase.from('custom_field_definitions').insert({
      space_id: spaceId || null,
      name: newFieldName.trim(),
      field_type: newFieldType,
      options,
      sort_order: definitions.length,
      created_by: profile?.id || null,
    });
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    setNewFieldName('');
    setNewFieldOptions('');
    setShowAddField(false);
    loadFields();
  };

  const deleteField = async (id: string) => {
    if (!(await confirm({ title: 'Delete field?', description: 'Delete this custom field from all tasks?', variant: 'destructive' }))) return;
    await supabase.from('custom_field_definitions').delete().eq('id', id);
    loadFields();
  };

  const updateValue = async (fieldId: string, fieldType: string, rawValue: any) => {
    const payload: any = {
      task_id: taskId,
      field_id: fieldId,
      value_text: null,
      value_number: null,
      value_json: null,
      updated_at: new Date().toISOString(),
    };
    if (fieldType === 'number' || fieldType === 'currency' || fieldType === 'rating') {
      payload.value_number = rawValue === '' ? null : Number(rawValue);
    } else if (fieldType === 'checkbox') {
      payload.value_json = rawValue;
    } else if (fieldType === 'dropdown' || fieldType === 'labels') {
      payload.value_json = rawValue;
    } else {
      payload.value_text = rawValue || null;
    }

    const existing = values.get(fieldId);
    if (existing) {
      await supabase.from('custom_field_values').update(payload).eq('id', existing.id);
    } else {
      await supabase.from('custom_field_values').insert(payload);
    }
    loadFields();
  };

  const getValue = (field: CustomFieldDefinition): any => {
    const v = values.get(field.id);
    if (!v) return field.field_type === 'checkbox' ? false : '';
    if (field.field_type === 'number' || field.field_type === 'currency' || field.field_type === 'rating') {
      return v.value_number ?? '';
    }
    if (field.field_type === 'checkbox') return v.value_json ?? false;
    if (field.field_type === 'dropdown' || field.field_type === 'labels') return v.value_json;
    return v.value_text ?? '';
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Custom Fields</p>
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setShowAddField(!showAddField)}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      {showAddField && (
        <div className="p-2 border rounded-md space-y-2 bg-muted/30">
          <Input
            className="h-7 text-xs"
            placeholder="Field name"
            value={newFieldName}
            onChange={(e) => setNewFieldName(e.target.value)}
          />
          <Select value={newFieldType} onValueChange={setNewFieldType}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(FIELD_TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(newFieldType === 'dropdown' || newFieldType === 'labels') && (
            <Input
              className="h-7 text-xs"
              placeholder="Options (comma-separated)"
              value={newFieldOptions}
              onChange={(e) => setNewFieldOptions(e.target.value)}
            />
          )}
          <div className="flex gap-1">
            <Button size="sm" className="h-6 text-[10px] flex-1" onClick={addField}>Add</Button>
            <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setShowAddField(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {definitions.map((field) => {
        const val = getValue(field);
        return (
          <div key={field.id} className="group flex items-start gap-1.5">
            <div className="flex-1 space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">{field.name}</Label>
              {field.field_type === 'text' && (
                <Input
                  className="h-7 text-xs"
                  value={val}
                  onChange={(e) => updateValue(field.id, field.field_type, e.target.value)}
                />
              )}
              {(field.field_type === 'number' || field.field_type === 'currency') && (
                <Input
                  type="number"
                  className="h-7 text-xs"
                  value={val}
                  onChange={(e) => updateValue(field.id, field.field_type, e.target.value)}
                />
              )}
              {field.field_type === 'rating' && (
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => updateValue(field.id, field.field_type, n === val ? 0 : n)}
                      className={cn(
                        'h-5 w-5 rounded text-[10px] font-bold transition-colors',
                        n <= (val || 0)
                          ? 'bg-amber-400 text-white'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}
              {field.field_type === 'checkbox' && (
                <Switch
                  checked={!!val}
                  onCheckedChange={(v) => updateValue(field.id, field.field_type, v)}
                />
              )}
              {field.field_type === 'date' && (
                <Input
                  type="date"
                  className="h-7 text-xs"
                  value={val}
                  onChange={(e) => updateValue(field.id, field.field_type, e.target.value)}
                />
              )}
              {(field.field_type === 'email' || field.field_type === 'phone' || field.field_type === 'url') && (
                <Input
                  type={field.field_type === 'email' ? 'email' : field.field_type === 'url' ? 'url' : 'tel'}
                  className="h-7 text-xs"
                  value={val}
                  onChange={(e) => updateValue(field.id, field.field_type, e.target.value)}
                />
              )}
              {field.field_type === 'dropdown' && (
                <Select value={val || ''} onValueChange={(v) => updateValue(field.id, field.field_type, v)}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {(field.options?.choices || []).map((c: string) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {field.field_type === 'labels' && (
                <div className="flex flex-wrap gap-1">
                  {(field.options?.choices || []).map((c: string) => {
                    const selected = Array.isArray(val) && val.includes(c);
                    return (
                      <button
                        key={c}
                        onClick={() => {
                          const arr = Array.isArray(val) ? [...val] : [];
                          if (selected) arr.splice(arr.indexOf(c), 1);
                          else arr.push(c);
                          updateValue(field.id, field.field_type, arr);
                        }}
                        className={cn(
                          'text-[10px] px-2 py-0.5 rounded-full border transition-colors',
                          selected
                            ? 'bg-primary/10 text-primary border-primary/30'
                            : 'bg-muted text-muted-foreground border-border',
                        )}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 mt-4"
              onClick={() => deleteField(field.id)}
            >
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
