import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Table2, Trash2, Loader2, MoreHorizontal, EyeOff, ListFilter,
  Type, AlignLeft, Hash, CalendarDays, CheckSquare, ListChecks,
  User, Users, Link2, AtSign, Phone, Globe, Copy, FileText, Check, Sigma, CheckCircle2, GripVertical,
  AlertTriangle, TrendingUp,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as ChartTooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import {
  evaluateFormula, isFormulaError, formatNumericValue, FLEX_NUMBER_FORMATS,
  type FormulaValue, type FlexNumberFormat,
} from '@/lib/flexFormula';
import { chartTheme, axisTick, chartAnim, GlassTooltip } from '@/components/ChartKit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import {
  flexApi, FLEX_FIELD_TYPES, type FlexTable, type FlexField, type FlexRecord,
  type FlexForm, type FlexFieldType, type FlexChoice, type FlexFormField,
} from '@/lib/flexTables';

const FIELD_ICONS: Record<FlexFieldType, typeof Type> = {
  text: Type, long_text: AlignLeft, number: Hash, date: CalendarDays, checkbox: CheckSquare,
  select: ListChecks, multi_select: ListChecks, person: User, multi_person: Users,
  task_link: Link2, completed_task_link: CheckCircle2, url: Globe, email: AtSign, phone: Phone, formula: Sigma,
};

/** Flattens a record's other fields to { fieldName: displayValue } for the
 *  formula engine. Formula fields are deliberately excluded from the map
 *  (referencing one resolves to null) to avoid needing dependency-ordered
 *  evaluation or guarding against circular formulas. */
function buildFormulaScope(
  record: FlexRecord,
  allFields: FlexField[],
  profilesById: Map<string, ProfileLite>,
  tasksById: Map<string, TaskLite>,
): Record<string, FormulaValue> {
  const scope: Record<string, FormulaValue> = {};
  for (const f of allFields) {
    if (f.type === 'formula') continue;
    const v = record.data[f.id];
    switch (f.type) {
      case 'checkbox':
        scope[f.name] = !!v;
        break;
      case 'number':
        scope[f.name] = typeof v === 'number' ? v : v == null ? null : Number(v);
        break;
      case 'select': {
        const choice = f.options.choices?.find((c) => c.id === v);
        scope[f.name] = choice?.label ?? null;
        break;
      }
      case 'multi_select': {
        const ids = Array.isArray(v) ? (v as string[]) : [];
        scope[f.name] = ids.map((id) => f.options.choices?.find((c) => c.id === id)?.label).filter(Boolean).join(', ');
        break;
      }
      case 'person':
        scope[f.name] = profilesById.get(v as string)?.full_name ?? null;
        break;
      case 'multi_person': {
        const ids = Array.isArray(v) ? (v as string[]) : [];
        scope[f.name] = ids.map((id) => profilesById.get(id)?.full_name).filter(Boolean).join(', ');
        break;
      }
      case 'task_link': case 'completed_task_link': {
        const ids = Array.isArray(v) ? (v as string[]) : [];
        scope[f.name] = ids.map((id) => tasksById.get(id)?.title).filter(Boolean).join(', ');
        break;
      }
      default:
        scope[f.name] = (v as FormulaValue) ?? null;
    }
  }

  // Second pass: formula fields can reference each other one level deep —
  // evaluated against the raw-field scope above only (never against each
  // other's results), so there's no possibility of a circular dependency.
  for (const f of allFields) {
    if (f.type !== 'formula') continue;
    const result = evaluateFormula(f.options.formula || '', scope);
    scope[f.name] = isFormulaError(result) ? null : result;
  }
  return scope;
}

/** Resolves any field's raw stored value to a plain display string, used
 *  for grouping and filtering (both need a comparable, human-readable key
 *  regardless of the field's underlying shape). */
function resolveDisplayValue(
  field: FlexField,
  value: unknown,
  profilesById: Map<string, ProfileLite>,
  tasksById: Map<string, TaskLite>,
): string {
  if (value === undefined || value === null || value === '') return '(Empty)';
  switch (field.type) {
    case 'checkbox':
      return value ? 'Checked' : 'Unchecked';
    case 'select':
      return field.options.choices?.find((c) => c.id === value)?.label || '(Empty)';
    case 'multi_select': {
      const ids = Array.isArray(value) ? (value as string[]) : [];
      const labels = ids.map((id) => field.options.choices?.find((c) => c.id === id)?.label).filter(Boolean);
      return labels.length ? labels.join(', ') : '(Empty)';
    }
    case 'person':
      return profilesById.get(value as string)?.full_name || '(Empty)';
    case 'multi_person': {
      const ids = Array.isArray(value) ? (value as string[]) : [];
      const names = ids.map((id) => profilesById.get(id)?.full_name).filter(Boolean);
      return names.length ? names.join(', ') : '(Empty)';
    }
    case 'task_link': case 'completed_task_link': {
      const ids = Array.isArray(value) ? (value as string[]) : [];
      const titles = ids.map((id) => tasksById.get(id)?.title).filter(Boolean);
      return titles.length ? titles.join(', ') : '(Empty)';
    }
    default:
      return String(value);
  }
}

/** Same as resolveDisplayValue, but also handles Formula fields — which
 *  have no value of their own in record.data and must be computed from
 *  the rest of the record instead. Used by grouping and filtering so
 *  formula columns work exactly like any other field there. */
function getFieldDisplayValue(
  field: FlexField,
  record: FlexRecord,
  allFields: FlexField[],
  profilesById: Map<string, ProfileLite>,
  tasksById: Map<string, TaskLite>,
): string {
  if (field.type === 'formula') {
    const scope = buildFormulaScope(record, allFields, profilesById, tasksById);
    const result = evaluateFormula(field.options.formula || '', scope);
    if (isFormulaError(result)) return '(Error)';
    if (result === null || result === undefined || result === '') return '(Empty)';
    return String(result);
  }
  return resolveDisplayValue(field, record.data[field.id], profilesById, tasksById);
}

type FilterOp = 'contains' | 'not_contains' | 'is' | 'is_not' | 'is_empty' | 'is_not_empty' | 'gt' | 'lt' | 'gte' | 'lte';

interface FlexFilter { id: string; fieldId: string; operator: FilterOp; value: string; }

const TEXT_OPS: { value: FilterOp; label: string }[] = [
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'is', label: 'is' },
  { value: 'is_not', label: 'is not' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
];

const NUMERIC_OPS: { value: FilterOp; label: string }[] = [
  { value: 'is', label: '=' }, { value: 'is_not', label: '≠' },
  { value: 'gt', label: '>' }, { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' }, { value: 'lte', label: '≤' },
  { value: 'is_empty', label: 'is empty' }, { value: 'is_not_empty', label: 'is not empty' },
];

const DATE_OPS: { value: FilterOp; label: string }[] = [
  { value: 'is', label: 'is on' }, { value: 'is_not', label: 'is not on' },
  { value: 'gt', label: 'is after' }, { value: 'gte', label: 'is on or after' },
  { value: 'lt', label: 'is before' }, { value: 'lte', label: 'is on or before' },
  { value: 'is_empty', label: 'is empty' }, { value: 'is_not_empty', label: 'is not empty' },
];

const CHECKBOX_OPS: { value: FilterOp; label: string }[] = [
  { value: 'is', label: 'is' },
];

const SINGLE_PICK_OPS: { value: FilterOp; label: string }[] = [
  { value: 'is', label: 'is' }, { value: 'is_not', label: 'is not' },
  { value: 'is_empty', label: 'is empty' }, { value: 'is_not_empty', label: 'is not empty' },
];

const MULTI_PICK_OPS: { value: FilterOp; label: string }[] = [
  { value: 'is', label: 'has' }, { value: 'is_not', label: 'does not have' },
  { value: 'is_empty', label: 'is empty' }, { value: 'is_not_empty', label: 'is not empty' },
];

/** Field types whose "has"/"does not have" checks one item out of a
 *  comma-joined list, rather than an exact match against the whole value. */
function isMultiValueField(type: FlexFieldType): boolean {
  return type === 'multi_select' || type === 'multi_person' || type === 'task_link' || type === 'completed_task_link';
}

function operatorsForField(field: FlexField | undefined): { value: FilterOp; label: string }[] {
  switch (field?.type) {
    case 'number': return NUMERIC_OPS;
    case 'date': return DATE_OPS;
    case 'checkbox': return CHECKBOX_OPS;
    case 'select': case 'person': return SINGLE_PICK_OPS;
    case 'multi_select': case 'multi_person': case 'task_link': case 'completed_task_link': return MULTI_PICK_OPS;
    case 'formula':
      // A formula can produce text or a number, so offer both operator sets.
      return [...TEXT_OPS, ...NUMERIC_OPS.filter((o) => o.value === 'gt' || o.value === 'gte' || o.value === 'lt' || o.value === 'lte')];
    default: return TEXT_OPS;
  }
}

function filterMatches(
  field: FlexField,
  record: FlexRecord,
  allFields: FlexField[],
  filter: FlexFilter,
  profilesById: Map<string, ProfileLite>,
  tasksById: Map<string, TaskLite>,
): boolean {
  const display = getFieldDisplayValue(field, record, allFields, profilesById, tasksById);
  const isEmpty = display === '(Empty)';
  const multi = isMultiValueField(field.type);
  switch (filter.operator) {
    case 'is_empty': return isEmpty;
    case 'is_not_empty': return !isEmpty;
    case 'contains': return display.toLowerCase().includes(filter.value.toLowerCase());
    case 'not_contains': return !display.toLowerCase().includes(filter.value.toLowerCase());
    case 'is':
      if (multi) return display.toLowerCase().split(', ').includes(filter.value.toLowerCase());
      return display.toLowerCase() === filter.value.toLowerCase();
    case 'is_not':
      if (multi) return !display.toLowerCase().split(', ').includes(filter.value.toLowerCase());
      return display.toLowerCase() !== filter.value.toLowerCase();
    case 'gt': case 'lt': case 'gte': case 'lte': {
      // Dates are stored/displayed as ISO YYYY-MM-DD, which sorts correctly
      // as plain strings — no need for real Date parsing.
      if (field.type === 'date') {
        if (isEmpty || !filter.value) return false;
        if (filter.operator === 'gt') return display > filter.value;
        if (filter.operator === 'lt') return display < filter.value;
        if (filter.operator === 'gte') return display >= filter.value;
        return display <= filter.value;
      }
      const n = parseFloat(display);
      const target = parseFloat(filter.value);
      if (isNaN(n) || isNaN(target)) return false;
      if (filter.operator === 'gt') return n > target;
      if (filter.operator === 'lt') return n < target;
      if (filter.operator === 'gte') return n >= target;
      return n <= target;
    }
    default: return true;
  }
}

const CHOICE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#64748b'];

const NUMERIC_FORMULA_FORMATS = new Set<FlexNumberFormat>(['integer', 'decimal', 'currency_ngn', 'currency_usd', 'percent']);

/** Sample value for a referenced field while live-previewing a formula
 *  being written. A referenced Formula field whose own output format is
 *  explicitly numeric (Integer, Decimal, Currency, Percent — anything
 *  but the ambiguous default "Plain number") is treated as a number here,
 *  same as a real Number field — matching how it actually resolves at
 *  runtime via buildFormulaScope, regardless of when that other formula
 *  was set up. */
function sampleValueForField(f: FlexField): FormulaValue {
  if (f.type === 'number') return 1;
  if (f.type === 'checkbox') return true;
  if (f.type === 'date') return new Date().toISOString().slice(0, 10);
  if (f.type === 'formula' && f.options.format && NUMERIC_FORMULA_FORMATS.has(f.options.format)) return 1;
  return 'sample';
}

interface ProfileLite { id: string; full_name: string; email: string; }
interface TaskLite { id: string; title: string; status: string; completed_at: string | null; }

/** The filter value's input widget, matched to the field's type — a date
 *  picker for Date, a dropdown of real choices/names for Select/Person and
 *  their multi- variants, Yes/No for Checkbox, and free text otherwise. */
function FilterValueInput({
  field, value, profilesById, onChange,
}: {
  field: FlexField;
  value: string;
  profilesById: Map<string, ProfileLite>;
  onChange: (v: string) => void;
}) {
  switch (field.type) {
    case 'date':
      return <Input type="date" className="h-7 text-xs flex-1" value={value} onChange={(e) => onChange(e.target.value)} />;
    case 'number':
      return <Input type="number" className="h-7 text-xs flex-1" value={value} onChange={(e) => onChange(e.target.value)} placeholder="value" />;
    case 'checkbox':
      return (
        <Select value={value || undefined} onValueChange={onChange}>
          <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="value" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Checked">Checked</SelectItem>
            <SelectItem value="Unchecked">Unchecked</SelectItem>
          </SelectContent>
        </Select>
      );
    case 'select':
    case 'multi_select':
      return (
        <Select value={value || undefined} onValueChange={onChange}>
          <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="value" /></SelectTrigger>
          <SelectContent>
            {(field.options.choices || []).map((c) => <SelectItem key={c.id} value={c.label}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    case 'person':
    case 'multi_person':
      return (
        <Select value={value || undefined} onValueChange={onChange}>
          <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="value" /></SelectTrigger>
          <SelectContent>
            {Array.from(profilesById.values()).map((p) => <SelectItem key={p.id} value={p.full_name}>{p.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    default:
      return <Input className="h-7 text-xs flex-1" value={value} onChange={(e) => onChange(e.target.value)} placeholder="value" />;
  }
}

export default function FlexTables() {
  usePageTitle('Tables');
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const [tables, setTables] = useState<FlexTable[]>([]);
  const [loadingTables, setLoadingTables] = useState(true);
  const [selectedTable, setSelectedTable] = useState<FlexTable | null>(null);

  const [fields, setFields] = useState<FlexField[]>([]);
  const [records, setRecords] = useState<FlexRecord[]>([]);
  const [forms, setForms] = useState<FlexForm[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [tab, setTab] = useState<'dashboard' | 'grid' | 'forms'>('dashboard');

  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [tasksList, setTasksList] = useState<TaskLite[]>([]);

  const [newTableDialog, setNewTableDialog] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [fieldDialog, setFieldDialog] = useState<FlexField | 'new' | null>(null);
  const [formDialog, setFormDialog] = useState<FlexForm | 'new' | null>(null);
  const [pendingDeleteTable, setPendingDeleteTable] = useState<FlexTable | null>(null);
  const [renamingTable, setRenamingTable] = useState<FlexTable | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const loadTables = useCallback(async () => {
    setLoadingTables(true);
    const { data, error } = await flexApi.listTables();
    if (!error) setTables((data as FlexTable[]) || []);
    setLoadingTables(false);
  }, []);

  useEffect(() => { loadTables(); }, [loadTables]);

  // Land on the first table automatically (its Dashboard tab) instead of
  // an empty "select a table" screen — this is the module's home page now.
  useEffect(() => {
    if (!selectedTable && tables.length > 0) setSelectedTable(tables[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables]);

  useEffect(() => {
    (async () => {
      const [profRes, taskRes] = await Promise.all([
        supabase.from('profiles_directory').select('id, full_name, email').eq('is_anonymised', false).in('status', ['active', 'invited']).in('role', ['operations', 'admin', 'super_admin']).order('full_name').limit(500),
        supabase.from('tasks').select('id, title, status, completed_at').is('parent_id', null).order('created_at', { ascending: false }).limit(1000),
      ]);
      setProfiles((profRes.data as ProfileLite[]) || []);
      setTasksList((taskRes.data as TaskLite[]) || []);
    })();
  }, []);

  const loadTableDetail = useCallback(async (tableId: string) => {
    setLoadingDetail(true);
    const [fieldsRes, recordsRes, formsRes] = await Promise.all([
      flexApi.listFields(tableId),
      flexApi.listRecords(tableId),
      flexApi.listForms(tableId),
    ]);
    setFields((fieldsRes.data as FlexField[]) || []);
    setRecords((recordsRes.data as FlexRecord[]) || []);
    setForms((formsRes.data as FlexForm[]) || []);
    setLoadingDetail(false);
  }, []);

  useEffect(() => {
    if (selectedTable) loadTableDetail(selectedTable.id);
  }, [selectedTable, loadTableDetail]);

  const createTable = async () => {
    if (!newTableName.trim()) return;
    const { data, error } = await flexApi.createTable({ name: newTableName.trim(), created_by: profile?.id || null });
    if (error) { toast({ title: 'Failed to create table', description: error.message, variant: 'destructive' }); return; }
    setNewTableDialog(false);
    setNewTableName('');
    await loadTables();
    if (data) setSelectedTable(data as FlexTable);
  };

  const renameTable = async () => {
    if (!renamingTable || !renameValue.trim()) return;
    const { error } = await flexApi.updateTable(renamingTable.id, { name: renameValue.trim() });
    if (error) { toast({ title: 'Rename failed', description: error.message, variant: 'destructive' }); return; }
    setTables((prev) => prev.map((t) => (t.id === renamingTable.id ? { ...t, name: renameValue.trim() } : t)));
    if (selectedTable?.id === renamingTable.id) setSelectedTable((prev) => (prev ? { ...prev, name: renameValue.trim() } : prev));
    setRenamingTable(null);
  };

  const confirmDeleteTable = async () => {
    if (!pendingDeleteTable) return;
    const { error } = await flexApi.deleteTable(pendingDeleteTable.id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    if (selectedTable?.id === pendingDeleteTable.id) setSelectedTable(null);
    setPendingDeleteTable(null);
    await loadTables();
  };

  const addRow = async () => {
    if (!selectedTable) return;
    const { data, error } = await flexApi.createRecord(selectedTable.id, {}, profile?.id || null);
    if (error) { toast({ title: 'Failed to add row', description: error.message, variant: 'destructive' }); return; }
    if (data) setRecords((prev) => [...prev, data as FlexRecord]);
  };

  const deleteRow = async (recordId: string) => {
    const { error } = await flexApi.deleteRecord(recordId);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    setRecords((prev) => prev.filter((r) => r.id !== recordId));
  };

  const updateCell = async (record: FlexRecord, fieldId: string, value: unknown) => {
    const nextData = { ...record.data, [fieldId]: value };
    setRecords((prev) => prev.map((r) => (r.id === record.id ? { ...r, data: nextData } : r)));
    const { error } = await flexApi.updateRecord(record.id, nextData);
    if (error) toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
  };

  const deleteField = async (fieldId: string) => {
    const { error } = await flexApi.deleteField(fieldId);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    setFields((prev) => prev.filter((f) => f.id !== fieldId));
  };

  const reorderFields = async (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    const visible = fields.filter((f) => !f.options.hidden);
    const hidden = fields.filter((f) => f.options.hidden);
    const fromIdx = visible.findIndex((f) => f.id === draggedId);
    const toIdx = visible.findIndex((f) => f.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const reordered = [...visible];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const combined = [...reordered, ...hidden].map((f, i) => ({ ...f, sort_order: i }));
    setFields(combined);
    await Promise.all(
      combined
        .filter((f, i) => fields.find((x) => x.id === f.id)?.sort_order !== i)
        .map((f) => flexApi.updateField(f.id, { sort_order: f.sort_order })),
    );
  };

  const toggleFieldHidden = async (field: FlexField) => {
    const nextOptions = { ...field.options, hidden: !field.options.hidden };
    const { error } = await flexApi.updateField(field.id, { options: nextOptions });
    if (error) { toast({ title: 'Failed to update field', description: error.message, variant: 'destructive' }); return; }
    setFields((prev) => prev.map((f) => (f.id === field.id ? { ...f, options: nextOptions } : f)));
  };

  const profilesById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const tasksById = useMemo(() => new Map(tasksList.map((t) => [t.id, t])), [tasksList]);
  // Tasks completed today or later — the picker source for "Completed linked tasks" fields.
  const completedTasks = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    return tasksList.filter((t) => t.status === 'complete' && t.completed_at && t.completed_at.slice(0, 10) >= todayIso);
  }, [tasksList]);

  return (
    <>
      <div className="flex h-[calc(100dvh-theme(spacing.14)-theme(spacing.8)-3.5rem-env(safe-area-inset-bottom,0px))] md:h-[calc(100dvh-theme(spacing.14)-theme(spacing.8))] -m-4 md:-m-5 lg:-m-6">
        {/* ─── Module Sidebar — list of tables ───────────────────────── */}
        <div className="hidden md:flex flex-col w-[220px] lg:w-[240px] shrink-0 border-r border-border/60 bg-card/50 p-3 overflow-y-auto">
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Tables</span>
            <Button size="icon" variant="ghost" className="h-5 w-5" aria-label="New table" onClick={() => setNewTableDialog(true)}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          {loadingTables ? (
            <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : tables.length === 0 ? (
            <p className="text-xs text-muted-foreground px-1">No tables yet.</p>
          ) : (
            <div className="space-y-0.5">
              {tables.map((t) => (
                <div key={t.id} className="group flex items-center">
                  <button
                    onClick={() => setSelectedTable(t)}
                    className={cn(
                      'flex items-center gap-2 flex-1 min-w-0 px-2 py-1.5 rounded-md text-[13px] font-medium transition-all text-left',
                      selectedTable?.id === t.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                    )}
                  >
                    <Table2 className="h-3.5 w-3.5 shrink-0" style={{ color: t.color }} />
                    <span className="flex-1 truncate">{t.name}</span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="h-6 w-6 shrink-0 rounded-md opacity-0 group-hover:opacity-100 flex items-center justify-center text-muted-foreground hover:text-foreground"
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Table options"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => { setRenamingTable(t); setRenameValue(t.name); }}>Rename</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => setPendingDeleteTable(t)}>Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── Main content ───────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="shrink-0 flex items-center justify-between px-4 lg:px-6 py-3 border-b border-border/60">
            <div className="flex items-center gap-2 min-w-0">
              <Table2 className="h-4 w-4 shrink-0" style={selectedTable ? { color: selectedTable.color } : undefined} />
              <h1 className="font-semibold truncate">{selectedTable ? selectedTable.name : 'Tables'}</h1>
            </div>
            {!selectedTable && (
              <Button size="sm" className="gap-1.5" onClick={() => setNewTableDialog(true)}>
                <Plus className="h-3.5 w-3.5" /> New table
              </Button>
            )}
          </div>

          {selectedTable && (
            <div className="shrink-0 flex items-center gap-1 px-4 lg:px-6 py-1.5 border-b border-border/60">
              <button
                onClick={() => setTab('dashboard')}
                className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition-colors', tab === 'dashboard' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60')}
              >
                Dashboard
              </button>
              <button
                onClick={() => setTab('grid')}
                className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition-colors', tab === 'grid' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60')}
              >
                Grid
              </button>
              <button
                onClick={() => setTab('forms')}
                className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition-colors', tab === 'forms' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60')}
              >
                Forms{forms.length > 0 ? ` (${forms.length})` : ''}
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 lg:p-6">
            {!selectedTable ? (
              tables.length === 0 && !loadingTables ? (
                <EmptyState illustration="radar" title="No tables yet" description="Create your first table to start collecting structured data — separate from Tasks and Goals." tone="primary" />
              ) : (
                <p className="text-sm text-muted-foreground">Select a table from the left, or create a new one.</p>
              )
            ) : loadingDetail ? (
              <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : tab === 'dashboard' ? (
              <TableDashboard
                tables={tables}
                selectedTable={selectedTable}
                onSelectTable={setSelectedTable}
                fields={fields}
                records={records}
                profiles={profiles}
              />
            ) : tab === 'grid' ? (
              <GridView
                tableId={selectedTable.id}
                fields={fields}
                records={records}
                profilesById={profilesById}
                tasksById={tasksById}
                completedTasks={completedTasks}
                onAddRow={addRow}
                onDeleteRow={deleteRow}
                onUpdateCell={updateCell}
                onAddField={() => setFieldDialog('new')}
                onEditField={(f) => setFieldDialog(f)}
                onDeleteField={deleteField}
                onToggleFieldHidden={toggleFieldHidden}
                onReorderFields={reorderFields}
              />
            ) : (
              <FormsView
                forms={forms}
                fields={fields}
                onCreateForm={() => setFormDialog('new')}
                onEditForm={(f) => setFormDialog(f)}
                onToggleForm={async (f) => {
                  const { error } = await flexApi.updateForm(f.id, { is_enabled: !f.is_enabled });
                  if (!error) setForms((prev) => prev.map((x) => (x.id === f.id ? { ...x, is_enabled: !x.is_enabled } : x)));
                }}
                onDeleteForm={async (f) => {
                  const { error } = await flexApi.deleteForm(f.id);
                  if (!error) setForms((prev) => prev.filter((x) => x.id !== f.id));
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* New table dialog */}
      <Dialog open={newTableDialog} onOpenChange={setNewTableDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>New table</DialogTitle></DialogHeader>
          <Input placeholder="Table name" value={newTableName} onChange={(e) => setNewTableName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') createTable(); }} autoFocus />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewTableDialog(false)}>Cancel</Button>
            <Button onClick={createTable} disabled={!newTableName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename table */}
      <Dialog open={!!renamingTable} onOpenChange={(v) => { if (!v) setRenamingTable(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename table</DialogTitle></DialogHeader>
          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') renameTable(); }} autoFocus />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenamingTable(null)}>Cancel</Button>
            <Button onClick={renameTable} disabled={!renameValue.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete table confirm */}
      <Dialog open={!!pendingDeleteTable} onOpenChange={(v) => { if (!v) setPendingDeleteTable(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete "{pendingDeleteTable?.name}"?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This deletes the table, its fields, records, and forms permanently.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingDeleteTable(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteTable}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Field editor */}
      {fieldDialog && selectedTable && (
        <FieldEditorDialog
          tableId={selectedTable.id}
          field={fieldDialog === 'new' ? null : fieldDialog}
          allFields={fields}
          nextSortOrder={fields.length}
          onClose={() => setFieldDialog(null)}
          onSaved={(f, isNew) => {
            setFields((prev) => (isNew ? [...prev, f] : prev.map((x) => (x.id === f.id ? f : x))));
            setFieldDialog(null);
          }}
        />
      )}

      {/* Form builder */}
      {formDialog && selectedTable && (
        <FormBuilderDialog
          tableId={selectedTable.id}
          fields={fields}
          profiles={profiles}
          form={formDialog === 'new' ? null : formDialog}
          createdBy={profile?.id || null}
          onClose={() => setFormDialog(null)}
          onSaved={(f, isNew) => {
            setForms((prev) => (isNew ? [f, ...prev] : prev.map((x) => (x.id === f.id ? f : x))));
            setFormDialog(null);
          }}
        />
      )}
    </>
  );
}

// ─── Dashboard — the module's landing page ─────────────────────────────

const toIso = (d: Date) => d.toISOString().slice(0, 10);
const isBusinessDay = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6;
const startOfWeek = (d: Date) => {
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day));
  x.setHours(0, 0, 0, 0);
  return x;
};
const endOfWeek = (d: Date) => { const s = startOfWeek(d); const e = new Date(s); e.setDate(e.getDate() + 6); return e; };
// A date-range picker can be stretched arbitrarily wide — cap the
// day-by-day series/business-day count so a huge range can't hang the tab.
const MAX_DASHBOARD_SPAN_DAYS = 92;

function TableDashboard({
  tables, selectedTable, onSelectTable, fields, records, profiles,
}: {
  tables: FlexTable[];
  selectedTable: FlexTable;
  onSelectTable: (t: FlexTable) => void;
  fields: FlexField[];
  records: FlexRecord[];
  profiles: ProfileLite[];
}) {
  const [personFilter, setPersonFilter] = useState('all');
  const today = useMemo(() => new Date(), []);
  const [fromDate, setFromDate] = useState(toIso(startOfWeek(today)));
  const [toDate, setToDate] = useState(toIso(endOfWeek(today)));

  const personField = fields.find((f) => f.type === 'person');
  const dateField = fields.find((f) => f.type === 'date');
  const workedField = fields.find((f) => f.type === 'task_link');
  const completedField = fields.find((f) => f.type === 'completed_task_link');

  const rows = useMemo(() => {
    if (!personField || !dateField) return [];
    return records
      .map((r) => {
        const personId = r.data[personField.id] as string | undefined;
        const dateStr = r.data[dateField.id] as string | undefined;
        const worked = Array.isArray(r.data[workedField?.id || '']) ? (r.data[workedField!.id] as unknown[]).length : 0;
        const completed = Array.isArray(r.data[completedField?.id || '']) ? (r.data[completedField!.id] as unknown[]).length : 0;
        return { id: r.id, personId, dateStr, worked, completed };
      })
      .filter((r) => !!r.personId && !!r.dateStr);
  }, [records, personField, dateField, workedField, completedField]);

  const filteredRows = useMemo(
    () => (personFilter === 'all' ? rows : rows.filter((r) => r.personId === personFilter)),
    [rows, personFilter],
  );

  // The selected date range drives every stat below — capped so a huge
  // custom range can't force an unbounded day-by-day loop.
  const spanDays = useMemo(() => {
    const raw = Math.round((new Date(toDate).getTime() - new Date(fromDate).getTime()) / 86400000) + 1;
    return Math.min(MAX_DASHBOARD_SPAN_DAYS, Math.max(1, raw));
  }, [fromDate, toDate]);

  const windowRows = useMemo(
    () => filteredRows.filter((r) => r.dateStr! >= fromDate && r.dateStr! <= toDate),
    [filteredRows, fromDate, toDate],
  );

  const totalWorked = windowRows.reduce((s, r) => s + r.worked, 0);
  const totalCompleted = windowRows.reduce((s, r) => s + r.completed, 0);
  const completionRate = totalWorked === 0 ? 0 : Math.round((totalCompleted / totalWorked) * 100);
  const activeReporters = new Set(windowRows.map((r) => r.personId)).size;

  // Day-by-day series across the selected range.
  const dailySeries = useMemo(() => {
    const days: { date: string; label: string; submissions: number; worked: number; completed: number; rate: number | null }[] = [];
    for (let i = 0; i < spanDays; i++) {
      const d = new Date(fromDate);
      d.setDate(d.getDate() + i);
      const iso = toIso(d);
      const dayRows = filteredRows.filter((r) => r.dateStr === iso);
      const worked = dayRows.reduce((s, r) => s + r.worked, 0);
      const completed = dayRows.reduce((s, r) => s + r.completed, 0);
      days.push({
        date: iso,
        label: formatDate(iso),
        submissions: dayRows.length,
        worked,
        completed,
        rate: worked === 0 ? null : Math.round((completed / worked) * 100),
      });
    }
    return days;
  }, [filteredRows, fromDate, spanDays]);

  // Reporting consistency — one row per person with distinct submission
  // dates inside the range vs. how many business days actually passed.
  const businessDaysInRange = useMemo(() => {
    let n = 0;
    for (let i = 0; i < spanDays; i++) {
      const d = new Date(fromDate);
      d.setDate(d.getDate() + i);
      if (d <= today && isBusinessDay(d)) n++;
    }
    return n;
  }, [fromDate, spanDays, today]);

  const consistency = useMemo(() => {
    if (!personField) return [];
    return profiles.map((p) => {
      const personRows = rows.filter((r) => r.personId === p.id);
      const rangeDates = new Set(personRows.filter((r) => r.dateStr! >= fromDate && r.dateStr! <= toDate).map((r) => r.dateStr));
      const lastSubmission = personRows.reduce<string | null>((max, r) => (!max || r.dateStr! > max ? r.dateStr! : max), null);
      const pWorked = personRows.filter((r) => r.dateStr! >= fromDate && r.dateStr! <= toDate).reduce((s, r) => s + r.worked, 0);
      const pCompleted = personRows.filter((r) => r.dateStr! >= fromDate && r.dateStr! <= toDate).reduce((s, r) => s + r.completed, 0);
      const missedDays = Math.max(0, businessDaysInRange - rangeDates.size);
      return {
        id: p.id,
        name: p.full_name,
        lastSubmission,
        submissionsInWindow: rangeDates.size,
        missedDays,
        completionRate: pWorked === 0 ? null : Math.round((pCompleted / pWorked) * 100),
        consistent: missedDays <= 1,
      };
    }).sort((a, b) => b.missedDays - a.missedDays);
  }, [profiles, rows, personField, fromDate, toDate, businessDaysInRange]);

  const missingCount = consistency.filter((c) => !c.consistent).length;

  return (
    <div className="space-y-4">
      {/* ── Filters: which table, which person ─────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {tables.length > 1 && (
          <Select value={selectedTable.id} onValueChange={(v) => { const t = tables.find((x) => x.id === v); if (t) onSelectTable(t); }}>
            <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {tables.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={personFilter} onValueChange={setPersonFilter}>
          <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue placeholder="All people" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All people</SelectItem>
            {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" className="h-8 w-[150px] text-xs" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <span className="text-xs text-muted-foreground">to</span>
        <Input type="date" className="h-8 w-[150px] text-xs" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <Button
          variant="ghost" size="sm" className="h-8 text-xs"
          onClick={() => { setFromDate(toIso(startOfWeek(today))); setToDate(toIso(endOfWeek(today))); }}
        >
          This week
        </Button>
      </div>

      {!personField || !dateField ? (
        <EmptyState
          illustration="radar"
          title="Add a Person and a Date field"
          description={'This table needs a Person field and a Date field (e.g. a daily report\'s "Name" and "Report Date") before dashboard stats can be computed.'}
          tone="primary"
        />
      ) : (
        <>
          {/* ── Stat cards ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1.5">Submissions (period)</p>
                <p className="text-2xl font-bold tabular-nums">{windowRows.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1.5">Active Reporters</p>
                <p className="text-2xl font-bold tabular-nums">{activeReporters}<span className="text-sm text-muted-foreground font-normal">/{profiles.length}</span></p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1.5">Task Completion Rate</p>
                <p className="text-2xl font-bold tabular-nums text-emerald-500">{completionRate}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1.5">Missing Reports</p>
                <p className={cn('text-2xl font-bold tabular-nums', missingCount > 0 ? 'text-red-500' : 'text-emerald-500')}>{missingCount}</p>
              </CardContent>
            </Card>
          </div>

          {/* ── Charts ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Reports submitted per day</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={dailySeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} vertical={false} />
                    <XAxis dataKey="label" tick={axisTick} />
                    <YAxis tick={axisTick} allowDecimals={false} />
                    <ChartTooltip content={<GlassTooltip />} cursor={{ fill: 'transparent' }} />
                    <Bar dataKey="submissions" name="Submissions" fill={chartTheme.primary} {...chartAnim} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Tasks worked vs. completed per day</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={dailySeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} vertical={false} />
                    <XAxis dataKey="label" tick={axisTick} />
                    <YAxis tick={axisTick} allowDecimals={false} />
                    <ChartTooltip content={<GlassTooltip />} cursor={{ fill: 'transparent' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="worked" name="Worked" fill={chartTheme.gold} {...chartAnim} />
                    <Bar dataKey="completed" name="Completed" fill={chartTheme.success} {...chartAnim} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Completion rate trend</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={dailySeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} />
                    <XAxis dataKey="label" tick={axisTick} />
                    <YAxis tick={axisTick} domain={[0, 100]} />
                    <ChartTooltip content={<GlassTooltip formatter={(v: any) => (v == null ? 'No data' : `${v}%`)} />} />
                    <Line type="monotone" dataKey="rate" name="Completion rate" stroke={chartTheme.primary} strokeWidth={2} connectNulls dot={{ r: 3 }} {...chartAnim} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* ── Reporting consistency ──────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" /> Reporting Consistency
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                Business days in the selected range: {businessDaysInRange}. A person is flagged once they've missed more than one.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {consistency.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No people to report on yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="py-2 pr-3 font-medium text-muted-foreground text-xs">Name</th>
                      <th className="py-2 pr-3 font-medium text-muted-foreground text-xs">Last Submission</th>
                      <th className="py-2 pr-3 font-medium text-muted-foreground text-xs">Submitted (period)</th>
                      <th className="py-2 pr-3 font-medium text-muted-foreground text-xs">Missed Days</th>
                      <th className="py-2 pr-3 font-medium text-muted-foreground text-xs">Completion Rate</th>
                      <th className="py-2 pr-3 font-medium text-muted-foreground text-xs">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consistency.map((c) => (
                      <tr key={c.id} className={cn('border-b border-border/60', !c.consistent && 'bg-red-500/5')}>
                        <td className="py-2 pr-3">{c.name}</td>
                        <td className="py-2 pr-3">{c.lastSubmission ? formatDate(c.lastSubmission) : '—'}</td>
                        <td className="py-2 pr-3">{c.submissionsInWindow}</td>
                        <td className={cn('py-2 pr-3 font-medium', c.missedDays > 1 && 'text-red-500')}>{c.missedDays}</td>
                        <td className="py-2 pr-3">{c.completionRate === null ? '—' : `${c.completionRate}%`}</td>
                        <td className="py-2 pr-3">
                          <span className={cn(
                            'inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full',
                            c.consistent ? 'bg-emerald-500/15 text-emerald-500' : 'bg-red-500/15 text-red-500',
                          )}
                          >
                            {!c.consistent && <AlertTriangle className="h-3 w-3" />}
                            {c.consistent ? 'Consistent' : 'Needs Attention'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Grid ──────────────────────────────────────────────────────────────

function GridView({
  tableId, fields, records, profilesById, tasksById, completedTasks, onAddRow, onDeleteRow, onUpdateCell, onAddField, onEditField, onDeleteField, onToggleFieldHidden, onReorderFields,
}: {
  tableId: string;
  fields: FlexField[];
  records: FlexRecord[];
  profilesById: Map<string, ProfileLite>;
  tasksById: Map<string, TaskLite>;
  completedTasks: TaskLite[];
  onAddRow: () => void;
  onDeleteRow: (id: string) => void;
  onUpdateCell: (record: FlexRecord, fieldId: string, value: unknown) => void;
  onAddField: () => void;
  onEditField: (f: FlexField) => void;
  onDeleteField: (id: string) => void;
  onToggleFieldHidden: (f: FlexField) => void;
  onReorderFields: (draggedId: string, targetId: string) => void;
}) {
  const DEFAULT_COL_WIDTH = 160;
  const MIN_COL_WIDTH = 90;
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const resizingRef = useRef<{ fieldId: string; startX: number; startWidth: number } | null>(null);
  const [dragFieldId, setDragFieldId] = useState<string | null>(null);
  const [groupByField, setGroupByField] = useState<string>('__none__');
  const [subGroupByField, setSubGroupByField] = useState<string>('__none__');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<FlexFilter[]>([]);

  // Grouping is remembered per table (survives switching to Forms and back,
  // and page reloads) until the user explicitly changes it.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`flex_group_${tableId}`);
      const parsed = raw ? JSON.parse(raw) : null;
      setGroupByField(parsed?.groupByField || '__none__');
      setSubGroupByField(parsed?.subGroupByField || '__none__');
    } catch {
      setGroupByField('__none__');
      setSubGroupByField('__none__');
    }
  }, [tableId]);

  useEffect(() => {
    try {
      localStorage.setItem(`flex_group_${tableId}`, JSON.stringify({ groupByField, subGroupByField }));
    } catch { /* best-effort persistence only */ }
  }, [tableId, groupByField, subGroupByField]);

  const startResize = useCallback((fieldId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startWidth = colWidths[fieldId] ?? DEFAULT_COL_WIDTH;
    resizingRef.current = { fieldId, startX: e.clientX, startWidth };
    const onMove = (ev: MouseEvent) => {
      const r = resizingRef.current;
      if (!r) return;
      const next = Math.max(MIN_COL_WIDTH, r.startWidth + (ev.clientX - r.startX));
      setColWidths((prev) => ({ ...prev, [r.fieldId]: next }));
    };
    const onUp = () => {
      resizingRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [colWidths]);

  const visibleFields = fields.filter((f) => !f.options.hidden);
  const hiddenFields = fields.filter((f) => f.options.hidden);
  const groupableFields = visibleFields;
  const groupByFieldObj = groupableFields.find((f) => f.id === groupByField) || null;
  const subGroupByFieldObj = groupByFieldObj ? groupableFields.filter((f) => f.id !== groupByField).find((f) => f.id === subGroupByField) || null : null;

  const filteredRecords = useMemo(() => {
    if (filters.length === 0) return records;
    return records.filter((r) => filters.every((f) => {
      const field = fields.find((x) => x.id === f.fieldId);
      if (!field) return true;
      return filterMatches(field, r, fields, f, profilesById, tasksById);
    }));
  }, [records, filters, fields, profilesById, tasksById]);

  const groupedRows = useMemo(() => {
    if (!groupByFieldObj) return null;
    const groups = new Map<string, { key: string; records: FlexRecord[]; subgroups: Map<string, FlexRecord[]> | null }>();
    for (const r of filteredRecords) {
      const key = getFieldDisplayValue(groupByFieldObj, r, fields, profilesById, tasksById);
      if (!groups.has(key)) groups.set(key, { key, records: [], subgroups: subGroupByFieldObj ? new Map() : null });
      const g = groups.get(key)!;
      g.records.push(r);
      if (subGroupByFieldObj) {
        const subKey = getFieldDisplayValue(subGroupByFieldObj, r, fields, profilesById, tasksById);
        if (!g.subgroups!.has(subKey)) g.subgroups!.set(subKey, []);
        g.subgroups!.get(subKey)!.push(r);
      }
    }
    return Array.from(groups.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [filteredRecords, groupByFieldObj, subGroupByFieldObj, profilesById, tasksById, fields]);

  const toggleGroup = (key: string) => setCollapsedGroups((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const addFilter = () => {
    const first = fields[0];
    if (!first) return;
    setFilters((prev) => [...prev, { id: crypto.randomUUID(), fieldId: first.id, operator: operatorsForField(first)[0].value, value: '' }]);
  };
  const updateFilter = (id: string, patch: Partial<FlexFilter>) => setFilters((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const removeFilter = (id: string) => setFilters((prev) => prev.filter((f) => f.id !== id));

  if (fields.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-muted-foreground mb-3">This table has no fields yet.</p>
        <Button size="sm" className="gap-1.5" onClick={onAddField}><Plus className="h-3.5 w-3.5" /> Add field</Button>
      </div>
    );
  }

  const colSpan = visibleFields.length + 2;

  const renderRow = (r: FlexRecord) => (
    <tr key={r.id} className="group hover:bg-muted/20">
      <td className="px-2 text-center border-r border-b border-border/60">
        <button onClick={() => onDeleteRow(r.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive" aria-label="Delete row">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
      {visibleFields.map((f) => (
        <td key={f.id} className="px-1 py-1 border-r border-b border-border/60 align-top overflow-hidden">
          <Cell field={f} value={r.data[f.id]} record={r} allFields={fields} profilesById={profilesById} tasksById={tasksById} completedTasks={completedTasks} onChange={(v) => onUpdateCell(r, f.id, v)} />
        </td>
      ))}
      <td className="border-b border-border/60" />
    </tr>
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={groupByField} onValueChange={(v) => { setGroupByField(v); setSubGroupByField('__none__'); }}>
            <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue placeholder="Group by" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No grouping</SelectItem>
              {groupableFields.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {groupByFieldObj && (
            <Select value={subGroupByField} onValueChange={setSubGroupByField}>
              <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue placeholder="Then by" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No subgroup</SelectItem>
                {groupableFields.filter((f) => f.id !== groupByField).map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5">
                <ListFilter className="h-3.5 w-3.5" /> Filter{filters.length > 0 ? ` (${filters.length})` : ''}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[420px] p-3" align="start">
              <div className="space-y-2">
                {filters.length === 0 && <p className="text-xs text-muted-foreground">No filters — showing all rows.</p>}
                {filters.map((f) => {
                  const field = fields.find((x) => x.id === f.fieldId);
                  const ops = operatorsForField(field);
                  const needsValue = f.operator !== 'is_empty' && f.operator !== 'is_not_empty';
                  return (
                    <div key={f.id} className="flex items-center gap-1.5">
                      <Select value={f.fieldId} onValueChange={(v) => updateFilter(f.id, { fieldId: v, operator: operatorsForField(fields.find((x) => x.id === v))[0].value, value: '' })}>
                        <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {fields.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={f.operator} onValueChange={(v) => updateFilter(f.id, { operator: v as FilterOp })}>
                        <SelectTrigger className="h-7 text-xs w-[130px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ops.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {needsValue && field && (
                        <FilterValueInput
                          field={field}
                          value={f.value}
                          profilesById={profilesById}
                          onChange={(v) => updateFilter(f.id, { value: v })}
                        />
                      )}
                      <button onClick={() => removeFilter(f.id)} className="text-muted-foreground hover:text-destructive shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  );
                })}
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={addFilter}><Plus className="h-3 w-3" /> Add filter</Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        {hiddenFields.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5">
                <EyeOff className="h-3.5 w-3.5" /> {hiddenFields.length} hidden field{hiddenFields.length !== 1 ? 's' : ''}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="end">
              <div className="space-y-1">
                {hiddenFields.map((f) => (
                  <div key={f.id} className="flex items-center justify-between px-2 py-1 rounded hover:bg-muted/40">
                    <span className="text-xs truncate">{f.name}</span>
                    <button className="text-[11px] text-primary hover:underline shrink-0" onClick={() => onToggleFieldHidden(f)}>Show</button>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-sm border-collapse" style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr className="bg-muted/40">
              <th className="w-8 border-r border-b border-border" />
              {visibleFields.map((f) => {
                const Icon = FIELD_ICONS[f.type];
                return (
                  <th
                    key={f.id}
                    draggable
                    onDragStart={() => setDragFieldId(f.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); if (dragFieldId) onReorderFields(dragFieldId, f.id); setDragFieldId(null); }}
                    onDragEnd={() => setDragFieldId(null)}
                    className={cn('relative text-left px-3 py-2 border-r border-b border-border cursor-move', dragFieldId === f.id && 'opacity-40')}
                    style={{ width: colWidths[f.id] ?? DEFAULT_COL_WIDTH }}
                  >
                    <div className="flex items-center justify-between gap-1 min-w-0">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground min-w-0 overflow-hidden">
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{f.name}</span>
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="text-muted-foreground hover:text-foreground shrink-0"><MoreHorizontal className="h-3.5 w-3.5" /></button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEditField(f)}>Edit field</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onToggleFieldHidden(f)}>Hide field</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => onDeleteField(f.id)}>Delete field</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div
                      className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-primary/30 active:bg-primary/40"
                      onMouseDown={(e) => startResize(f.id, e)}
                      draggable={false}
                    />
                  </th>
                );
              })}
              <th className="w-10 px-2 border-b border-border">
                <button onClick={onAddField} className="text-muted-foreground hover:text-foreground" aria-label="Add field"><Plus className="h-4 w-4" /></button>
              </th>
            </tr>
          </thead>
          <tbody>
            {groupedRows ? (
              groupedRows.map((g) => (
                <Fragment key={g.key}>
                  <tr className="bg-muted/30">
                    <td colSpan={colSpan} className="px-3 py-1.5 text-xs font-semibold cursor-pointer" onClick={() => toggleGroup(g.key)}>
                      {collapsedGroups.has(g.key) ? '▸' : '▾'} {groupByFieldObj!.name}: {g.key} ({g.records.length})
                    </td>
                  </tr>
                  {!collapsedGroups.has(g.key) && (
                    g.subgroups
                      ? Array.from(g.subgroups.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([subKey, subRecords]) => {
                        const subGroupKey = `${g.key}::${subKey}`;
                        return (
                          <Fragment key={subGroupKey}>
                            <tr className="bg-muted/15">
                              <td colSpan={colSpan} className="px-3 py-1 pl-6 text-[11px] font-medium text-muted-foreground cursor-pointer" onClick={() => toggleGroup(subGroupKey)}>
                                {collapsedGroups.has(subGroupKey) ? '▸' : '▾'} {subGroupByFieldObj?.name}: {subKey} ({subRecords.length})
                              </td>
                            </tr>
                            {!collapsedGroups.has(subGroupKey) && subRecords.map(renderRow)}
                          </Fragment>
                        );
                      })
                      : g.records.map(renderRow)
                  )}
                </Fragment>
              ))
            ) : (
              filteredRecords.map(renderRow)
            )}
          </tbody>
        </table>
        <button onClick={onAddRow} className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 w-full transition-colors">
          <Plus className="h-3.5 w-3.5" /> Add row
        </button>
      </div>
    </div>
  );
}

function Cell({
  field, value, record, allFields, profilesById, tasksById, completedTasks, onChange,
}: {
  field: FlexField;
  value: unknown;
  record: FlexRecord;
  allFields: FlexField[];
  profilesById: Map<string, ProfileLite>;
  tasksById: Map<string, TaskLite>;
  completedTasks: TaskLite[];
  onChange: (v: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => { setDraft(value); }, [value, open]);

  if (field.type === 'formula') {
    const scope = buildFormulaScope(record, allFields, profilesById, tasksById);
    const result = evaluateFormula(field.options.formula || '', scope);
    return (
      <div className="px-2 py-1.5 text-xs text-muted-foreground italic truncate whitespace-nowrap overflow-hidden">
        {isFormulaError(result) ? (
          <span className="text-destructive not-italic" title={result.error}>#ERROR</span>
        ) : (
          formatNumericValue(result, field.options.format)
        )}
      </div>
    );
  }

  const display = () => {
    if (value === undefined || value === null || value === '') return <span className="text-muted-foreground/50">—</span>;
    switch (field.type) {
      case 'checkbox':
        return value ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <span className="text-muted-foreground/50">—</span>;
      case 'select': {
        const choice = field.options.choices?.find((c) => c.id === value);
        return choice ? <Badge style={{ backgroundColor: `${choice.color}22`, color: choice.color }} className="border-0">{choice.label}</Badge> : null;
      }
      case 'multi_select': {
        const ids = Array.isArray(value) ? (value as string[]) : [];
        return (
          <div className="flex items-center gap-1 overflow-hidden whitespace-nowrap">
            {ids.map((id) => {
              const c = field.options.choices?.find((ch) => ch.id === id);
              return c ? <Badge key={id} style={{ backgroundColor: `${c.color}22`, color: c.color }} className="border-0 shrink-0">{c.label}</Badge> : null;
            })}
          </div>
        );
      }
      case 'person': {
        const p = profilesById.get(value as string);
        return p ? <span className="text-xs truncate block">{p.full_name}</span> : null;
      }
      case 'multi_person': {
        const ids = Array.isArray(value) ? (value as string[]) : [];
        return <span className="text-xs truncate block">{ids.map((id) => profilesById.get(id)?.full_name).filter(Boolean).join(', ')}</span>;
      }
      case 'task_link': case 'completed_task_link': {
        const ids = Array.isArray(value) ? (value as string[]) : [];
        return (
          <div className="flex items-center gap-1 overflow-hidden whitespace-nowrap">
            {ids.map((id) => {
              const t = tasksById.get(id);
              return t ? <Badge key={id} variant="secondary" className="max-w-[140px] truncate shrink-0">{t.title}</Badge> : null;
            })}
          </div>
        );
      }
      default:
        return <span className="text-xs truncate block">{String(value)}</span>;
    }
  };

  // Simple inline types edit directly without a popover.
  if (field.type === 'checkbox') {
    return (
      <div className="px-2 py-1">
        <Checkbox checked={!!value} onCheckedChange={(v) => onChange(!!v)} />
      </div>
    );
  }
  if (field.type === 'text' || field.type === 'number' || field.type === 'date' || field.type === 'url' || field.type === 'email' || field.type === 'phone') {
    return (
      <Input
        className="h-8 border-0 shadow-none bg-transparent text-xs focus-visible:ring-1"
        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
        defaultValue={value as string ?? ''}
        onBlur={(e) => {
          const v = field.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value;
          if (v !== value) onChange(v);
        }}
      />
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="w-full text-left px-2 py-1.5 rounded hover:bg-muted/40 min-h-[32px] overflow-hidden whitespace-nowrap block">{display()}</button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        {field.type === 'long_text' && (
          <Textarea rows={4} defaultValue={value as string ?? ''} onBlur={(e) => { onChange(e.target.value); }} />
        )}
        {field.type === 'select' && (
          <div className="space-y-1">
            {(field.options.choices || []).map((c) => (
              <button key={c.id} className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-muted/40" onClick={() => { onChange(c.id); setOpen(false); }}>
                <Badge style={{ backgroundColor: `${c.color}22`, color: c.color }} className="border-0">{c.label}</Badge>
                {value === c.id && <Check className="h-3.5 w-3.5 ml-auto" />}
              </button>
            ))}
            {value !== undefined && value !== null && (
              <button className="text-xs text-muted-foreground hover:text-foreground px-2 pt-1" onClick={() => { onChange(null); setOpen(false); }}>Clear</button>
            )}
          </div>
        )}
        {field.type === 'multi_select' && (
          <div className="space-y-1">
            {(field.options.choices || []).map((c) => {
              const ids = Array.isArray(draft) ? (draft as string[]) : [];
              const checked = ids.includes(c.id);
              return (
                <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40 cursor-pointer">
                  <Checkbox checked={checked} onCheckedChange={(v) => {
                    const next = v ? [...ids, c.id] : ids.filter((i) => i !== c.id);
                    setDraft(next);
                    onChange(next);
                  }} />
                  <Badge style={{ backgroundColor: `${c.color}22`, color: c.color }} className="border-0">{c.label}</Badge>
                </label>
              );
            })}
          </div>
        )}
        {field.type === 'person' && (
          <div className="max-h-56 overflow-y-auto space-y-1">
            {Array.from(profilesById.values()).map((p) => (
              <button key={p.id} className="flex items-center justify-between w-full text-left px-2 py-1.5 rounded hover:bg-muted/40" onClick={() => { onChange(p.id); setOpen(false); }}>
                <span className="text-xs">{p.full_name}</span>
                {value === p.id && <Check className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
        )}
        {field.type === 'multi_person' && (
          <div className="max-h-56 overflow-y-auto space-y-1">
            {Array.from(profilesById.values()).map((p) => {
              const ids = Array.isArray(draft) ? (draft as string[]) : [];
              const checked = ids.includes(p.id);
              return (
                <label key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40 cursor-pointer">
                  <Checkbox checked={checked} onCheckedChange={(v) => {
                    const next = v ? [...ids, p.id] : ids.filter((i) => i !== p.id);
                    setDraft(next);
                    onChange(next);
                  }} />
                  <span className="text-xs">{p.full_name}</span>
                </label>
              );
            })}
          </div>
        )}
        {(field.type === 'task_link' || field.type === 'completed_task_link') && (
          <div className="max-h-56 overflow-y-auto space-y-1">
            {(field.type === 'completed_task_link' ? completedTasks : Array.from(tasksById.values())).map((t) => {
              const ids = Array.isArray(draft) ? (draft as string[]) : [];
              const checked = ids.includes(t.id);
              return (
                <label key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40 cursor-pointer">
                  <Checkbox checked={checked} onCheckedChange={(v) => {
                    const next = v ? [...ids, t.id] : ids.filter((i) => i !== t.id);
                    setDraft(next);
                    onChange(next);
                  }} />
                  <span className="text-xs truncate">{t.title}</span>
                </label>
              );
            })}
            {field.type === 'completed_task_link' && completedTasks.length === 0 && (
              <p className="text-xs text-muted-foreground px-2 py-1">No tasks completed today or later.</p>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── Field editor ────────────────────────────────────────────────────

function FieldEditorDialog({
  tableId, field, allFields, nextSortOrder, onClose, onSaved,
}: {
  tableId: string;
  field: FlexField | null;
  allFields: FlexField[];
  nextSortOrder: number;
  onClose: () => void;
  onSaved: (f: FlexField, isNew: boolean) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(field?.name || '');
  const [type, setType] = useState<FlexFieldType>(field?.type || 'text');
  const [choices, setChoices] = useState<FlexChoice[]>(field?.options.choices || []);
  const [formula, setFormula] = useState(field?.options.formula || '');
  const [format, setFormat] = useState<FlexNumberFormat>(field?.options.format || 'number');
  const [saving, setSaving] = useState(false);
  const [showAllRefs, setShowAllRefs] = useState(false);

  const needsChoices = type === 'select' || type === 'multi_select';
  const isFormula = type === 'formula';
  // Every other field is selectable — including other formula fields
  // (buildFormulaScope resolves those one level deep, so this stays safe).
  const referenceableFields = allFields.filter((f) => f.id !== field?.id);
  const REFS_PREVIEW_COUNT = 8;
  const visibleRefs = showAllRefs ? referenceableFields : referenceableFields.slice(0, REFS_PREVIEW_COUNT);

  const addChoice = () => {
    setChoices((prev) => [...prev, { id: crypto.randomUUID(), label: '', color: CHOICE_COLORS[prev.length % CHOICE_COLORS.length] }]);
  };

  const formulaPreview = isFormula
    ? evaluateFormula(formula, Object.fromEntries(referenceableFields.map((f) => [f.name, sampleValueForField(f)])))
    : null;

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const options = needsChoices ? { choices: choices.filter((c) => c.label.trim()) } : isFormula ? { formula, format } : {};
    if (field) {
      const { error } = await flexApi.updateField(field.id, { name: name.trim(), type, options });
      setSaving(false);
      if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
      onSaved({ ...field, name: name.trim(), type, options }, false);
    } else {
      const { data, error } = await flexApi.createField({ table_id: tableId, name: name.trim(), type, options, sort_order: nextSortOrder });
      setSaving(false);
      if (error) { toast({ title: 'Create failed', description: error.message, variant: 'destructive' }); return; }
      if (data) onSaved(data as FlexField, true);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{field ? 'Edit field' : 'New field'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Field name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <Select value={type} onValueChange={(v) => setType(v as FlexFieldType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FLEX_FIELD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>

          {needsChoices && (
            <div className="space-y-2 border-t border-border/40 pt-3">
              <label className="text-xs font-medium text-muted-foreground">Choices</label>
              {choices.map((c, i) => (
                <div key={c.id} className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                  <Input
                    className="h-8 text-xs"
                    value={c.label}
                    onChange={(e) => setChoices((prev) => prev.map((x, xi) => (xi === i ? { ...x, label: e.target.value } : x)))}
                    placeholder="Choice label"
                  />
                  <button onClick={() => setChoices((prev) => prev.filter((_, xi) => xi !== i))} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={addChoice}><Plus className="h-3 w-3" /> Add choice</Button>
            </div>
          )}

          {isFormula && (
            <div className="space-y-2 border-t border-border/40 pt-3">
              <label className="text-xs font-medium text-muted-foreground">Formula</label>
              <Textarea
                rows={3}
                className="font-mono text-xs"
                placeholder='e.g. ROUND({Hours} * {Rate}, 2) or IF({Status} = "Done", "✓", "")'
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
              />
              {referenceableFields.length > 0 && (
                <div className="flex flex-wrap gap-1 items-center">
                  {visibleRefs.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className="text-[11px] px-1.5 py-0.5 rounded bg-muted/60 hover:bg-muted text-muted-foreground"
                      onClick={() => setFormula((prev) => `${prev}{${f.name}}`)}
                    >
                      {f.name}
                    </button>
                  ))}
                  {referenceableFields.length > REFS_PREVIEW_COUNT && (
                    <button
                      type="button"
                      className="text-[11px] px-1.5 py-0.5 text-primary hover:underline"
                      onClick={() => setShowAllRefs((v) => !v)}
                    >
                      {showAllRefs ? 'Show less' : `Show ${referenceableFields.length - REFS_PREVIEW_COUNT} more`}
                    </button>
                  )}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                {'Functions: IF, AND, OR, NOT, SUM, MIN, MAX, ROUND, ABS, LEN, UPPER, LOWER, TRIM, CONCATENATE, TODAY, NOW, MOD, WEEKDAY, DATEADD, COUNT. COUNT({Field}) counts entries in a Linked Tasks / multi-select / multi-person field. Use & to join text, + - * / for math.'}
              </p>

              <label className="text-xs font-medium text-muted-foreground block pt-1">Output format</label>
              <Select value={format} onValueChange={(v) => setFormat(v as FlexNumberFormat)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FLEX_NUMBER_FORMATS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>

              {formula.trim() && (
                <p className="text-[11px]">
                  Preview: {isFormulaError(formulaPreview) ? (
                    <span className="text-destructive">{formulaPreview.error}</span>
                  ) : (
                    <span className="text-muted-foreground">{formatNumericValue(formulaPreview, format)}</span>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Forms list ──────────────────────────────────────────────────────

function FormsView({
  forms, fields, onCreateForm, onEditForm, onToggleForm, onDeleteForm,
}: {
  forms: FlexForm[];
  fields: FlexField[];
  onCreateForm: () => void;
  onEditForm: (f: FlexForm) => void;
  onToggleForm: (f: FlexForm) => void;
  onDeleteForm: (f: FlexForm) => void;
}) {
  const { toast } = useToast();
  const copyLink = (token: string) => {
    const url = `${window.location.origin}/t/f/${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Link copied' });
  };

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button size="sm" className="gap-1.5" onClick={onCreateForm} disabled={fields.length === 0}>
          <Plus className="h-3.5 w-3.5" /> New form
        </Button>
      </div>
      {fields.length === 0 && <p className="text-xs text-muted-foreground mb-3">Add fields to this table before creating a form.</p>}
      {forms.length === 0 ? (
        <EmptyState illustration="radar" title="No forms yet" description="Create a shareable form tied directly to this table." tone="primary" />
      ) : (
        <div className="space-y-2">
          {forms.map((f) => (
            <div key={f.id} className="flex items-center justify-between border border-border rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{f.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{`${window.location.origin}/t/f/${f.share_token}`}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Switch checked={f.is_enabled} onCheckedChange={() => onToggleForm(f)} className="scale-90" />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyLink(f.share_token)} aria-label="Copy link"><Copy className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onEditForm(f)}>Edit</Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDeleteForm(f)} aria-label="Delete form"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Form builder ────────────────────────────────────────────────────

function FormBuilderDialog({
  tableId, fields, profiles, form, createdBy, onClose, onSaved,
}: {
  tableId: string;
  fields: FlexField[];
  profiles: ProfileLite[];
  form: FlexForm | null;
  createdBy: string | null;
  onClose: () => void;
  onSaved: (f: FlexForm, isNew: boolean) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(form?.name || 'Untitled form');
  const [description, setDescription] = useState(form?.description || '');
  // Formula fields are computed, not fillable — excluded from forms entirely.
  const formFields = fields.filter((f) => f.type !== 'formula');
  const [selected, setSelected] = useState<FlexFormField[]>(
    form?.fields || formFields.map((f) => ({ field_id: f.id, required: false, condition: null })),
  );
  const [saving, setSaving] = useState(false);
  const [dragFieldId, setDragFieldId] = useState<string | null>(null);

  const conditionSources = formFields.filter((f) => f.type === 'select' || f.type === 'person');

  // Questions render in the order they appear in `selected` (which is also
  // the order the public form fills them in) — included fields first, then
  // not-yet-included ones in their table order, so every field stays
  // reachable via the checkbox above.
  const orderedFormFields = useMemo(() => {
    const included = selected.map((e) => formFields.find((f) => f.id === e.field_id)).filter((f): f is FlexField => !!f);
    const rest = formFields.filter((f) => !selected.some((e) => e.field_id === f.id));
    return [...included, ...rest];
  }, [selected, formFields]);

  const toggleField = (fieldId: string, include: boolean) => {
    setSelected((prev) => {
      if (include) return [...prev, { field_id: fieldId, required: false, condition: null }];
      return prev.filter((x) => x.field_id !== fieldId);
    });
  };

  const updateEntry = (fieldId: string, patch: Partial<FlexFormField>) => {
    setSelected((prev) => prev.map((x) => (x.field_id === fieldId ? { ...x, ...patch } : x)));
  };

  const reorderQuestion = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    setSelected((prev) => {
      const fromIdx = prev.findIndex((x) => x.field_id === draggedId);
      const toIdx = prev.findIndex((x) => x.field_id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    if (form) {
      const { error } = await flexApi.updateForm(form.id, { name: name.trim(), description, fields: selected });
      setSaving(false);
      if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
      onSaved({ ...form, name: name.trim(), description, fields: selected }, false);
    } else {
      const { data, error } = await flexApi.createForm({ table_id: tableId, name: name.trim(), description, fields: selected, created_by: createdBy });
      setSaving(false);
      if (error) { toast({ title: 'Create failed', description: error.message, variant: 'destructive' }); return; }
      if (data) onSaved(data as FlexForm, true);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{form ? 'Edit form' : 'New form'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Form name" value={name} onChange={(e) => setName(e.target.value)} />
          <Textarea placeholder="Description (optional)" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />

          <div className="space-y-2 border-t border-border/40 pt-3">
            <label className="text-xs font-medium text-muted-foreground">Fields</label>
            {orderedFormFields.map((f) => {
              const entry = selected.find((x) => x.field_id === f.id);
              const included = !!entry;
              return (
                <div
                  key={f.id}
                  draggable={included}
                  onDragStart={() => included && setDragFieldId(f.id)}
                  onDragOver={(e) => { if (included) e.preventDefault(); }}
                  onDrop={(e) => { e.preventDefault(); if (included && dragFieldId) reorderQuestion(dragFieldId, f.id); setDragFieldId(null); }}
                  onDragEnd={() => setDragFieldId(null)}
                  className={cn(
                    'border border-border/50 rounded-lg p-2.5 space-y-2',
                    included && 'cursor-move',
                    dragFieldId === f.id && 'opacity-40',
                  )}
                >
                  <label className="flex items-center gap-2 cursor-pointer">
                    {included && <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />}
                    <Checkbox checked={included} onCheckedChange={(v) => toggleField(f.id, !!v)} />
                    <span className="text-sm flex-1">{f.name}</span>
                    {included && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        Required
                        <Checkbox checked={entry!.required} onCheckedChange={(v) => updateEntry(f.id, { required: !!v })} />
                      </span>
                    )}
                  </label>

                  {included && conditionSources.filter((s) => s.id !== f.id).length > 0 && (
                    <div className="flex items-center gap-2 pl-6">
                      <span className="text-[11px] text-muted-foreground shrink-0">Show only if</span>
                      <Select
                        value={entry!.condition?.field_id || '__none__'}
                        onValueChange={(v) => updateEntry(f.id, { condition: v === '__none__' ? null : { field_id: v, value: '' } })}
                      >
                        <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="No condition" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">No condition</SelectItem>
                          {conditionSources.filter((s) => s.id !== f.id).map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {entry!.condition && (
                        <Select
                          value={entry!.condition.value || undefined}
                          onValueChange={(v) => updateEntry(f.id, { condition: { field_id: entry!.condition!.field_id, value: v } })}
                        >
                          <SelectTrigger className="h-7 text-xs w-[140px]"><SelectValue placeholder="equals..." /></SelectTrigger>
                          <SelectContent>
                            {(() => {
                              const src = fields.find((s) => s.id === entry!.condition!.field_id);
                              if (!src) return null;
                              if (src.type === 'select') {
                                return (src.options.choices || []).map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>);
                              }
                              if (src.type === 'person') {
                                return profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>);
                              }
                              return null;
                            })()}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}

                  {included && (f.type === 'task_link' || f.type === 'completed_task_link') && (
                    <div className="flex items-center gap-2 pl-6">
                      <span className="text-[11px] text-muted-foreground shrink-0">Only show tasks assigned to</span>
                      <Select
                        value={entry!.filterByPersonField || '__none__'}
                        onValueChange={(v) => updateEntry(f.id, { filterByPersonField: v === '__none__' ? null : v })}
                      >
                        <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Whole list" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">No filter</SelectItem>
                          {fields.filter((s) => s.type === 'person').map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
