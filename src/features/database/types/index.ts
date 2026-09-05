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
  | 'Count'
  | 'Formula'
  | 'Attachment'
  | 'ID'
  | 'AutoNumber'
  | 'CreatedBy'
  | 'LastModifiedBy'
  | 'JSON'
  | 'Barcode'
  | 'Button'
  | 'User';

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
  slug: string | null;
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
  slug: string | null;
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
  label?: string;
  url?: string;
  validations?: ValidationRule[];
  allowMultiple?: boolean;
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
  slug: string | null;
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
  Barcode: 'TEXT',
  User: "JSONB DEFAULT '[]'::jsonb",
};

export const VIRTUAL_TYPES: UIType[] = [
  'Links', 'Lookup', 'Rollup', 'Count', 'Formula',
  'CreatedTime', 'LastModifiedTime', 'CreatedBy', 'LastModifiedBy', 'ID',
  'Button',
];

export const SELECT_COLORS: Record<string, { bg: string; text: string; darkBg: string; darkText: string }> = {
  blueLight2:   { bg: '#D0E0FC', text: '#2750AE', darkBg: '#1a2a42', darkText: '#9CC1FA' },
  blueLight1:   { bg: '#9CC1FA', text: '#2750AE', darkBg: '#1e3a5f', darkText: '#D0E0FC' },
  blueBright:   { bg: '#2D7FF9', text: '#FFFFFF', darkBg: '#2D7FF9', darkText: '#FFFFFF' },
  blueDark1:    { bg: '#2750AE', text: '#FFFFFF', darkBg: '#2750AE', darkText: '#D0E0FC' },
  cyanLight2:   { bg: '#C2F5E9', text: '#0B76B7', darkBg: '#0d2d3a', darkText: '#72DDC3' },
  cyanLight1:   { bg: '#72DDC3', text: '#0B76B7', darkBg: '#0f3d4a', darkText: '#C2F5E9' },
  cyanBright:   { bg: '#18BFFF', text: '#FFFFFF', darkBg: '#18BFFF', darkText: '#FFFFFF' },
  cyanDark1:    { bg: '#0B76B7', text: '#FFFFFF', darkBg: '#0B76B7', darkText: '#C2F5E9' },
  tealLight2:   { bg: '#C2F5E9', text: '#06A09B', darkBg: '#0d2d2d', darkText: '#72DDC3' },
  tealLight1:   { bg: '#72DDC3', text: '#06A09B', darkBg: '#0f3d3d', darkText: '#C2F5E9' },
  tealBright:   { bg: '#20D9D2', text: '#1a1a1a', darkBg: '#20D9D2', darkText: '#1a1a1a' },
  tealDark1:    { bg: '#06A09B', text: '#FFFFFF', darkBg: '#06A09B', darkText: '#C2F5E9' },
  greenLight2:  { bg: '#D1F7C4', text: '#338A17', darkBg: '#1a2d14', darkText: '#93E088' },
  greenLight1:  { bg: '#93E088', text: '#338A17', darkBg: '#1f3d17', darkText: '#D1F7C4' },
  greenBright:  { bg: '#20C933', text: '#FFFFFF', darkBg: '#20C933', darkText: '#FFFFFF' },
  greenDark1:   { bg: '#338A17', text: '#FFFFFF', darkBg: '#338A17', darkText: '#D1F7C4' },
  yellowLight2: { bg: '#FFEAB6', text: '#B87503', darkBg: '#3d2d0a', darkText: '#FFD66E' },
  yellowLight1: { bg: '#FFD66E', text: '#B87503', darkBg: '#4d3d0f', darkText: '#FFEAB6' },
  yellowBright: { bg: '#FCB400', text: '#1a1a1a', darkBg: '#FCB400', darkText: '#1a1a1a' },
  yellowDark1:  { bg: '#B87503', text: '#FFFFFF', darkBg: '#B87503', darkText: '#FFEAB6' },
  orangeLight2: { bg: '#FEE2D5', text: '#D74D26', darkBg: '#3d1a0f', darkText: '#FFA981' },
  orangeLight1: { bg: '#FFA981', text: '#D74D26', darkBg: '#4d2517', darkText: '#FEE2D5' },
  orangeBright: { bg: '#FF6F2C', text: '#FFFFFF', darkBg: '#FF6F2C', darkText: '#FFFFFF' },
  orangeDark1:  { bg: '#D74D26', text: '#FFFFFF', darkBg: '#D74D26', darkText: '#FEE2D5' },
  redLight2:    { bg: '#FFDCE5', text: '#BA1E45', darkBg: '#3d0f1a', darkText: '#FF9EB7' },
  redLight1:    { bg: '#FF9EB7', text: '#BA1E45', darkBg: '#4d1725', darkText: '#FFDCE5' },
  redBright:    { bg: '#F82B60', text: '#FFFFFF', darkBg: '#F82B60', darkText: '#FFFFFF' },
  redDark1:     { bg: '#BA1E45', text: '#FFFFFF', darkBg: '#BA1E45', darkText: '#FFDCE5' },
  pinkLight2:   { bg: '#F5D0FE', text: '#B2158B', darkBg: '#3d0f3a', darkText: '#E9A0F4' },
  pinkLight1:   { bg: '#E9A0F4', text: '#B2158B', darkBg: '#4d174d', darkText: '#F5D0FE' },
  pinkBright:   { bg: '#FF08C2', text: '#FFFFFF', darkBg: '#FF08C2', darkText: '#FFFFFF' },
  pinkDark1:    { bg: '#B2158B', text: '#FFFFFF', darkBg: '#B2158B', darkText: '#F5D0FE' },
  purpleLight2: { bg: '#EDE2FE', text: '#6B1CB0', darkBg: '#2d1a3d', darkText: '#CDB0FF' },
  purpleLight1: { bg: '#CDB0FF', text: '#6B1CB0', darkBg: '#3d254d', darkText: '#EDE2FE' },
  purpleBright: { bg: '#8B46FF', text: '#FFFFFF', darkBg: '#8B46FF', darkText: '#FFFFFF' },
  purpleDark1:  { bg: '#6B1CB0', text: '#FFFFFF', darkBg: '#6B1CB0', darkText: '#EDE2FE' },
  grayLight2:   { bg: '#EEEEEE', text: '#666666', darkBg: '#2a2a2a', darkText: '#CCCCCC' },
  grayLight1:   { bg: '#CCCCCC', text: '#666666', darkBg: '#3a3a3a', darkText: '#EEEEEE' },
  grayBright:   { bg: '#999999', text: '#FFFFFF', darkBg: '#999999', darkText: '#FFFFFF' },
  grayDark1:    { bg: '#666666', text: '#FFFFFF', darkBg: '#666666', darkText: '#EEEEEE' },
};

export const SELECT_COLOR_NAMES = Object.keys(SELECT_COLORS);

/** @deprecated Use SELECT_COLORS instead */
export const PILL_COLORS = SELECT_COLOR_NAMES.map((name) => ({
  name,
  bg: SELECT_COLORS[name].bg,
  text: SELECT_COLORS[name].text,
}));

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

/**
 * Type conversion safety classification.
 * - 'safe': no data loss expected
 * - 'lossy': some values may become null or change
 * - 'impossible': conversion is not supported
 */
export type ConversionSafety = 'safe' | 'lossy' | 'impossible';

export interface ConversionRule {
  safety: ConversionSafety;
  warning?: string;
}

/**
 * Map of source UIType -> target UIType -> ConversionRule.
 * Missing entries are treated as 'impossible'.
 */
export const TYPE_CONVERSION_RULES: Partial<Record<UIType, Partial<Record<UIType, ConversionRule>>>> = {
  SingleLineText: {
    LongText: { safety: 'safe' },
    Email: { safety: 'safe', warning: 'Existing values that are not valid emails will fail validation.' },
    PhoneNumber: { safety: 'safe' },
    URL: { safety: 'safe', warning: 'Existing values that are not valid URLs will fail validation.' },
    Number: { safety: 'lossy', warning: 'Non-numeric text values will become null.' },
    Decimal: { safety: 'lossy', warning: 'Non-numeric text values will become null.' },
    Currency: { safety: 'lossy', warning: 'Non-numeric text values will become null.' },
    Percent: { safety: 'lossy', warning: 'Non-numeric text values will become null.' },
    JSON: { safety: 'lossy', warning: 'Non-JSON text will become null.' },
    SingleSelect: { safety: 'safe', warning: 'Existing values will become select options.' },
  },
  LongText: {
    SingleLineText: { safety: 'lossy', warning: 'Text will not be truncated but multi-line content loses formatting.' },
    Email: { safety: 'lossy', warning: 'Non-email values will fail validation.' },
    URL: { safety: 'lossy', warning: 'Non-URL values will fail validation.' },
    JSON: { safety: 'lossy', warning: 'Non-JSON text will become null.' },
  },
  Email: {
    SingleLineText: { safety: 'safe' },
    LongText: { safety: 'safe' },
    URL: { safety: 'safe' },
    PhoneNumber: { safety: 'safe' },
  },
  PhoneNumber: {
    SingleLineText: { safety: 'safe' },
    LongText: { safety: 'safe' },
    Email: { safety: 'safe' },
    URL: { safety: 'safe' },
  },
  URL: {
    SingleLineText: { safety: 'safe' },
    LongText: { safety: 'safe' },
    Email: { safety: 'safe' },
    PhoneNumber: { safety: 'safe' },
  },
  Number: {
    SingleLineText: { safety: 'safe' },
    LongText: { safety: 'safe' },
    Decimal: { safety: 'safe' },
    Currency: { safety: 'safe' },
    Percent: { safety: 'safe' },
    Rating: { safety: 'lossy', warning: 'Values outside the rating range will be clamped.' },
    Checkbox: { safety: 'lossy', warning: 'Non-zero becomes true, zero becomes false.' },
    Duration: { safety: 'lossy', warning: 'Decimals will be truncated to whole seconds.' },
    Year: { safety: 'lossy', warning: 'Values outside valid year range may be lost.' },
  },
  Decimal: {
    SingleLineText: { safety: 'safe' },
    LongText: { safety: 'safe' },
    Number: { safety: 'lossy', warning: 'Decimal places will be truncated.' },
    Currency: { safety: 'safe' },
    Percent: { safety: 'safe' },
  },
  Currency: {
    SingleLineText: { safety: 'safe' },
    LongText: { safety: 'safe' },
    Number: { safety: 'lossy', warning: 'Decimal places may be truncated.' },
    Decimal: { safety: 'safe' },
    Percent: { safety: 'safe' },
  },
  Percent: {
    SingleLineText: { safety: 'safe' },
    LongText: { safety: 'safe' },
    Number: { safety: 'safe' },
    Decimal: { safety: 'safe' },
    Currency: { safety: 'safe' },
  },
  Duration: {
    Number: { safety: 'safe' },
    Decimal: { safety: 'safe' },
    SingleLineText: { safety: 'safe' },
  },
  Rating: {
    Number: { safety: 'safe' },
    Decimal: { safety: 'safe' },
    SingleLineText: { safety: 'safe' },
  },
  Year: {
    Number: { safety: 'safe' },
    SingleLineText: { safety: 'safe' },
  },
  Date: {
    DateTime: { safety: 'safe', warning: 'Time will default to midnight.' },
    SingleLineText: { safety: 'safe' },
    Year: { safety: 'lossy', warning: 'Only the year portion will be kept.' },
  },
  DateTime: {
    Date: { safety: 'lossy', warning: 'Time information will be lost.' },
    Time: { safety: 'lossy', warning: 'Date information will be lost.' },
    SingleLineText: { safety: 'safe' },
  },
  Time: {
    SingleLineText: { safety: 'safe' },
    DateTime: { safety: 'lossy', warning: 'Date will default to today.' },
  },
  Checkbox: {
    Number: { safety: 'safe', warning: 'true becomes 1, false becomes 0.' },
    SingleLineText: { safety: 'safe', warning: 'Values become "true" or "false".' },
    LongText: { safety: 'safe', warning: 'Values become "true" or "false".' },
  },
  SingleSelect: {
    SingleLineText: { safety: 'safe' },
    LongText: { safety: 'safe' },
    MultiSelect: { safety: 'safe', warning: 'Value will become a single-item list.' },
  },
  MultiSelect: {
    SingleLineText: { safety: 'lossy', warning: 'Values will be joined with commas.' },
    LongText: { safety: 'lossy', warning: 'Values will be joined with commas.' },
    SingleSelect: { safety: 'lossy', warning: 'Only the first selected value will be kept.' },
  },
  JSON: {
    SingleLineText: { safety: 'lossy', warning: 'JSON will be serialized as text.' },
    LongText: { safety: 'safe', warning: 'JSON will be serialized as text.' },
  },
};

/**
 * Get the list of UITypes a given source type can convert to, with safety info.
 */
export function getConvertibleTypes(sourceType: UIType): Array<{ type: UIType; rule: ConversionRule }> {
  const rules = TYPE_CONVERSION_RULES[sourceType];
  if (!rules) return [];
  return Object.entries(rules).map(([type, rule]) => ({
    type: type as UIType,
    rule: rule!,
  }));
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
  PhoneNumber: ['is', 'isNot', 'contains', 'doesNotContain', 'startsWith', 'endsWith', 'isEmpty', 'isNotEmpty'],
  Decimal: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty'],
  Duration: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty'],
  Rating: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty'],
  Year: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty'],
  Time: ['is', 'isBefore', 'isAfter', 'isOnOrBefore', 'isOnOrAfter', 'isEmpty', 'isNotEmpty'],
  CreatedTime: ['is', 'isBefore', 'isAfter', 'isOnOrBefore', 'isOnOrAfter', 'isBetween', 'isWithin', 'isWithinPastWeek', 'isWithinPastMonth', 'isWithinPastYear', 'isEmpty', 'isNotEmpty'],
  LastModifiedTime: ['is', 'isBefore', 'isAfter', 'isOnOrBefore', 'isOnOrAfter', 'isBetween', 'isWithin', 'isWithinPastWeek', 'isWithinPastMonth', 'isWithinPastYear', 'isEmpty', 'isNotEmpty'],
  AutoNumber: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty'],
  ID: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty'],
  CreatedBy: ['is', 'isNot', 'contains', 'doesNotContain', 'isEmpty', 'isNotEmpty'],
  LastModifiedBy: ['is', 'isNot', 'contains', 'doesNotContain', 'isEmpty', 'isNotEmpty'],
  Attachment: ['isEmpty', 'isNotEmpty'],
  JSON: ['isEmpty', 'isNotEmpty'],
  Barcode: ['is', 'isNot', 'contains', 'doesNotContain', 'startsWith', 'endsWith', 'isEmpty', 'isNotEmpty'],
  Links: ['linkCountIs', 'linkCountGt', 'linkCountLt', 'isEmpty', 'isNotEmpty'],
  Lookup: ['is', 'isNot', 'contains', 'doesNotContain', 'isEmpty', 'isNotEmpty'],
  Rollup: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty'],
  Count: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty'],
  Formula: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'doesNotContain', 'isEmpty', 'isNotEmpty'],
  User: ['is', 'isNot', 'contains', 'doesNotContain', 'isEmpty', 'isNotEmpty'],
};
