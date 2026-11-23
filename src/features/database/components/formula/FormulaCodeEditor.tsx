import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Compartment, EditorState, StateField, type Extension, type Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  WidgetType,
  keymap,
  placeholder,
  showTooltip,
  type DecorationSet,
  type Tooltip,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
  acceptCompletion,
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  type Completion,
  type CompletionContext,
} from '@codemirror/autocomplete';
import { bracketMatching } from '@codemirror/language';
import { linter } from '@codemirror/lint';
import { functionDoc } from '../../lib/formulaDocs';
import {
  activeArgument,
  completionAt,
  diagnoseFormula,
  fieldNameOf,
  highlightedArgument,
  scanFormula,
  signatureParts,
  type FieldChoice,
  type FormulaDiagnostic,
} from '../../lib/formulaEditorSupport';

/**
 * The formula editor: CodeMirror 6 with the formula's own pieces drawn on top of unchanged text.
 * Fields are coloured (or drawn as chips), functions and numbers and text each have a colour, typing "{" or a
 * letter opens suggestions, a hint shows the current argument inside a call, and mistakes are underlined with
 * the reason. All the decisions live in lib/formulaEditorSupport.ts (tested without a browser); this file only
 * connects them to the editor. Loaded on demand, so the editor library costs nothing until a formula is opened.
 */

export interface FormulaCodeEditorHandle {
  /** Put text at the cursor (replacing any selection) and keep the editor focused. */
  insert: (text: string) => void;
  focus: () => void;
}

export interface FormulaCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Every field in the table: a reference to one of these is never reported as missing. */
  fields: FieldChoice[];
  /** The fields offered in autocomplete (those a formula can actually read). Defaults to all of `fields`. */
  suggestable?: FieldChoice[];
  /** Draw field references as chips. When false they are coloured text, which is the safer choice on phones. */
  pills: boolean;
  placeholderText?: string;
  ariaLabel?: string;
  onDiagnostics?: (diagnostics: FormulaDiagnostic[]) => void;
}

// ── Chips ──────────────────────────────────────────────────────────────

class FieldPillWidget extends WidgetType {
  constructor(
    private readonly name: string,
    private readonly known: boolean,
  ) {
    super();
  }

  eq(other: FieldPillWidget): boolean {
    return other.name === this.name && other.known === this.known;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = this.known ? 'cm-fx-pill' : 'cm-fx-pill cm-fx-pill-unknown';
    span.textContent = this.name;
    span.setAttribute('aria-label', `field ${this.name}${this.known ? '' : ' (not found)'}`);
    return span;
  }

  // false: a click on the chip places the cursor beside it instead of being swallowed.
  ignoreEvent(): boolean {
    return false;
  }
}

interface Display {
  all: DecorationSet;
  /** Only the chips: these are skipped over by the cursor and removed whole by Backspace. */
  atoms: DecorationSet;
}

function buildDisplay(text: string, pills: boolean, known: ReadonlySet<string>): Display {
  const all: Range<Decoration>[] = [];
  const atoms: Range<Decoration>[] = [];
  for (const t of scanFormula(text)) {
    if (t.kind === 'field') {
      const name = fieldNameOf(t);
      const isKnown = known.has(name);
      if (pills && t.closed !== false) {
        const deco = Decoration.replace({ widget: new FieldPillWidget(name, isKnown) }).range(t.from, t.to);
        all.push(deco);
        atoms.push(deco);
      } else {
        all.push(Decoration.mark({ class: isKnown && t.closed !== false ? 'cm-fx-field' : 'cm-fx-field cm-fx-unknown' }).range(t.from, t.to));
      }
    } else if (t.kind === 'function') {
      all.push(Decoration.mark({ class: 'cm-fx-function' }).range(t.from, t.to));
    } else if (t.kind === 'number') {
      all.push(Decoration.mark({ class: 'cm-fx-number' }).range(t.from, t.to));
    } else if (t.kind === 'string') {
      all.push(Decoration.mark({ class: 'cm-fx-string' }).range(t.from, t.to));
    } else if (t.kind === 'operator') {
      all.push(Decoration.mark({ class: 'cm-fx-operator' }).range(t.from, t.to));
    }
  }
  return { all: Decoration.set(all, true), atoms: Decoration.set(atoms, true) };
}

function fieldDisplay(pills: boolean, known: ReadonlySet<string>): Extension {
  const field = StateField.define<Display>({
    create: (state) => buildDisplay(state.doc.toString(), pills, known),
    update: (value, tr) => (tr.docChanged ? buildDisplay(tr.state.doc.toString(), pills, known) : value),
    provide: (f) => [
      EditorView.decorations.from(f, (v) => v.all),
      EditorView.atomicRanges.of((view) => view.state.field(f).atoms),
    ],
  });
  return field;
}

// ── Hint for the argument being typed ──────────────────────────────────

function hintDom(name: string, argIndex: number): HTMLElement | null {
  const doc = functionDoc(name);
  if (!doc) return null;
  const { args } = signatureParts(doc.signature);
  const active = highlightedArgument(args, argIndex);

  const root = document.createElement('div');
  root.className = 'cm-fx-hint';

  const signature = document.createElement('div');
  signature.className = 'cm-fx-hint-signature';
  signature.append(`${doc.name}(`);
  args.forEach((arg, i) => {
    if (i > 0) signature.append(', ');
    const part = document.createElement(i === active ? 'strong' : 'span');
    part.textContent = arg;
    signature.append(part);
  });
  signature.append(')');

  const description = document.createElement('div');
  description.className = 'cm-fx-hint-description';
  description.textContent = doc.description;

  const example = document.createElement('div');
  example.className = 'cm-fx-hint-example';
  example.textContent = `Example: ${doc.example}`;

  root.append(signature, description, example);
  return root;
}

const hintField = StateField.define<Tooltip | null>({
  create: (state) => hintFor(state),
  update: (value, tr) => (tr.docChanged || tr.selection ? hintFor(tr.state) : value),
  provide: (f) => showTooltip.from(f),
});

function hintFor(state: EditorState): Tooltip | null {
  const head = state.selection.main.head;
  const active = activeArgument(state.doc.toString(), head);
  if (!active) return null;
  const dom = hintDom(active.name, active.argIndex);
  if (!dom) return null;
  return { pos: head, above: true, strictSide: false, arrow: false, create: () => ({ dom }) };
}

// ── Autocomplete and errors, tied to the current fields ────────────────

function completionSource(fields: FieldChoice[]) {
  return (context: CompletionContext) => {
    const text = context.state.doc.toString();
    const result = completionAt(text, context.pos, fields, context.explicit);
    if (!result || result.options.length === 0) return null;
    return {
      from: result.from,
      to: result.to,
      // Already ranked by completionAt; do not let the editor filter or reorder them again.
      filter: false,
      options: result.options.map<Completion>((o) => ({
        label: o.label,
        detail: o.detail,
        info: o.info,
        type: o.kind === 'field' ? 'variable' : 'function',
        section: o.category,
        apply:
          o.kind === 'function'
            ? (view, _completion, from, to) => {
                // NAME() with the cursor between the brackets (unless a bracket is already there).
                const hasBracket = view.state.doc.sliceString(to, to + 1) === '(';
                const insert = hasBracket ? o.label : `${o.label}()`;
                view.dispatch({
                  changes: { from, to, insert },
                  selection: { anchor: from + o.label.length + 1 },
                  userEvent: 'input.complete',
                });
              }
            : o.insert,
      })),
    };
  };
}

function dynamicExtensions(
  fields: FieldChoice[],
  suggestable: FieldChoice[],
  pills: boolean,
  onDiagnostics: ((d: FormulaDiagnostic[]) => void) | undefined,
): Extension {
  // Every field in the table is "known" (no false warning for one that exists); only some are worth suggesting.
  const known = new Set(fields.map((f) => f.name));
  return [
    fieldDisplay(pills, known),
    autocompletion({
      override: [completionSource(suggestable)],
      activateOnTyping: true,
      icons: false,
      defaultKeymap: true,
      maxRenderedOptions: 40,
    }),
    linter(
      (view) => {
        const diagnostics = diagnoseFormula(view.state.doc.toString(), fields);
        onDiagnostics?.(diagnostics);
        return diagnostics.map((d) => ({ from: d.from, to: d.to, severity: d.severity, message: d.message }));
      },
      { delay: 300 },
    ),
  ];
}

// ── Look ───────────────────────────────────────────────────────────────

const POPUP = {
  backgroundColor: 'hsl(var(--popover))',
  color: 'hsl(var(--popover-foreground))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
};

const formulaTheme = EditorView.theme({
  '&': { fontSize: '13px', backgroundColor: 'transparent', color: 'hsl(var(--foreground))' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
    minHeight: '112px',
    maxHeight: '280px',
    overflow: 'auto',
  },
  '.cm-content': { padding: '8px 0', caretColor: 'hsl(var(--foreground))' },
  '.cm-line': { padding: '0 12px', lineHeight: '22px' },
  '.cm-placeholder': { color: 'hsl(var(--muted-foreground))' },
  '.cm-fx-function': { color: 'var(--fx-function)', fontWeight: '600' },
  '.cm-fx-field': { color: 'var(--fx-field)' },
  '.cm-fx-unknown': { textDecoration: 'underline wavy var(--fx-warning)', textUnderlineOffset: '3px' },
  '.cm-fx-number': { color: 'var(--fx-number)' },
  '.cm-fx-string': { color: 'var(--fx-string)' },
  '.cm-fx-operator': { color: 'hsl(var(--muted-foreground))' },
  '.cm-fx-pill': {
    display: 'inline-flex',
    alignItems: 'center',
    height: '20px',
    margin: '0 1px',
    padding: '0 6px',
    borderRadius: '4px',
    fontFamily: '-apple-system, system-ui, "Segoe UI", Roboto, sans-serif',
    fontSize: '12px',
    lineHeight: '16px',
    fontWeight: '500',
    verticalAlign: 'baseline',
    backgroundColor: 'var(--fx-pill-bg)',
    color: 'var(--fx-pill-text)',
    border: '1px solid var(--fx-pill-border)',
  },
  '.cm-fx-pill-unknown': {
    backgroundColor: 'var(--fx-pill-unknown-bg)',
    color: 'var(--fx-pill-unknown-text)',
    border: '1px solid var(--fx-pill-unknown-border)',
  },
  '.cm-matchingBracket': { backgroundColor: 'hsl(var(--primary) / 0.18)', outline: 'none' },
  '.cm-nonmatchingBracket': { backgroundColor: 'hsl(var(--destructive) / 0.2)' },
  '.cm-tooltip': { ...POPUP, overflow: 'hidden' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: 'inherit', maxHeight: '260px', minWidth: '260px' },
  '.cm-tooltip-autocomplete ul li': { padding: '4px 10px', display: 'flex', alignItems: 'baseline', gap: '8px' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'hsl(var(--accent) / 0.25)', color: 'inherit' },
  '.cm-completionLabel': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: '12.5px' },
  '.cm-completionDetail': {
    marginLeft: 'auto',
    fontStyle: 'normal',
    fontSize: '11px',
    color: 'hsl(var(--muted-foreground))',
    maxWidth: '220px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '.cm-completionInfo': { padding: '8px 10px', fontSize: '12px', maxWidth: '280px', lineHeight: '1.45' },
  '.cm-completionSection': { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'hsl(var(--muted-foreground))', padding: '4px 10px 2px' },
  '.cm-fx-hint': { padding: '8px 10px', maxWidth: '360px', fontSize: '12px', lineHeight: '1.45' },
  '.cm-fx-hint-signature': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: '12.5px' },
  '.cm-fx-hint-signature strong': { color: 'hsl(var(--primary))', fontWeight: '700' },
  '.cm-fx-hint-description': { marginTop: '4px', color: 'hsl(var(--foreground))' },
  '.cm-fx-hint-example': { marginTop: '4px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: '11.5px', color: 'hsl(var(--muted-foreground))' },
  '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy var(--fx-error)', textUnderlineOffset: '3px' },
  '.cm-lintRange-warning': { backgroundImage: 'none', textDecoration: 'underline wavy var(--fx-warning)', textUnderlineOffset: '3px' },
  '.cm-diagnostic': { padding: '6px 10px', fontSize: '12px' },
  '.cm-diagnostic-error': { borderLeft: '3px solid var(--fx-error)' },
  '.cm-diagnostic-warning': { borderLeft: '3px solid var(--fx-warning)' },
});

// ── The component ──────────────────────────────────────────────────────

const FormulaCodeEditor = forwardRef<FormulaCodeEditorHandle, FormulaCodeEditorProps>(function FormulaCodeEditor(
  { value, onChange, fields, suggestable, pills, placeholderText, ariaLabel = 'Formula', onDiagnostics },
  ref,
) {
  const suggestions = suggestable ?? fields;
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const dynamic = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onDiagnosticsRef = useRef(onDiagnostics);
  onChangeRef.current = onChange;
  onDiagnosticsRef.current = onDiagnostics;

  useImperativeHandle(ref, () => ({
    insert(text) {
      const view = viewRef.current;
      if (!view) return;
      const { from, to } = view.state.selection.main;
      view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, userEvent: 'input' });
      view.focus();
    },
    focus() {
      viewRef.current?.focus();
    },
  }));

  // Create the editor once.
  useEffect(() => {
    if (!hostRef.current) return undefined;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          // "{" is left out of the auto-closing pairs on purpose: choosing a field from the list fills in the closing brace.
          closeBrackets(),
          EditorState.languageData.of(() => [{ closeBrackets: { brackets: ['(', '"', "'"] } }]),
          bracketMatching({ brackets: '()' }),
          keymap.of([{ key: 'Tab', run: acceptCompletion }, ...closeBracketsKeymap, ...completionKeymap, ...historyKeymap, ...defaultKeymap]),
          hintField,
          placeholder(placeholderText ?? 'e.g. IF({Status} = "Done", 1, 0)'),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': ariaLabel, 'aria-multiline': 'true', spellcheck: 'false' }),
          formulaTheme,
          dynamic.current.of(dynamicExtensions(fields, suggestions, pills, (d) => onDiagnosticsRef.current?.(d))),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The editor is created once; value, fields and pills are kept in step by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A change from outside (the dialog was reset, a function was picked) replaces the text.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (value !== current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  // New fields or the chip setting change how the text is drawn and completed, not the text.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: dynamic.current.reconfigure(dynamicExtensions(fields, suggestions, pills, (d) => onDiagnosticsRef.current?.(d))),
    });
  }, [fields, suggestions, pills]);

  return (
    <div
      ref={hostRef}
      className="rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary transition-colors"
      data-formula-editor
    />
  );
});

export default FormulaCodeEditor;
