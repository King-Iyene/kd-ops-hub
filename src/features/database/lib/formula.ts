// ─── Token types ───────────────────────────────────────────────────────────

type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'BOOLEAN'
  | 'FIELD_REF'
  | 'IDENT'
  | 'OP'
  | 'COMP'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

// ─── AST node types ────────────────────────────────────────────────────────

export type ASTNode =
  | { type: 'NumberLiteral'; value: number }
  | { type: 'StringLiteral'; value: string }
  | { type: 'BooleanLiteral'; value: boolean }
  | { type: 'FieldRef'; name: string }
  | { type: 'BinaryOp'; op: string; left: ASTNode; right: ASTNode }
  | { type: 'UnaryOp'; op: string; operand: ASTNode }
  | { type: 'FunctionCall'; name: string; args: ASTNode[] };

// ─── Tokenizer ─────────────────────────────────────────────────────────────

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = expr.length;

  while (i < len) {
    const ch = expr[i];

    // whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // field reference {FieldName}
    if (ch === '{') {
      const start = i;
      i++;
      let name = '';
      while (i < len && expr[i] !== '}') {
        name += expr[i];
        i++;
      }
      if (i >= len) throw new Error(`Unterminated field reference at position ${start}`);
      i++; // skip }
      tokens.push({ type: 'FIELD_REF', value: name, pos: start });
      continue;
    }

    // string literal "..."
    if (ch === '"') {
      const start = i;
      i++;
      let s = '';
      while (i < len && expr[i] !== '"') {
        if (expr[i] === '\\' && i + 1 < len) {
          i++;
          s += expr[i];
        } else {
          s += expr[i];
        }
        i++;
      }
      if (i >= len) throw new Error(`Unterminated string at position ${start}`);
      i++; // skip closing "
      tokens.push({ type: 'STRING', value: s, pos: start });
      continue;
    }

    // number
    if (/\d/.test(ch) || (ch === '.' && i + 1 < len && /\d/.test(expr[i + 1]))) {
      const start = i;
      let num = '';
      while (i < len && /[\d.]/.test(expr[i])) {
        num += expr[i];
        i++;
      }
      tokens.push({ type: 'NUMBER', value: num, pos: start });
      continue;
    }

    // comparison operators (must check before single-char ops)
    if (ch === '!' && i + 1 < len && expr[i + 1] === '=') {
      tokens.push({ type: 'COMP', value: '!=', pos: i });
      i += 2;
      continue;
    }
    if (ch === '<' && i + 1 < len && expr[i + 1] === '=') {
      tokens.push({ type: 'COMP', value: '<=', pos: i });
      i += 2;
      continue;
    }
    if (ch === '>' && i + 1 < len && expr[i + 1] === '=') {
      tokens.push({ type: 'COMP', value: '>=', pos: i });
      i += 2;
      continue;
    }
    if (ch === '<') {
      tokens.push({ type: 'COMP', value: '<', pos: i });
      i++;
      continue;
    }
    if (ch === '>') {
      tokens.push({ type: 'COMP', value: '>', pos: i });
      i++;
      continue;
    }
    if (ch === '=') {
      tokens.push({ type: 'COMP', value: '=', pos: i });
      i++;
      continue;
    }

    // operators
    if ('+-*/%^&'.includes(ch)) {
      tokens.push({ type: 'OP', value: ch, pos: i });
      i++;
      continue;
    }

    // parens
    if (ch === '(') {
      tokens.push({ type: 'LPAREN', value: '(', pos: i });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: ')', pos: i });
      i++;
      continue;
    }

    // comma
    if (ch === ',') {
      tokens.push({ type: 'COMMA', value: ',', pos: i });
      i++;
      continue;
    }

    // identifier / boolean / function name
    if (/[a-zA-Z_]/.test(ch)) {
      const start = i;
      let ident = '';
      while (i < len && /[a-zA-Z0-9_]/.test(expr[i])) {
        ident += expr[i];
        i++;
      }
      const upper = ident.toUpperCase();
      if (upper === 'TRUE' || upper === 'FALSE') {
        tokens.push({ type: 'BOOLEAN', value: upper, pos: start });
      } else {
        tokens.push({ type: 'IDENT', value: ident, pos: start });
      }
      continue;
    }

    throw new Error(`Unexpected character '${ch}' at position ${i}`);
  }

  tokens.push({ type: 'EOF', value: '', pos: i });
  return tokens;
}

// ─── Parser (recursive descent) ────────────────────────────────────────────

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: TokenType): Token {
    const t = this.peek();
    if (t.type !== type) {
      throw new Error(`Expected ${type} but got ${t.type} ('${t.value}') at position ${t.pos}`);
    }
    return this.advance();
  }

  parse(): ASTNode {
    const node = this.parseExpression();
    if (this.peek().type !== 'EOF') {
      throw new Error(`Unexpected token '${this.peek().value}' at position ${this.peek().pos}`);
    }
    return node;
  }

  // expression → comparison
  private parseExpression(): ASTNode {
    return this.parseComparison();
  }

  // comparison → concat (( '=' | '!=' | '<' | '>' | '<=' | '>=' ) concat)*
  private parseComparison(): ASTNode {
    let left = this.parseConcat();
    while (this.peek().type === 'COMP') {
      const op = this.advance().value;
      const right = this.parseConcat();
      left = { type: 'BinaryOp', op, left, right };
    }
    return left;
  }

  // concat → addition ( '&' addition )*
  private parseConcat(): ASTNode {
    let left = this.parseAddition();
    while (this.peek().type === 'OP' && this.peek().value === '&') {
      this.advance();
      const right = this.parseAddition();
      left = { type: 'BinaryOp', op: '&', left, right };
    }
    return left;
  }

  // addition → multiplication (( '+' | '-' ) multiplication)*
  private parseAddition(): ASTNode {
    let left = this.parseMultiplication();
    while (this.peek().type === 'OP' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.advance().value;
      const right = this.parseMultiplication();
      left = { type: 'BinaryOp', op, left, right };
    }
    return left;
  }

  // multiplication → power (( '*' | '/' | '%' ) power)*
  private parseMultiplication(): ASTNode {
    let left = this.parsePower();
    while (this.peek().type === 'OP' && ('*/%'.includes(this.peek().value))) {
      const op = this.advance().value;
      const right = this.parsePower();
      left = { type: 'BinaryOp', op, left, right };
    }
    return left;
  }

  // power → unary ( '^' unary )*
  private parsePower(): ASTNode {
    let left = this.parseUnary();
    while (this.peek().type === 'OP' && this.peek().value === '^') {
      this.advance();
      const right = this.parseUnary();
      left = { type: 'BinaryOp', op: '^', left, right };
    }
    return left;
  }

  // unary → '-' unary | primary
  private parseUnary(): ASTNode {
    if (this.peek().type === 'OP' && this.peek().value === '-') {
      this.advance();
      const operand = this.parseUnary();
      return { type: 'UnaryOp', op: '-', operand };
    }
    return this.parsePrimary();
  }

  // primary → NUMBER | STRING | BOOLEAN | FIELD_REF | functionCall | '(' expression ')'
  private parsePrimary(): ASTNode {
    const t = this.peek();

    if (t.type === 'NUMBER') {
      this.advance();
      return { type: 'NumberLiteral', value: parseFloat(t.value) };
    }

    if (t.type === 'STRING') {
      this.advance();
      return { type: 'StringLiteral', value: t.value };
    }

    if (t.type === 'BOOLEAN') {
      this.advance();
      return { type: 'BooleanLiteral', value: t.value === 'TRUE' };
    }

    if (t.type === 'FIELD_REF') {
      this.advance();
      return { type: 'FieldRef', name: t.value };
    }

    if (t.type === 'IDENT') {
      // function call
      const name = this.advance().value;
      this.expect('LPAREN');
      const args: ASTNode[] = [];
      if (this.peek().type !== 'RPAREN') {
        args.push(this.parseExpression());
        while (this.peek().type === 'COMMA') {
          this.advance();
          args.push(this.parseExpression());
        }
      }
      this.expect('RPAREN');
      return { type: 'FunctionCall', name: name.toUpperCase(), args };
    }

    if (t.type === 'LPAREN') {
      this.advance();
      const node = this.parseExpression();
      this.expect('RPAREN');
      return node;
    }

    throw new Error(`Unexpected token '${t.value}' at position ${t.pos}`);
  }
}

// ─── Evaluator ─────────────────────────────────────────────────────────────

type FieldMap = Record<string, string>;

function toNumber(v: any): number {
  if (v == null) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function toString(v: any): string {
  if (v == null) return '';
  return String(v);
}

function toBoolean(v: any): boolean {
  if (v == null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.length > 0;
  return true;
}

function isBlank(v: any): boolean {
  return v == null || v === '' || (typeof v === 'string' && v.trim() === '');
}

const BUILTIN_FUNCTIONS: Record<string, (args: any[]) => any> = {
  // Math
  ABS: ([a]) => Math.abs(toNumber(a)),
  CEIL: ([a]) => Math.ceil(toNumber(a)),
  FLOOR: ([a]) => Math.floor(toNumber(a)),
  ROUND: ([a, d]) => {
    const num = toNumber(a);
    const digits = d != null ? toNumber(d) : 0;
    const factor = Math.pow(10, digits);
    return Math.round(num * factor) / factor;
  },
  SQRT: ([a]) => Math.sqrt(toNumber(a)),
  POWER: ([a, b]) => Math.pow(toNumber(a), toNumber(b)),
  MOD: ([a, b]) => toNumber(a) % toNumber(b),
  MIN: (args) => Math.min(...args.map(toNumber)),
  MAX: (args) => Math.max(...args.map(toNumber)),
  LOG: ([a, b]) => {
    const val = toNumber(a);
    if (b != null) return Math.log(toNumber(val)) / Math.log(toNumber(b));
    return Math.log(val);
  },
  EXP: ([a]) => Math.exp(toNumber(a)),

  // String
  CONCAT: (args) => args.map(toString).join(''),
  LEFT: ([s, n]) => toString(s).slice(0, toNumber(n)),
  RIGHT: ([s, n]) => { const str = toString(s); return str.slice(Math.max(0, str.length - toNumber(n))); },
  MID: ([s, start, len]) => toString(s).slice(toNumber(start) - 1, toNumber(start) - 1 + toNumber(len)),
  LEN: ([s]) => toString(s).length,
  TRIM: ([s]) => toString(s).trim(),
  UPPER: ([s]) => toString(s).toUpperCase(),
  LOWER: ([s]) => toString(s).toLowerCase(),
  REPLACE: ([s, start, len, replacement]) =>
    toString(s).slice(0, toNumber(start) - 1) + toString(replacement) + toString(s).slice(toNumber(start) - 1 + toNumber(len)),
  SEARCH: ([find, s, startPos]) => {
    const str = toString(s).toLowerCase();
    const needle = toString(find).toLowerCase();
    const from = startPos != null ? toNumber(startPos) - 1 : 0;
    const idx = str.indexOf(needle, from);
    return idx === -1 ? 0 : idx + 1;
  },
  SUBSTITUTE: ([s, old, replacement, occurrence]) => {
    const str = toString(s);
    const oldStr = toString(old);
    const newStr = toString(replacement);
    if (!oldStr) return str;
    if (occurrence != null) {
      let count = 0;
      const target = toNumber(occurrence);
      return str.replace(new RegExp(oldStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), (match) => {
        count++;
        return count === target ? newStr : match;
      });
    }
    return str.split(oldStr).join(newStr);
  },
  REPEAT: ([s, n]) => toString(s).repeat(Math.max(0, Math.floor(toNumber(n)))),

  // Logical
  IF: ([cond, thenVal, elseVal]) => toBoolean(cond) ? thenVal : (elseVal ?? ''),
  AND: (args) => args.every(toBoolean),
  OR: (args) => args.some(toBoolean),
  NOT: ([a]) => !toBoolean(a),
  SWITCH: (args) => {
    if (args.length < 2) return '';
    const expr = args[0];
    for (let i = 1; i + 1 < args.length; i += 2) {
      if (expr === args[i] || (toNumber(expr) === toNumber(args[i]) && typeof expr === typeof args[i])) {
        return args[i + 1];
      }
    }
    // default value if odd number of remaining args
    return args.length % 2 === 0 ? args[args.length - 1] : '';
  },
  ISBLANK: ([a]) => isBlank(a),
  ISERROR: ([a]) => {
    // In our context, check for NaN or error states
    if (a == null) return false;
    if (typeof a === 'number') return isNaN(a) || !isFinite(a);
    return false;
  },

  // Date
  NOW: () => new Date().toISOString(),
  TODAY: () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
  DATEADD: ([date, amount, unit]) => {
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    const n = toNumber(amount);
    const u = toString(unit).toLowerCase();
    if (u === 'days' || u === 'day') d.setDate(d.getDate() + n);
    else if (u === 'months' || u === 'month') d.setMonth(d.getMonth() + n);
    else if (u === 'years' || u === 'year') d.setFullYear(d.getFullYear() + n);
    else if (u === 'hours' || u === 'hour') d.setHours(d.getHours() + n);
    else if (u === 'minutes' || u === 'minute') d.setMinutes(d.getMinutes() + n);
    return d.toISOString();
  },
  DATEDIFF: ([d1, d2, unit]) => {
    const a = new Date(d1);
    const b = new Date(d2);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
    const diffMs = b.getTime() - a.getTime();
    const u = toString(unit).toLowerCase();
    if (u === 'days' || u === 'day') return Math.floor(diffMs / 86400000);
    if (u === 'hours' || u === 'hour') return Math.floor(diffMs / 3600000);
    if (u === 'minutes' || u === 'minute') return Math.floor(diffMs / 60000);
    if (u === 'months' || u === 'month') return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (u === 'years' || u === 'year') return b.getFullYear() - a.getFullYear();
    return Math.floor(diffMs / 86400000);
  },
  YEAR: ([d]) => { const dt = new Date(d); return isNaN(dt.getTime()) ? null : dt.getFullYear(); },
  MONTH: ([d]) => { const dt = new Date(d); return isNaN(dt.getTime()) ? null : dt.getMonth() + 1; },
  DAY: ([d]) => { const dt = new Date(d); return isNaN(dt.getTime()) ? null : dt.getDate(); },
  WEEKDAY: ([d]) => { const dt = new Date(d); return isNaN(dt.getTime()) ? null : dt.getDay(); },

  // Aggregate-like
  COUNTA: (args) => args.filter((a) => !isBlank(a)).length,
  COUNTBLANK: (args) => args.filter((a) => isBlank(a)).length,
};

function evaluate(node: ASTNode, record: Record<string, any>, fieldMap: FieldMap): any {
  switch (node.type) {
    case 'NumberLiteral':
      return node.value;
    case 'StringLiteral':
      return node.value;
    case 'BooleanLiteral':
      return node.value;
    case 'FieldRef': {
      const col = fieldMap[node.name];
      if (col == null) return null;
      return record[col] ?? null;
    }
    case 'UnaryOp':
      if (node.op === '-') return -toNumber(evaluate(node.operand, record, fieldMap));
      return evaluate(node.operand, record, fieldMap);
    case 'BinaryOp': {
      const left = evaluate(node.left, record, fieldMap);
      const right = evaluate(node.right, record, fieldMap);
      switch (node.op) {
        case '+': return toNumber(left) + toNumber(right);
        case '-': return toNumber(left) - toNumber(right);
        case '*': return toNumber(left) * toNumber(right);
        case '/': {
          const d = toNumber(right);
          return d === 0 ? null : toNumber(left) / d;
        }
        case '%': return toNumber(left) % toNumber(right);
        case '^': return Math.pow(toNumber(left), toNumber(right));
        case '&': return toString(left) + toString(right);
        case '=': return left === right;
        case '!=': return left !== right;
        case '<': return toNumber(left) < toNumber(right);
        case '>': return toNumber(left) > toNumber(right);
        case '<=': return toNumber(left) <= toNumber(right);
        case '>=': return toNumber(left) >= toNumber(right);
        default: return null;
      }
    }
    case 'FunctionCall': {
      const fn = BUILTIN_FUNCTIONS[node.name];
      if (!fn) throw new Error(`Unknown function: ${node.name}`);
      const args = node.args.map((a) => evaluate(a, record, fieldMap));
      return fn(args);
    }
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export function parseFormula(expression: string): ASTNode {
  const tokens = tokenize(expression);
  const parser = new Parser(tokens);
  return parser.parse();
}

export function evaluateFormula(
  ast: ASTNode,
  record: Record<string, any>,
  fieldMap: Record<string, string>,
): any {
  return evaluate(ast, record, fieldMap);
}

export function validateFormula(expression: string): { valid: boolean; error?: string } {
  if (!expression || !expression.trim()) {
    return { valid: false, error: 'Formula expression is empty' };
  }
  try {
    parseFormula(expression);
    return { valid: true };
  } catch (e: any) {
    return { valid: false, error: e?.message ?? 'Invalid formula' };
  }
}

/** List of supported function names for UI hints */
export const FORMULA_FUNCTIONS = Object.keys(BUILTIN_FUNCTIONS);
