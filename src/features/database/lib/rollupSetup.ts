import type { FieldMeta } from '../types';

/**
 * The thinking behind setting up a Lookup, Rollup or Count field: which functions make sense for the field
 * you picked, what each does in plain words, a worked example, and what is still missing. No screen code in
 * here, so all of it is tested directly. The names are the ones stored on the field and understood by
 * computations.ts, so existing fields keep working.
 */

export type RollupKind = 'Lookup' | 'Rollup' | 'Count';

/** What kind of values a function can work on. */
export type Accepts = 'any' | 'number' | 'comparable' | 'boolean';

export interface RollupFunctionInfo {
  /** The name stored on the field. */
  name: string;
  /** What the menu shows. */
  label: string;
  /** One plain sentence about what it does. */
  description: string;
  /** Needs a field to work on (counting linked records does not). */
  needsField: boolean;
  accepts: Accepts;
  /** Shown in the menu. A few older names do exactly what another does and are kept only for existing fields. */
  listed: boolean;
  /** "{field}" and "{link}" are filled in: what the setup will do, as a sentence. */
  sentence: string;
  /** A worked example: the values on the linked records, and what comes out. */
  example: { values: string[]; result: string };
}

const NUMBER_TYPES = ['Number', 'Decimal', 'Currency', 'Percent', 'Duration', 'Rating'];
const DATE_TYPES = ['Date', 'DateTime', 'CreatedTime', 'LastModifiedTime', 'Year', 'Time'];

export const ROLLUP_FUNCTIONS: readonly RollupFunctionInfo[] = [
  {
    name: 'COUNT', label: 'Count the linked records', description: 'How many records are linked. Needs no field.', needsField: false, accepts: 'any', listed: true,
    sentence: 'Counts the records linked through "{link}".', example: { values: ['Alpha', 'Beta', 'Gamma'], result: '3' },
  },
  {
    name: 'COUNTALL', label: 'Count the linked records', description: 'How many records are linked (same as Count).', needsField: false, accepts: 'any', listed: false,
    sentence: 'Counts the records linked through "{link}".', example: { values: ['Alpha', 'Beta', 'Gamma'], result: '3' },
  },
  {
    name: 'COUNTA', label: 'Count the ones filled in', description: 'How many of the linked records have a value in this field.', needsField: true, accepts: 'any', listed: true,
    sentence: 'Counts how many records linked through "{link}" have "{field}" filled in.', example: { values: ['Paid', '(empty)', 'Paid'], result: '2' },
  },
  {
    name: 'SUM', label: 'Add them up', description: 'The total of all the numbers.', needsField: true, accepts: 'number', listed: true,
    sentence: 'Adds up "{field}" across the records linked through "{link}".', example: { values: ['1,200', '800', '500'], result: '2,500' },
  },
  {
    name: 'AVG', label: 'Average', description: 'The total divided by how many numbers there are.', needsField: true, accepts: 'number', listed: true,
    sentence: 'Averages "{field}" across the records linked through "{link}".', example: { values: ['10', '20', '60'], result: '30' },
  },
  {
    name: 'MEDIAN', label: 'Middle value', description: 'The number in the middle when sorted, so one huge value does not skew it.', needsField: true, accepts: 'number', listed: true,
    sentence: 'Finds the middle value of "{field}" across the records linked through "{link}".', example: { values: ['10', '20', '900'], result: '20' },
  },
  {
    name: 'MIN', label: 'Smallest or earliest', description: 'The lowest number, or the earliest date.', needsField: true, accepts: 'comparable', listed: true,
    sentence: 'Finds the smallest (or earliest) "{field}" among the records linked through "{link}".', example: { values: ['12 Mar', '3 Jan', '28 Feb'], result: '3 Jan' },
  },
  {
    name: 'MAX', label: 'Largest or latest', description: 'The highest number, or the latest date.', needsField: true, accepts: 'comparable', listed: true,
    sentence: 'Finds the largest (or latest) "{field}" among the records linked through "{link}".', example: { values: ['12 Mar', '3 Jan', '28 Feb'], result: '12 Mar' },
  },
  {
    name: 'CONCATENATE', label: 'Join into one line of text', description: 'Every value, separated by commas.', needsField: true, accepts: 'any', listed: true,
    sentence: 'Joins "{field}" from the records linked through "{link}" into one line.', example: { values: ['Alpha', 'Beta', 'Gamma'], result: 'Alpha, Beta, Gamma' },
  },
  {
    name: 'ARRAYJOIN', label: 'Join into one line of text', description: 'Every value, separated by commas (same as Join).', needsField: true, accepts: 'any', listed: false,
    sentence: 'Joins "{field}" from the records linked through "{link}" into one line.', example: { values: ['Alpha', 'Beta', 'Gamma'], result: 'Alpha, Beta, Gamma' },
  },
  {
    name: 'ARRAYCOMPACT', label: 'List the ones filled in', description: 'A list of the values, leaving out empty ones.', needsField: true, accepts: 'any', listed: true,
    sentence: 'Lists "{field}" from the records linked through "{link}", skipping empty ones.', example: { values: ['Alpha', '(empty)', 'Beta'], result: 'Alpha, Beta' },
  },
  {
    name: 'ARRAY_UNIQUE', label: 'List without repeats', description: 'A list of the values, each shown once.', needsField: true, accepts: 'any', listed: true,
    sentence: 'Lists the different values of "{field}" across the records linked through "{link}".', example: { values: ['Open', 'Done', 'Open'], result: 'Open, Done' },
  },
  {
    name: 'AND', label: 'All are checked', description: 'Yes only when every linked record has the box ticked.', needsField: true, accepts: 'boolean', listed: true,
    sentence: 'Is Yes only when "{field}" is ticked on every record linked through "{link}".', example: { values: ['✓', '✓', '✓'], result: 'Yes' },
  },
  {
    name: 'OR', label: 'Any is checked', description: 'Yes when at least one linked record has the box ticked.', needsField: true, accepts: 'boolean', listed: true,
    sentence: 'Is Yes when "{field}" is ticked on any record linked through "{link}".', example: { values: ['✓', '☐', '☐'], result: 'Yes' },
  },
  {
    name: 'XOR', label: 'An odd number are checked', description: 'Yes when 1, 3, 5… of the linked records have the box ticked.', needsField: true, accepts: 'boolean', listed: true,
    sentence: 'Is Yes when an odd number of records linked through "{link}" have "{field}" ticked.', example: { values: ['✓', '☐', '☐'], result: 'Yes' },
  },
];

const BY_NAME = new Map(ROLLUP_FUNCTIONS.map((f) => [f.name, f]));

export function rollupFunction(name: string): RollupFunctionInfo | undefined {
  return BY_NAME.get(name.toUpperCase());
}

/** A few names do exactly what another does; the menu shows the one it lists, so a field using the other still shows as chosen. */
export function canonicalFunction(name: string): string {
  const upper = name.toUpperCase();
  if (upper === 'COUNTALL') return 'COUNT';
  if (upper === 'ARRAYJOIN') return 'CONCATENATE';
  return upper;
}

/** Whether a function can work on a field of this type. With no field chosen yet, everything is possible. */
export function acceptsType(accepts: Accepts, uiType: string | undefined): boolean {
  if (accepts === 'any' || !uiType) return true;
  if (accepts === 'number') return NUMBER_TYPES.includes(uiType);
  if (accepts === 'comparable') return NUMBER_TYPES.includes(uiType) || DATE_TYPES.includes(uiType);
  return uiType === 'Checkbox';
}

/**
 * The functions to offer for the field chosen. Counting records needs no field, so with no field chosen only
 * that is offered; with a field, only the functions that make sense for its type.
 */
export function functionsForTarget(targetUiType: string | undefined, hasField: boolean): RollupFunctionInfo[] {
  if (!hasField) return ROLLUP_FUNCTIONS.filter((f) => f.listed && !f.needsField);
  return ROLLUP_FUNCTIONS.filter((f) => f.listed && f.needsField && acceptsType(f.accepts, targetUiType));
}

/** The function a field type most often wants, used when the field changes. */
export function defaultFunctionFor(targetUiType: string | undefined): string {
  if (!targetUiType) return 'COUNT';
  if (NUMBER_TYPES.includes(targetUiType)) return 'SUM';
  if (DATE_TYPES.includes(targetUiType)) return 'MAX';
  if (targetUiType === 'Checkbox') return 'AND';
  return 'CONCATENATE';
}

/**
 * The function to use after the field changed: keep the current one if it still fits the new field, otherwise
 * the usual one for that field type. With no field it is always COUNT.
 */
export function reconcileFunction(current: string, targetUiType: string | undefined, hasField: boolean): string {
  if (!hasField) return 'COUNT';
  const info = rollupFunction(current);
  if (info && info.needsField && acceptsType(info.accepts, targetUiType)) return info.name;
  return defaultFunctionFor(targetUiType);
}

export interface SetupState {
  kind: RollupKind;
  linkFieldId: string;
  /** Lookup: the field to show. Rollup: the field to work on ('' to just count). */
  targetFieldId: string;
  fn: string;
}

/** What is still missing, in the order the person fills it in, or an empty string when the setup is complete. */
export function setupProblem(state: SetupState, hasLinkFields: boolean): string {
  if (!hasLinkFields) return 'This table has no link fields yet. Create one first.';
  if (!state.linkFieldId) return 'Choose which link to follow.';
  if (state.kind === 'Lookup' && !state.targetFieldId) return 'Choose the field to show.';
  if (state.kind === 'Rollup') {
    const info = rollupFunction(state.fn);
    if (info?.needsField && !state.targetFieldId) return 'Choose the field to work on, or choose "just count".';
  }
  return '';
}

/** What the setup will do, as one sentence, once enough is chosen to say so; otherwise an empty string. */
export function describeSetup(input: { kind: RollupKind; fn: string; linkName: string; fieldName: string }): string {
  const { kind, fn, linkName, fieldName } = input;
  if (!linkName) return '';
  if (kind === 'Count') return `Counts the records linked through "${linkName}".`;
  if (kind === 'Lookup') {
    return fieldName ? `Shows "${fieldName}" from each record linked through "${linkName}".` : '';
  }
  const info = rollupFunction(fn);
  if (!info) return '';
  if (info.needsField && !fieldName) return '';
  return info.sentence.replace('{field}', fieldName).replace('{link}', linkName);
}

/** Linked-table fields a lookup or rollup can read, with their type, so the menu can say "Amount · Currency". */
export function fieldChoiceLabel(field: Pick<FieldMeta, 'name' | 'ui_type'>): string {
  return `${field.name} · ${field.ui_type}`;
}
