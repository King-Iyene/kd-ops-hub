// A small, safe Airtable-style formula engine for Formula fields.
// No eval()/Function() — hand-rolled tokenizer + recursive-descent
// parser + tree-walking evaluator over a fixed function whitelist.
//
// Syntax supported: {Field Name} references, numbers, 'strings'/"strings",
// + - * / (arithmetic), & (string concat), comparisons = <> < <= > >=,
// parentheses, and functions: IF, AND, OR, NOT, SUM, MIN, MAX, ROUND, ABS,
// LEN, UPPER, LOWER, TRIM, CONCATENATE, TODAY, NOW, BLANK.

export type FormulaValue = string | number | boolean | null;

type TokenType = 'number' | 'string' | 'field' | 'ident' | 'op' | 'lparen' | 'rparen' | 'comma' | 'eof';
interface Token { type: TokenType; value: string; }

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '{') {
      const end = src.indexOf('}', i);
      if (end === -1) throw new Error('Unclosed { in formula');
      tokens.push({ type: 'field', value: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let out = '';
      while (j < n && src[j] !== quote) {
        if (src[j] === '\\' && j + 1 < n) { out += src[j + 1]; j += 2; continue; }
        out += src[j]; j++;
      }
      tokens.push({ type: 'string', value: out });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i;
      while (j < n && /[0-9.]/.test(src[j])) j++;
      tokens.push({ type: 'number', value: src.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      tokens.push({ type: 'ident', value: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === '<' && src[i + 1] === '>') { tokens.push({ type: 'op', value: '<>' }); i += 2; continue; }
    if (c === '<' && src[i + 1] === '=') { tokens.push({ type: 'op', value: '<=' }); i += 2; continue; }
    if (c === '>' && src[i + 1] === '=') { tokens.push({ type: 'op', value: '>=' }); i += 2; continue; }
    if (c === '!' && src[i + 1] === '=') { tokens.push({ type: 'op', value: '<>' }); i += 2; continue; }
    if ('+-*/&=<>'.includes(c)) { tokens.push({ type: 'op', value: c }); i++; continue; }
    if (c === '(') { tokens.push({ type: 'lparen', value: c }); i++; continue; }
    if (c === ')') { tokens.push({ type: 'rparen', value: c }); i++; continue; }
    if (c === ',') { tokens.push({ type: 'comma', value: c }); i++; continue; }
    throw new Error(`Unexpected character "${c}" in formula`);
  }
  tokens.push({ type: 'eof', value: '' });
  return tokens;
}

type Node =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'field'; name: string }
  | { kind: 'call'; name: string; args: Node[] }
  | { kind: 'binop'; op: string; left: Node; right: Node }
  | { kind: 'unary'; op: string; arg: Node };

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}
  private peek() { return this.tokens[this.pos]; }
  private next() { return this.tokens[this.pos++]; }
  private expect(type: TokenType) {
    const t = this.next();
    if (t.type !== type) throw new Error(`Expected ${type} but got "${t.value}"`);
    return t;
  }

  parse(): Node {
    const node = this.parseComparison();
    this.expect('eof');
    return node;
  }

  private parseComparison(): Node {
    let left = this.parseAdditive();
    while (this.peek().type === 'op' && ['=', '<>', '<', '<=', '>', '>='].includes(this.peek().value)) {
      const op = this.next().value;
      const right = this.parseAdditive();
      left = { kind: 'binop', op, left, right };
    }
    return left;
  }

  private parseAdditive(): Node {
    let left = this.parseMultiplicative();
    while (this.peek().type === 'op' && ['+', '-', '&'].includes(this.peek().value)) {
      const op = this.next().value;
      const right = this.parseMultiplicative();
      left = { kind: 'binop', op, left, right };
    }
    return left;
  }

  private parseMultiplicative(): Node {
    let left = this.parseUnary();
    while (this.peek().type === 'op' && ['*', '/'].includes(this.peek().value)) {
      const op = this.next().value;
      const right = this.parseUnary();
      left = { kind: 'binop', op, left, right };
    }
    return left;
  }

  private parseUnary(): Node {
    if (this.peek().type === 'op' && this.peek().value === '-') {
      this.next();
      return { kind: 'unary', op: '-', arg: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Node {
    const t = this.peek();
    if (t.type === 'number') { this.next(); return { kind: 'num', value: parseFloat(t.value) }; }
    if (t.type === 'string') { this.next(); return { kind: 'str', value: t.value }; }
    if (t.type === 'field') { this.next(); return { kind: 'field', name: t.value }; }
    if (t.type === 'lparen') {
      this.next();
      const node = this.parseComparison();
      this.expect('rparen');
      return node;
    }
    if (t.type === 'ident') {
      this.next();
      this.expect('lparen');
      const args: Node[] = [];
      if (this.peek().type !== 'rparen') {
        args.push(this.parseComparison());
        while (this.peek().type === 'comma') { this.next(); args.push(this.parseComparison()); }
      }
      this.expect('rparen');
      return { kind: 'call', name: t.value.toUpperCase(), args };
    }
    throw new Error(`Unexpected token "${t.value}" in formula`);
  }
}

function toNum(v: FormulaValue): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === null || v === undefined) return 0;
  const n = parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

function toStr(v: FormulaValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? '1' : '0';
  return String(v);
}

function isTruthy(v: FormulaValue): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (v === null || v === undefined) return false;
  return String(v).length > 0;
}

const FUNCTIONS: Record<string, (args: FormulaValue[]) => FormulaValue> = {
  IF: (a) => (isTruthy(a[0]) ? a[1] ?? null : a[2] ?? null),
  AND: (a) => a.every(isTruthy),
  OR: (a) => a.some(isTruthy),
  NOT: (a) => !isTruthy(a[0]),
  SUM: (a) => a.reduce((acc, v) => acc + toNum(v), 0),
  MIN: (a) => Math.min(...a.map(toNum)),
  MAX: (a) => Math.max(...a.map(toNum)),
  ROUND: (a) => {
    const digits = a[1] !== undefined ? toNum(a[1]) : 0;
    const factor = Math.pow(10, digits);
    return Math.round(toNum(a[0]) * factor) / factor;
  },
  ABS: (a) => Math.abs(toNum(a[0])),
  LEN: (a) => toStr(a[0]).length,
  UPPER: (a) => toStr(a[0]).toUpperCase(),
  LOWER: (a) => toStr(a[0]).toLowerCase(),
  TRIM: (a) => toStr(a[0]).trim(),
  CONCATENATE: (a) => a.map(toStr).join(''),
  TODAY: () => new Date().toISOString().slice(0, 10),
  NOW: () => new Date().toISOString(),
  BLANK: () => null,
};

function evaluate(node: Node, fields: Record<string, FormulaValue>): FormulaValue {
  switch (node.kind) {
    case 'num': return node.value;
    case 'str': return node.value;
    case 'field': return fields[node.name] ?? null;
    case 'unary': {
      const v = evaluate(node.arg, fields);
      return node.op === '-' ? -toNum(v) : v;
    }
    case 'call': {
      const fn = FUNCTIONS[node.name];
      if (!fn) throw new Error(`Unknown function ${node.name}()`);
      return fn(node.args.map((a) => evaluate(a, fields)));
    }
    case 'binop': {
      const l = evaluate(node.left, fields);
      const r = evaluate(node.right, fields);
      switch (node.op) {
        case '+': return toNum(l) + toNum(r);
        case '-': return toNum(l) - toNum(r);
        case '*': return toNum(l) * toNum(r);
        case '/': return toNum(r) === 0 ? null : toNum(l) / toNum(r);
        case '&': return toStr(l) + toStr(r);
        case '=': return toStr(l) === toStr(r);
        case '<>': return toStr(l) !== toStr(r);
        case '<': return toNum(l) < toNum(r);
        case '<=': return toNum(l) <= toNum(r);
        case '>': return toNum(l) > toNum(r);
        case '>=': return toNum(l) >= toNum(r);
        default: throw new Error(`Unknown operator ${node.op}`);
      }
    }
  }
}

/** Parses and evaluates a formula. `fields` maps field NAME -> resolved
 *  display value (already flattened to string/number/boolean/null). Never
 *  throws to the caller — returns an error string instead, since this
 *  runs live as an admin types the formula or a record's data changes. */
export function evaluateFormula(expression: string, fields: Record<string, FormulaValue>): FormulaValue | { error: string } {
  if (!expression.trim()) return null;
  try {
    const tokens = tokenize(expression);
    const ast = new Parser(tokens).parse();
    return evaluate(ast, fields);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Invalid formula' };
  }
}

export function isFormulaError(v: unknown): v is { error: string } {
  return typeof v === 'object' && v !== null && 'error' in v;
}
