export type UIType =
  | 'SingleLineText'
  | 'LongText'
  | 'Email'
  | 'PhoneNumber'
  | 'URL'
  | 'Number'
  | 'Decimal'
  | 'Currency'
  | 'Percent'
  | 'Duration'
  | 'Rating'
  | 'Date'
  | 'DateTime'
  | 'Year'
  | 'Time'
  | 'CreatedTime'
  | 'LastModifiedTime'
  | 'SingleSelect'
  | 'MultiSelect'
  | 'Checkbox'
  | 'Links'
  | 'Lookup'
  | 'Rollup'
  | 'Formula'
  | 'Attachment'
  | 'ID'
  | 'AutoNumber'
  | 'CreatedBy'
  | 'LastModifiedBy'
  | 'JSON';

export interface Workspace {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Base {
  id: string;
  workspace_id: string;
  name: string;
  schema_name: string;
  icon: string | null;
  color: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface TableMeta {
  id: string;
  base_id: string;
  name: string;
  pg_table_name: string;
  primary_field_id: string | null;
  icon: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface SelectChoice {
  title: string;
  color: string;
}

export interface ValidationRule {
  type: 'required' | 'min' | 'max' | 'minLength' | 'maxLength' | 'regex' | 'unique' | 'email' | 'url';
  value?: any;
  message?: string;
}

export interface FieldOptions {
  maxLength?: number;
  richText?: boolean;
  format?: string;
  precision?: number;
  negative?: boolean;
  currencyCode?: string;
  locale?: string;
  use12h?: boolean;
  max?: number;
  icon?: string;
  choices?: SelectChoice[];
  relatedTableId?: string;
  type?: 'hm' | 'bt' | 'mm';
  linkFieldId?: string;
  lookupFieldId?: string;
  rollupFieldId?: string;
  fn?: string;
  expression?: string;
  maxCount?: number;
  maxSizeMB?: number;
  allowedTypes?: string[];
  prefix?: string;
  validations?: ValidationRule[];
}

export interface FieldMeta {
  id: string;
  table_id: string;
  name: string;
  pg_column_name: string;
  ui_type: UIType;
  pg_type: string;
  options: FieldOptions;
  position: number;
  width: number;
  is_primary: boolean;
  is_required: boolean;
  is_unique: boolean;
  is_system: boolean;
  is_hidden: boolean;
  description: string | null;
  default_value: string | null;
  created_at: string;
  updated_at: string;
}

export interface ViewMeta {
  id: string;
  table_id: string;
  name: string;
  type: 'grid' | 'kanban' | 'form' | 'calendar' | 'gallery' | 'timeline' | 'gantt';
  filters: Filter[];
  sorts: Sort[];
  groups: Group[];
  field_order: string[];
  field_visibility: Record<string, boolean>;
  field_widths: Record<string, number>;
  is_default: boolean;
  is_locked: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export type FilterOperator =
  | 'is' | 'isNot' | 'contains' | 'doesNotContain'
  | 'startsWith' | 'endsWith' | 'isEmpty' | 'isNotEmpty'
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'isBefore' | 'isAfter' | 'isOnOrBefore' | 'isOnOrAfter'
  | 'isBetween' | 'isWithin'
  | 'isWithinPastWeek' | 'isWithinPastMonth' | 'isWithinPastYear'
  | 'isAnyOf' | 'isNoneOf' | 'isExactly'
  | 'containsAnyOf' | 'doesNotContainAnyOf'
  | 'isChecked' | 'isNotChecked'
  | 'linkCountIs' | 'linkCountGt' | 'linkCountLt';

export interface Filter {
  id: string;
  field_id: string;
  operator: FilterOperator;
  value: any;
  conjunction: 'and' | 'or';
}

export interface FilterGroup {
  id: string;
  conjunction: 'and' | 'or';
  filters: Filter[];
  groups: FilterGroup[];
}

export interface Sort {
  field_id: string;
  direction: 'asc' | 'desc';
}

export interface Group {
  field_id: string;
  direction: 'asc' | 'desc';
}

export interface RowColorRule {
  id: string;
  field_id: string;
  operator: FilterOperator;
  value: any;
  color: string; // hex bg color
}

export type ConditionalFormatOperator =
  | 'is' | 'isNot' | 'contains' | 'doesNotContain'
  | 'isEmpty' | 'isNotEmpty'
  | 'gt' | 'lt' | 'gte' | 'lte';

export interface ConditionalFormatRule {
  id: string;
  field_id: string;
  operator: ConditionalFormatOperator;
  value: any;
  color: string; // hex bg color for the cell
}

export type RecordRow = Record<string, any> & {
  id: string;
  created_at: string;
  updated_at: string;
};

export const UI_TYPE_TO_PG_TYPE: Record<string, string> = {
  SingleLineText: 'TEXT',
  LongText: 'TEXT',
  Email: 'TEXT',
  PhoneNumber: 'TEXT',
  URL: 'TEXT',
  Number: 'NUMERIC',
  Decimal: 'NUMERIC(15,4)',
  Currency: 'NUMERIC(15,2)',
  Percent: 'NUMERIC(8,4)',
  Duration: 'INTEGER',
  Rating: 'SMALLINT',
  Date: 'DATE',
  DateTime: 'TIMESTAMPTZ',
  Year: 'SMALLINT',
  Time: 'TIME',
  SingleSelect: 'TEXT',
  MultiSelect: 'TEXT[]',
  Checkbox: 'BOOLEAN DEFAULT false',
  Attachment: "JSONB DEFAULT '[]'::jsonb",
  AutoNumber: 'SERIAL',
  JSON: 'JSONB',
};

export const VIRTUAL_TYPES: UIType[] = [
  'Links', 'Lookup', 'Rollup', 'Formula',
  'CreatedTime', 'LastModifiedTime', 'CreatedBy', 'LastModifiedBy', 'ID',
];

export const PILL_COLORS = [
  { name: 'Blue', bg: '#DBEAFE', text: '#1E40AF' },
  { name: 'Green', bg: '#D1FAE5', text: '#065F46' },
  { name: 'Yellow', bg: '#FEF3C7', text: '#92400E' },
  { name: 'Red', bg: '#FEE2E2', text: '#991B1B' },
  { name: 'Purple', bg: '#EDE9FE', text: '#5B21B6' },
  { name: 'Pink', bg: '#FCE7F3', text: '#9D174D' },
  { name: 'Orange', bg: '#FFEDD5', text: '#9A3412' },
  { name: 'Gray', bg: '#F1F5F9', text: '#334155' },
  { name: 'Teal', bg: '#CCFBF1', text: '#115E59' },
  { name: 'Indigo', bg: '#E0E7FF', text: '#3730A3' },
];

export interface WebhookConfig {
  id: string;
  table_id: string;
  name: string;
  event: 'record.created' | 'record.updated' | 'record.deleted';
  url: string;
  method: 'POST' | 'PUT' | 'PATCH';
  headers: Record<string, string>;
  enabled: boolean;
  created_at: string;
}

export interface WebhookMeta {
  id: string;
  base_id: string;
  table_id: string;
  name: string;
  event: 'record.created' | 'record.updated' | 'record.deleted';
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers: Record<string, string>;
  enabled: boolean;
  created_at: string;
}

export interface AutomationAction {
  id: string;
  type: 'send_email' | 'send_webhook' | 'update_record' | 'create_record' | 'send_notification';
  config: Record<string, any>;
}

export interface Automation {
  id: string;
  base_id: string;
  table_id: string;
  name: string;
  enabled: boolean;
  trigger_type: 'record_created' | 'record_updated' | 'record_deleted' | 'field_changed' | 'scheduled';
  trigger_config: Record<string, any>;
  actions: AutomationAction[];
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  id: string;
  base_id: string;
  table_id: string;
  record_id: string | null;
  user_email: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE' | 'BULK_DELETE' | 'CREATE_TABLE' | 'DELETE_TABLE' | 'CREATE_FIELD' | 'DELETE_FIELD';
  description: string;
  changes: Record<string, { old: any; new: any }> | null;
  created_at: string;
}

export const OPERATORS_BY_TYPE: Partial<Record<UIType, FilterOperator[]>> = {
  SingleLineText: ['is', 'isNot', 'contains', 'doesNotContain', 'startsWith', 'endsWith', 'isEmpty', 'isNotEmpty'],
  LongText: ['is', 'isNot', 'contains', 'doesNotContain', 'isEmpty', 'isNotEmpty'],
  Number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty'],
  Currency: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty'],
  Percent: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty'],
  Date: ['is', 'isBefore', 'isAfter', 'isOnOrBefore', 'isOnOrAfter', 'isBetween', 'isWithin', 'isWithinPastWeek', 'isWithinPastMonth', 'isWithinPastYear', 'isEmpty', 'isNotEmpty'],
  DateTime: ['is', 'isBefore', 'isAfter', 'isOnOrBefore', 'isOnOrAfter', 'isBetween', 'isWithin', 'isWithinPastWeek', 'isWithinPastMonth', 'isWithinPastYear', 'isEmpty', 'isNotEmpty'],
  SingleSelect: ['is', 'isNot', 'isAnyOf', 'isNoneOf', 'isEmpty', 'isNotEmpty'],
  MultiSelect: ['contains', 'doesNotContain', 'containsAnyOf', 'doesNotContainAnyOf', 'isExactly', 'isEmpty', 'isNotEmpty'],
  Checkbox: ['isChecked', 'isNotChecked'],
  Email: ['is', 'isNot', 'contains', 'doesNotContain', 'isEmpty', 'isNotEmpty'],
  URL: ['is', 'isNot', 'contains', 'doesNotContain', 'isEmpty', 'isNotEmpty'],
};
