import { parseFormula } from './formula';
import { functionDoc, FUNCTION_DOCS, type FunctionDoc } from './formulaDocs';

/**
 * The thinking behind the formula editor, with no editor library in it: scan text into coloured pieces, find
 * which argument the cursor is in, decide what autocomplete offers, turn a parse error into a message and a
 * position, and rename a field inside a formula. The editor component only wires these to the screen.
 */

// ---------------------------------------------------------------------------
// Scanner: forgiving, so it works on a formula that is half typed
// ---------------------------------------------------------------------------

export type ScanKind = 'field' | 'function' | 'name' | 'number' | 'string' | 'operator' | 'paren' | 'comma' | 'space' | 'unknown';

export interface ScanToken {
  kind: ScanKind;
  from: number;
  to: number;
  text: string;
  /** For fields and strings: false when the closing } or quote is missing. */
  closed?: boolean;
}

const OPERATORS_2 = new Set(['&&', '||', '!=', '<=', '>=']);
const OPERATORS_1 = new Set(['+', '-', '*', '/', '%', '^', '&', '=', '<', '>', '!']);

/** Splits formula text into pieces with exact positions. Never throws, whatever the text. */
export function scanFormula(text: string): ScanToken[] {
  const out: ScanToken[] = [];
  const len = text.length;
  let i = 0;
  while (i < len) {
    const ch = text[i];
    const start = i;

    if (/\s/.test(ch)) {
      while (i < len && /\s/.test(text[i])) i++;
      out.push({ kind: 'space', from: start, to: i, text: text.slice(start, i) });
    } else if (ch === '{') {
      i++;
      while (i < len && text[i] !== '}') i++;
      const closed = i < len;
      if (closed) i++;
      out.push({ kind: 'field', from: start, to: i, text: text.slice(start, i), closed });
    } else if (ch === '"' || ch === "'") {
      i++;
      while (i < len && text[i] !== ch) {
        if (text[i] === '\\' && i + 1 < len) i++;
        i++;
      }
      const closed = i < len;
      if (closed) i++;
      out.push({ kind: 'string', from: start, to: i, text: text.slice(start, i), closed });
    } else if (/\d/.test(ch) || (ch === '.' && i + 1 < len && /\d/.test(text[i + 1]))) {
      while (i < len && /[\d.]/.test(text[i])) i++;
      out.push({ kind: 'number', from: start, to: i, text: text.slice(start, i) });
    } else if (/[A-Za-z_]/.test(ch)) {
      while (i < len && /[A-Za-z0-9_]/.test(text[i])) i++;
      let j = i;
      while (j < len && /\s/.test(text[j])) j++;
      out.push({ kind: text[j] === '(' ? 'function' : 'name', from: start, to: i, text: text.slice(start, i) });
    } else if (OPERATORS_2.has(text.slice(i, i + 2))) {
      i += 2;
      out.push({ kind: 'operator', from: start, to: i, text: text.slice(start, i) });
    } else if (OPERATORS_1.has(ch)) {
      i++;
      out.push({ kind: 'operator', from: start, to: i, text: ch });
    } else if (ch === '(' || ch === ')') {
      i++;
      out.push({ kind: 'paren', from: start, to: i, text: ch });
    } else if (ch === ',') {
      i++;
      out.push({ kind: 'comma', from: start, to: i, text: ch });
    } else {
      i++;
      out.push({ kind: 'unknown', from: start, to: i, text: ch });
    }
  }
  return out;
}

/** The field name inside a field token: "{Total Cost}" gives "Total Cost". */
export function fieldNameOf(token: ScanToken): string {
  return token.text.slice(1, token.closed === false ? undefined : -1);
}

/** The names of the fields a formula refers to, once each, in order of first use. */
export function fieldsReferenced(text: string): string[] {
  const seen: string[] = [];
  for (const t of scanFormula(text)) {
    if (t.kind === 'field' && t.closed !== false) {
      const name = fieldNameOf(t);
      if (!seen.includes(name)) seen.push(name);
    }
  }
  return seen;
}

// ---------------------------------------------------------------------------
// Which argument is the cursor in
// ---------------------------------------------------------------------------

export interface ActiveArgument {
  name: string;
  /** Zero-based position of the argument the cursor is in. */
  argIndex: number;
}

/** The function call the cursor is inside, and which of its arguments, or null outside any call. */
export function activeArgument(text: string, pos: number): ActiveArgument | null {
  const frames: Array<{ name: string | null; argIndex: number }> = [];
  const tokens = scanFormula(text).filter((t) => t.to <= pos);
  let previous: ScanToken | null = null;
  for (const t of tokens) {
    if (t.kind === 'paren' && t.text === '(') {
      frames.push({ name: previous && previous.kind === 'function' ? previous.text.toUpperCase() : null, argIndex: 0 });
    } else if (t.kind === 'paren' && t.text === ')') {
      frames.pop();
    } else if (t.kind === 'comma' && frames.length > 0) {
      frames[frames.length - 1].argIndex++;
    }
    if (t.kind !== 'space') previous = t;
  }
  for (let i = frames.length - 1; i >= 0; i--) {
    const frame = frames[i];
    if (frame.name) return { name: frame.name, argIndex: frame.argIndex };
  }
  return null;
}

/**
 * Splits a signature such as `ROUND(number, [places])` into its argument labels so the hint can show the
 * current one in bold. A trailing "..." marks an argument that can repeat.
 */
export function signatureParts(signature: string): { name: string; args: string[] } {
  const open = signature.indexOf('(');
  const close = signature.lastIndexOf(')');
  const name = open === -1 ? signature : signature.slice(0, open);
  if (open === -1 || close <= open) return { name, args: [] };
  const inner = signature.slice(open + 1, close).trim();
  if (inner === '') return { name, args: [] };
  // Split on commas that are not inside square brackets, so "[text2, ...]" stays one argument.
  const args: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of inner) {
    if (ch === '[') depth++;
    if (ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  args.push(current.trim());
  return { name, args };
}

/** Which argument label to highlight for an argument position (a repeating last argument stays highlighted). */
export function highlightedArgument(args: string[], argIndex: number): number {
  if (args.length === 0) return -1;
  const last = args[args.length - 1];
  if (argIndex >= args.length) return /\.\.\./.test(last) ? args.length - 1 : -1;
  return argIndex;
}

// ---------------------------------------------------------------------------
// Autocomplete
// ---------------------------------------------------------------------------

export interface FieldChoice {
  name: string;
  /** The field's type, shown as the hint beside its name. */
  type?: string;
}

export interface CompletionOption {
  label: string;
  /** What replaces the typed text. */
  insert: string;
  kind: 'field' | 'function';
  /** Short text beside the label: the field's type, or the function's signature. */
  detail: string;
  /** Longer help for the highlighted row. */
  info: string;
  category?: FunctionDoc['category'];
}

export interface CompletionResult {
  /** The typed text to replace runs from here to `to`. */
  from: number;
  to: number;
  options: CompletionOption[];
}

const MAX_OPTIONS = 40;

function rank<T>(items: T[], nameOf: (item: T) => string, query: string): T[] {
  const q = query.toLowerCase();
  if (q === '') return items.slice();
  const starts: T[] = [];
  const contains: T[] = [];
  for (const item of items) {
    const n = nameOf(item).toLowerCase();
    if (n.startsWith(q)) starts.push(item);
    else if (n.includes(q)) contains.push(item);
  }
  // The closest match first: among names that start with what was typed, the shortest (CONCAT before CONCATENATE).
  const byLength = (a: T, b: T) => nameOf(a).length - nameOf(b).length;
  return [...starts.sort(byLength), ...contains];
}

function fieldOption(field: FieldChoice, insert: string): CompletionOption {
  return {
    label: field.name,
    insert,
    kind: 'field',
    detail: field.type ?? 'Field',
    info: `The value of the field "${field.name}" in this row.`,
  };
}

function functionOption(doc: FunctionDoc): CompletionOption {
  return {
    label: doc.name,
    insert: `${doc.name}(`,
    kind: 'function',
    detail: doc.signature,
    info: `${doc.description} Example: ${doc.example}`,
    category: doc.category,
  };
}

/**
 * What autocomplete should offer at the cursor, or null for nothing. After "{" it lists fields (and fills in
 * the closing brace); while typing a word it lists functions; when asked outright (Ctrl+Space) with nothing
 * typed it lists both. Never offers anything inside quotes.
 */
export function completionAt(text: string, pos: number, fields: readonly FieldChoice[], explicit = false): CompletionResult | null {
  const tokens = scanFormula(text.slice(0, pos));
  const last = tokens[tokens.length - 1];

  if (last && last.kind === 'field' && last.closed === false) {
    const query = text.slice(last.from + 1, pos);
    const options = rank([...fields], (f) => f.name, query).slice(0, MAX_OPTIONS);
    // When the cursor is inside a field name that already has its closing brace ("{To|tal Cost}"), the rest of
    // that name and the brace are replaced too, so accepting a field never leaves "{Total Cost}tal Cost}".
    const rest = text.slice(pos).match(/^[^{}]*\}/);
    return {
      from: last.from + 1,
      to: rest ? pos + rest[0].length : pos,
      options: options.map((f) => fieldOption(f, `${f.name}}`)),
    };
  }

  if (last && last.kind === 'string' && last.closed === false) return null;

  if (last && last.kind === 'name' && last.to === pos) {
    const options = rank([...FUNCTION_DOCS], (d) => d.name, last.text).slice(0, MAX_OPTIONS);
    if (options.length === 0) return null;
    return { from: last.from, to: pos, options: options.map(functionOption) };
  }

  if (explicit) {
    const fieldOptions = fields.slice(0, MAX_OPTIONS).map((f) => fieldOption(f, `{${f.name}}`));
    const functionOptions = FUNCTION_DOCS.map(functionOption);
    return { from: pos, to: pos, options: [...fieldOptions, ...functionOptions].slice(0, MAX_OPTIONS * 2) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export interface FormulaDiagnostic {
  from: number;
  to: number;
  severity: 'error' | 'warning';
  message: string;
  /** A parse error stops the formula being saved; the rest are advice. */
  blocking: boolean;
}

/** How many characters of the start of the text the parser skips (spaces and a leading "="). */
function parserOffset(text: string): number {
  let offset = text.length - text.trimStart().length;
  const rest = text.trimStart();
  if (rest.startsWith('=')) {
    offset += 1;
    const after = rest.slice(1);
    offset += after.length - after.trimStart().length;
  }
  return offset;
}

function friendlyParseMessage(raw: string): string {
  if (/Unterminated field reference/.test(raw)) return 'This { has no closing }.';
  if (/Unterminated string/.test(raw)) return 'This quote is never closed.';
  if (/Expected RPAREN/.test(raw)) return 'A closing parenthesis ) is missing.';
  const char = raw.match(/Unexpected character '(.)'/);
  if (char) return `"${char[1]}" cannot be used in a formula.`;
  const token = raw.match(/Unexpected token '(.*?)' at position/);
  if (token) return token[1] === '' ? 'The formula ends too soon: something is missing.' : `Unexpected "${token[1]}" here.`;
  return raw;
}

/**
 * Everything wrong with a formula, each with the exact place: parse errors (blocking), unknown function names
 * (blocking, since they would fail for every row) and, when the fields are given, references to fields that do
 * not exist (advice only).
 */
export function diagnoseFormula(text: string, fields?: readonly FieldChoice[]): FormulaDiagnostic[] {
  if (text.trim() === '') return [];
  const out: FormulaDiagnostic[] = [];
  const tokens = scanFormula(text);
  const offset = parserOffset(text);

  try {
    parseFormula(text);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const at = raw.match(/at position (\d+)/);
    const position = at ? offset + Number(at[1]) : text.length;
    let from = Math.min(position, Math.max(0, text.length - 1));
    let to = Math.min(text.length, from + 1);
    let message = friendlyParseMessage(raw);

    if (/Expected LPAREN/.test(raw)) {
      // A bare word where a field was meant: point at the word and say how to fix it.
      const word = [...tokens].reverse().find((t) => t.kind === 'name' && t.to <= position);
      if (word) {
        from = word.from;
        to = word.to;
        message = `"${word.text}" is not a function. To use a field, write it in braces: {${word.text}}.`;
      }
    } else if (/Unterminated (field reference|string)/.test(raw)) {
      to = text.length;
    }
    out.push({ from, to: Math.max(to, from + 1), severity: 'error', message, blocking: true });
  }

  for (const t of tokens) {
    if (t.kind === 'function' && !functionDoc(t.text)) {
      out.push({ from: t.from, to: t.to, severity: 'error', message: `There is no function called ${t.text.toUpperCase()}.`, blocking: true });
    }
  }

  if (fields) {
    const known = new Set(fields.map((f) => f.name));
    for (const t of tokens) {
      if (t.kind === 'field' && t.closed !== false && !known.has(fieldNameOf(t))) {
        out.push({ from: t.from, to: t.to, severity: 'warning', message: `There is no field called "${fieldNameOf(t)}".`, blocking: false });
      }
    }
  }

  // The same place can be reported twice (a bad word is both a parse error and an unknown function): keep the first.
  const seen = new Set<string>();
  return out.filter((d) => {
    const key = `${d.from}:${d.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** True when the formula has an error that should stop it being saved. */
export function hasBlockingError(diagnostics: readonly FormulaDiagnostic[]): boolean {
  return diagnostics.some((d) => d.blocking);
}

// ---------------------------------------------------------------------------
// Renaming a field
// ---------------------------------------------------------------------------

/**
 * Which formula fields need their text changed when a field is renamed, with their new options. Only formula
 * fields whose text really refers to the old name are returned. The text is kept under `expression` or
 * `formula` (older fields use one, newer the other); whichever hold the old name are rewritten.
 */
export function formulaRenameChanges(
  fields: ReadonlyArray<{ id: string; ui_type: string; options?: Record<string, any> | null }>,
  oldName: string,
  newName: string,
): Array<{ id: string; options: Record<string, any> }> {
  const out: Array<{ id: string; options: Record<string, any> }> = [];
  for (const field of fields) {
    if (field.ui_type !== 'Formula' || !field.options) continue;
    const next: Record<string, any> = { ...field.options };
    let changed = false;
    for (const key of ['expression', 'formula']) {
      const text = field.options[key];
      if (typeof text !== 'string') continue;
      const renamed = renameFieldInFormula(text, oldName, newName);
      if (renamed !== text) {
        next[key] = renamed;
        changed = true;
      }
    }
    if (changed) out.push({ id: field.id, options: next });
  }
  return out;
}

/** True when a field name can be written in a formula (it cannot contain a closing brace). */
export function canReferenceField(name: string): boolean {
  return name.length > 0 && !name.includes('}');
}

/**
 * The formula with every reference to a field renamed. It works on the scanned pieces, not with a search and
 * replace, so a similar name ("Price" inside "Price Total") and the same words inside quotes are left alone.
 * Names match exactly, as they do when the formula is worked out.
 */
export function renameFieldInFormula(text: string, oldName: string, newName: string): string {
  if (oldName === newName || !canReferenceField(newName)) return text;
  let out = '';
  let cursor = 0;
  for (const t of scanFormula(text)) {
    if (t.kind === 'field' && t.closed !== false && fieldNameOf(t) === oldName) {
      out += text.slice(cursor, t.from) + `{${newName}}`;
      cursor = t.to;
    }
  }
  return out + text.slice(cursor);
}
