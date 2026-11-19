import { format, isValid, parse, parseISO } from 'date-fns';
import {
  AlignLeft, AtSign, Calendar, CalendarPlus, CheckSquare, CircleChevronDown, CircleDollarSign, Hash, History,
  Link as LinkIcon, ListChecks, ListOrdered, ListTodo, Paperclip, Phone, Star, Type, UserRound, Users,
  type LucideIcon,
} from 'lucide-react';
import type { TableField, TableFieldConfig, TableFieldType, TableRecordRow } from '@/queries/useTaskModule';

// Everything about a table field type in one place: how it's named and
// explained in "Add a field", how a value reads as text (search, filter,
// export), and how imported text becomes a value.

export interface FieldTypeMeta {
  label: string;
  icon: LucideIcon;
  /** The help line under the Type picker. */
  help: string;
  /** Filled in automatically from the row; can't be edited or asked on a form. */
  computed?: boolean;
  /** Can be a question on a form. */
  formable: boolean;
}

export const FIELD_TYPES: Record<TableFieldType, FieldTypeMeta> = {
  text: { label: 'Text', icon: Type, help: 'A single line.', formable: true },
  long_text: { label: 'Long text', icon: AlignLeft, help: 'Several lines — notes, summaries, updates.', formable: true },
  number: { label: 'Number', icon: Hash, help: 'A number, with as many decimals as you choose.', formable: true },
  currency: { label: 'Currency', icon: CircleDollarSign, help: 'An amount of money.', formable: true },
  date: { label: 'Date', icon: Calendar, help: 'A calendar date.', formable: true },
  checkbox: { label: 'Checkbox', icon: CheckSquare, help: 'A tick box — yes or no.', formable: true },
  single_select: { label: 'Single select', icon: CircleChevronDown, help: 'Pick one option from a list.', formable: true },
  multi_select: { label: 'Multi select', icon: ListChecks, help: 'Pick any number of options from a list.', formable: true },
  link: { label: 'Link', icon: LinkIcon, help: 'A web address, starting with https://.', formable: true },
  email: { label: 'Email', icon: AtSign, help: 'An email address.', formable: true },
  phone: { label: 'Phone', icon: Phone, help: 'A phone number.', formable: true },
  person: { label: 'People', icon: Users, help: 'Someone in KD Ops.', formable: true },
  task: {
    label: 'Task link',
    icon: ListTodo,
    help: 'A link to an open task. On a form, it lists only the tasks of the person picked in the People question.',
    formable: true,
  },
  attachment: { label: 'Attachment', icon: Paperclip, help: 'Files, up to 25 MB each. Not available on forms.', formable: false },
  rating: { label: 'Rating', icon: Star, help: 'A score in stars.', formable: true },
  created_by: { label: 'Created by', icon: UserRound, help: 'Who added the row. Filled in automatically.', computed: true, formable: false },
  created_at: { label: 'Created at', icon: CalendarPlus, help: 'When the row was added. Filled in automatically.', computed: true, formable: false },
  last_modified: { label: 'Last modified', icon: History, help: 'When the row last changed. Filled in automatically.', computed: true, formable: false },
  auto_number: { label: 'Auto number', icon: ListOrdered, help: 'Counts up by one for every new row. Filled in automatically.', computed: true, formable: false },
};

export const FIELD_TYPE_ORDER = Object.keys(FIELD_TYPES) as TableFieldType[];

export const TEXTY: TableFieldType[] = ['text', 'long_text', 'link', 'email', 'phone'];
export const OPTION_TYPES: TableFieldType[] = ['single_select', 'multi_select'];

export const DEFAULT_CURRENCY = '₦';

export function defaultConfig(type: TableFieldType): TableFieldConfig {
  switch (type) {
    case 'currency': return { currency: DEFAULT_CURRENCY, decimals: 2 };
    case 'number': return { decimals: 0 };
    case 'rating': return { rating_max: 5 };
    case 'single_select':
    case 'multi_select': return { options: [] };
    default: return {};
  }
}

// Option chips: a fixed colour per position in the option list, so an
// option keeps its colour however the rows are filtered.
const CHIP_COLORS = [
  'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'bg-amber-500/20 text-amber-800 dark:text-amber-300',
  'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  'bg-slate-500/20 text-slate-700 dark:text-slate-300',
];
export function optionChip(field: TableField, option: string): string {
  const i = (field.config.options ?? []).indexOf(option);
  return CHIP_COLORS[(i < 0 ? 7 : i) % CHIP_COLORS.length];
}

export interface AttachmentValue { path: string; name: string; size: number; type?: string }

/** The raw value for a field: computed fields read the row itself. */
export function cellValue(field: TableField, record: TableRecordRow): unknown {
  switch (field.type) {
    case 'created_by': return record.created_by;
    case 'created_at': return record.created_at;
    case 'last_modified': return record.updated_at;
    case 'auto_number': return record.row_number;
    default: return record.data[field.id];
  }
}

export function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  return typeof v === 'string' && v ? [v] : [];
}

export function formatNumber(n: number, decimals = 0): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export interface NameLookups {
  personName: (id: string) => string;
  taskTitle: (id: string) => string;
}

/** A value as plain text — what search, filters and CSV export see. */
export function displayText(field: TableField, record: TableRecordRow, names: NameLookups): string {
  const v = cellValue(field, record);
  if (v == null || v === '') return '';
  switch (field.type) {
    case 'number': return typeof v === 'number' ? formatNumber(v, field.config.decimals ?? 0) : String(v);
    case 'currency': return typeof v === 'number' ? `${field.config.currency ?? DEFAULT_CURRENCY}${formatNumber(v, field.config.decimals ?? 2)}` : String(v);
    case 'checkbox': return v ? 'Yes' : '';
    case 'date': return typeof v === 'string' && isValid(parseISO(v)) ? format(parseISO(v), 'd MMM yyyy') : String(v);
    case 'created_at':
    case 'last_modified': return typeof v === 'string' ? format(parseISO(v), 'd MMM yyyy, HH:mm') : '';
    case 'multi_select': return asList(v).join(', ');
    case 'person':
    case 'created_by': return asList(v).map(names.personName).join(', ');
    case 'task': return asList(v).map(names.taskTitle).join(', ');
    case 'attachment': return Array.isArray(v) ? (v as AttachmentValue[]).map((a) => a.name).join(', ') : '';
    case 'rating': return typeof v === 'number' ? `${v}/${field.config.rating_max ?? 5}` : '';
    default: return String(v);
  }
}

export interface ImportLookups {
  personByName: (s: string) => string | undefined;
  taskByTitle: (s: string) => string | undefined;
}

const TRUE_WORDS = new Set(['true', 'yes', 'y', '1', 'x', '✓', 'checked', 'done']);

/**
 * Turns one imported cell into a stored value. `undefined` means "leave
 * this cell empty" (blank, or nothing matched).
 */
export function parseImported(field: TableField, raw: string, lookups: ImportLookups): unknown {
  const s = raw.trim();
  if (!s || FIELD_TYPES[field.type].computed || field.type === 'attachment') return undefined;
  switch (field.type) {
    case 'number':
    case 'currency': {
      const n = Number(s.replace(/[^\d.-]/g, ''));
      return Number.isFinite(n) && /\d/.test(s) ? n : undefined;
    }
    case 'rating': {
      const n = Math.round(Number(s.split('/')[0]));
      return n >= 1 && n <= (field.config.rating_max ?? 5) ? n : undefined;
    }
    case 'checkbox': return TRUE_WORDS.has(s.toLowerCase()) ? true : undefined;
    case 'date': {
      for (const f of ['yyyy-MM-dd', 'd/M/yyyy', 'd MMM yyyy', 'd MMMM yyyy', 'MMM d, yyyy']) {
        const d = parse(s, f, new Date());
        if (isValid(d)) return format(d, 'yyyy-MM-dd');
      }
      const d = new Date(s);
      return isValid(d) ? format(d, 'yyyy-MM-dd') : undefined;
    }
    case 'single_select':
      return (field.config.options ?? []).find((o) => o.toLowerCase() === s.toLowerCase());
    case 'multi_select': {
      const picked = s.split(',').map((x) => x.trim().toLowerCase());
      const hit = (field.config.options ?? []).filter((o) => picked.includes(o.toLowerCase()));
      return hit.length ? hit : undefined;
    }
    case 'person': {
      const ids = s.split(',').map((x) => lookups.personByName(x.trim())).filter((x): x is string => !!x);
      if (!ids.length) return undefined;
      return field.config.multiple ? ids : ids[0];
    }
    case 'task': {
      const ids = s.split(',').map((x) => lookups.taskByTitle(x.trim())).filter((x): x is string => !!x);
      if (!ids.length) return undefined;
      return field.config.multiple ? ids : ids[0];
    }
    default: {
      const max = field.config.max_length;
      return max ? s.slice(0, max) : s;
    }
  }
}

/** CSV-safe: wrap in quotes when needed, and defuse spreadsheet formulas. */
export function csvCell(s: string): string {
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
