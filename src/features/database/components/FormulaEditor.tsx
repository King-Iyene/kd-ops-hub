import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BookOpen, CircleAlert, Check, Rows3 } from 'lucide-react';
import { parseFormula, evaluateFormula } from '../lib/formula';
import type { ASTNode } from '../lib/formula';
import { diagnoseFormula, hasBlockingError, type FieldChoice, type FormulaDiagnostic } from '../lib/formulaEditorSupport';
import type { FieldMeta } from '../types';
import { useDatabaseUI } from '../lib/store';
import { FunctionReference } from './formula/FunctionReference';
import type { FormulaCodeEditorHandle } from './formula/FormulaCodeEditor';

// The editor library is loaded only when a formula is opened, so it costs nothing anywhere else.
const FormulaCodeEditor = lazy(() => import('./formula/FormulaCodeEditor'));

interface FormulaEditorProps {
  value: string;
  onChange: (value: string) => void;
  fields: FieldMeta[];
  error?: string;
  /** Sample records used for live preview evaluation. If omitted, pulled from query cache. */
  sampleRecords?: Record<string, any>[];
}

/** Field types a formula cannot read (they are worked out elsewhere), so they are not suggested. */
const NOT_READABLE = ['Formula', 'Lookup', 'Rollup', 'AutoNumber', 'CreatedTime', 'LastModifiedTime', 'CreatedBy', 'LastModifiedBy'];

const PILLS_KEY = 'kd.formula.pills';

/** Chips by default with a mouse; coloured text on touch screens, where editing beside a chip is less reliable. */
function readPillsPreference(): boolean {
  try {
    const stored = window.localStorage.getItem(PILLS_KEY);
    if (stored !== null) return stored === '1';
  } catch {
    /* storage unavailable: fall through to the default */
  }
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches;
}

export function FormulaEditor({ value, onChange, fields, error, sampleRecords: sampleRecordsProp }: FormulaEditorProps) {
  const editorRef = useRef<FormulaCodeEditorHandle>(null);
  const [pills, setPills] = useState(readPillsPreference);
  const [showReference, setShowReference] = useState(false);
  const [diagnostics, setDiagnostics] = useState<FormulaDiagnostic[]>([]);

  // Pull sample records from query cache if not provided via props
  const qc = useQueryClient();
  const { activeBaseId, activeTableId } = useDatabaseUI();
  const sampleRecords = useMemo(() => {
    if (sampleRecordsProp && sampleRecordsProp.length > 0) return sampleRecordsProp;
    if (!activeBaseId || !activeTableId) return [];
    // Look for cached infinite-records data
    const queries = qc.getQueriesData<any>({
      queryKey: ['nc', 'records', activeBaseId, activeTableId, 'infinite'],
    });
    for (const [, data] of queries) {
      if (data?.pages?.[0]?.records) {
        return (data.pages[0].records as Record<string, any>[]).slice(0, 3);
      }
    }
    return [];
  }, [sampleRecordsProp, activeBaseId, activeTableId, qc]);

  // Every field counts as existing; only the readable ones are suggested. Kept stable so the editor is not reconfigured on every render.
  const allFields = useMemo<FieldChoice[]>(() => fields.map((f) => ({ name: f.name, type: f.ui_type })), [fields]);
  const suggestable = useMemo<FieldChoice[]>(
    () => fields.filter((f) => !NOT_READABLE.includes(f.ui_type)).map((f) => ({ name: f.name, type: f.ui_type })),
    [fields],
  );

  const togglePills = useCallback(() => {
    setPills((p) => {
      const next = !p;
      try {
        window.localStorage.setItem(PILLS_KEY, next ? '1' : '0');
      } catch {
        /* storage unavailable: the choice lasts for this session only */
      }
      return next;
    });
  }, []);

  const pickFunction = useCallback((name: string) => {
    editorRef.current?.insert(`${name}(`);
  }, []);

  // ── Live preview with debounce ──────────────────────────────────────
  const [preview, setPreview] = useState<
    | { status: 'idle' }
    | { status: 'error'; message: string }
    | { status: 'ok'; rows: { index: number; value: any }[] }
  >({ status: 'idle' });

  const previewTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(previewTimerRef.current);

    const trimmed = value.trim();
    if (!trimmed) {
      setPreview({ status: 'idle' });
      setDiagnostics([]);
      return;
    }

    previewTimerRef.current = setTimeout(() => {
      try {
        const ast: ASTNode = parseFormula(trimmed);

        // Build field-name → pg_column_name map
        const fieldMap: Record<string, string> = {};
        for (const f of fields) {
          fieldMap[f.name] = f.pg_column_name;
        }

        const samples = (sampleRecords ?? []).slice(0, 3);
        if (samples.length === 0) {
          // No sample data — just confirm it parses
          setPreview({ status: 'ok', rows: [] });
          return;
        }

        const rows = samples.map((rec, i) => {
          try {
            const result = evaluateFormula(ast, rec, fieldMap);
            return { index: i + 1, value: result };
          } catch {
            return { index: i + 1, value: '#ERROR' };
          }
        });

        setPreview({ status: 'ok', rows });
      } catch {
        // The reason, in plain words and with a place, is in the issue list; the preview just says there is nothing to show.
        const first = diagnoseFormula(trimmed).find((d) => d.blocking);
        setPreview({ status: 'error', message: first?.message ?? 'This formula cannot be worked out yet.' });
      }
    }, 300);

    return () => clearTimeout(previewTimerRef.current);
  }, [value, fields, sampleRecords]);

  const issues = diagnostics.filter((d) => d.message);
  const blocking = hasBlockingError(issues);
  // The dialog's own message ("Unexpected token...") says the same as the editor's plain-words list, so it is shown
  // only while the editor has nothing to say (before its first check, or for an error the editor cannot see).
  const showError = error && issues.length === 0 ? error : '';
  const isValid = !error && !blocking && value.trim() !== '' && issues.length === 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xs text-muted-foreground leading-snug min-w-0">
          Type <kbd className="rounded border border-border bg-muted px-1 font-mono text-3xs">{'{'}</kbd> to pick a field, or start a
          function name. <kbd className="rounded border border-border bg-muted px-1 font-mono text-3xs">Ctrl</kbd>+
          <kbd className="rounded border border-border bg-muted px-1 font-mono text-3xs">Space</kbd> opens suggestions.
        </p>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            aria-pressed={pills}
            onClick={togglePills}
            title={pills ? 'Show fields as plain coloured text' : 'Show fields as chips'}
            className={`inline-flex items-center gap-1 rounded-md border px-2 h-7 text-2xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
              pills ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            <Rows3 size={12} aria-hidden="true" /> Chips
          </button>
          <button
            type="button"
            aria-expanded={showReference}
            onClick={() => setShowReference((s) => !s)}
            className={`inline-flex items-center gap-1 rounded-md border px-2 h-7 text-2xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
              showReference ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            <BookOpen size={12} aria-hidden="true" /> Functions
          </button>
        </div>
      </div>

      <Suspense
        fallback={
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label="Formula"
            spellCheck={false}
            className="w-full h-28 px-3 py-2 border border-input rounded-lg text-xs-plus font-mono resize-y bg-background text-foreground"
          />
        }
      >
        <FormulaCodeEditor
          ref={editorRef}
          value={value}
          onChange={onChange}
          fields={allFields}
          suggestable={suggestable}
          pills={pills}
          onDiagnostics={setDiagnostics}
        />
      </Suspense>

      {(issues.length > 0 || showError) && (
        <ul className="space-y-1" aria-label="Problems in this formula">
          {showError && (
            <li className="flex items-start gap-1.5 text-xs text-destructive">
              <CircleAlert size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{showError}</span>
            </li>
          )}
          {issues.map((d, i) => (
            <li key={`${d.from}-${i}`} className={`flex items-start gap-1.5 text-xs ${d.blocking ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}`}>
              {d.blocking ? (
                <CircleAlert size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              ) : (
                <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              )}
              <span>
                <span className="sr-only">{d.blocking ? 'Error: ' : 'Warning: '}</span>
                {d.message}
              </span>
            </li>
          ))}
        </ul>
      )}
      {isValid && (
        <p className="flex items-center gap-1.5 text-xs text-success">
          <Check size={13} aria-hidden="true" /> Formula is valid
        </p>
      )}

      {showReference && <FunctionReference onPick={pickFunction} />}

      {/* Live preview panel */}
      {preview.status === 'ok' && preview.rows.length > 0 && (
        <div className="px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-800/40">
          <p className="text-3xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1">
            Preview
          </p>
          <div className="space-y-0.5">
            {preview.rows.map((r) => (
              <p key={r.index} className="text-xs text-foreground font-mono">
                <span className="text-muted-foreground mr-1.5">Row {r.index}:</span>
                {r.value == null ? <span className="text-muted-foreground italic">empty</span> : String(r.value)}
              </p>
            ))}
          </div>
        </div>
      )}
      {preview.status === 'ok' && preview.rows.length === 0 && value.trim() && (
        <div className="px-3 py-2 rounded-lg bg-success/10 border border-success/20">
          <p className="text-xs text-success">Formula parses successfully. Add records to see preview values.</p>
        </div>
      )}
    </div>
  );
}
