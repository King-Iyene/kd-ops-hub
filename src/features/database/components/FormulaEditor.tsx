import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FORMULA_FUNCTIONS, parseFormula, evaluateFormula } from '../lib/formula';
import type { ASTNode } from '../lib/formula';
import type { FieldMeta } from '../types';
import { useDatabaseUI } from '../lib/store';

interface FormulaEditorProps {
  value: string;
  onChange: (value: string) => void;
  fields: FieldMeta[];
  error?: string;
  /** Sample records used for live preview evaluation. If omitted, pulled from query cache. */
  sampleRecords?: Record<string, any>[];
}

interface Suggestion {
  label: string;
  type: 'field' | 'function';
  insert: string;
}

export function FormulaEditor({ value, onChange, fields, error, sampleRecords: sampleRecordsProp }: FormulaEditorProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

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
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const allSuggestions = useMemo(() => {
    const fieldSugs: Suggestion[] = fields
      .filter((f) => !['Formula', 'Lookup', 'Rollup', 'AutoNumber', 'CreatedTime', 'LastModifiedTime', 'CreatedBy', 'LastModifiedBy'].includes(f.ui_type))
      .map((f) => ({
        label: f.name,
        type: 'field' as const,
        insert: `{${f.name}}`,
      }));
    const fnSugs: Suggestion[] = FORMULA_FUNCTIONS.map((fn) => ({
      label: fn,
      type: 'function' as const,
      insert: `${fn}(`,
    }));
    return [...fieldSugs, ...fnSugs];
  }, [fields]);

  const getContext = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return { token: '', start: 0, end: 0, mode: 'none' as const };
    const pos = ta.selectionStart;
    const before = value.slice(0, pos);

    const braceMatch = before.match(/\{([^}]*)$/);
    if (braceMatch) {
      return {
        token: braceMatch[1].toLowerCase(),
        start: pos - braceMatch[1].length - 1,
        end: pos,
        mode: 'field' as const,
      };
    }

    const identMatch = before.match(/([A-Za-z_]\w*)$/);
    if (identMatch) {
      return {
        token: identMatch[1].toLowerCase(),
        start: pos - identMatch[1].length,
        end: pos,
        mode: 'function' as const,
      };
    }

    return { token: '', start: pos, end: pos, mode: 'none' as const };
  }, [value]);

  const updateSuggestions = useCallback(() => {
    const ctx = getContext();
    if (ctx.mode === 'none' || ctx.token.length === 0) {
      setShowSuggestions(false);
      return;
    }

    const filtered = allSuggestions.filter((s) => {
      if (ctx.mode === 'field') return s.type === 'field' && s.label.toLowerCase().includes(ctx.token);
      return s.type === 'function' && s.label.toLowerCase().startsWith(ctx.token);
    }).slice(0, 8);

    if (filtered.length > 0) {
      setSuggestions(filtered);
      setSelectedIdx(0);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  }, [getContext, allSuggestions]);

  const applySuggestion = useCallback((sug: Suggestion) => {
    const ctx = getContext();
    const ta = textareaRef.current;
    if (!ta) return;

    const insert = sug.insert;
    let newCursorPos: number;

    if (ctx.mode === 'field') {
      const afterCursor = value.slice(ctx.end);
      const closingBrace = afterCursor.startsWith('}') ? 1 : 0;
      const newValue = value.slice(0, ctx.start) + insert + value.slice(ctx.end + closingBrace);
      newCursorPos = ctx.start + insert.length;
      onChange(newValue);
    } else {
      const newValue = value.slice(0, ctx.start) + insert + value.slice(ctx.end);
      newCursorPos = ctx.start + insert.length;
      onChange(newValue);
    }

    setShowSuggestions(false);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }, [getContext, value, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showSuggestions) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (suggestions[selectedIdx]) {
        e.preventDefault();
        applySuggestion(suggestions[selectedIdx]);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  }, [showSuggestions, suggestions, selectedIdx, applySuggestion]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  }, [onChange]);

  useEffect(() => {
    updateSuggestions();
  }, [value, updateSuggestions]);

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
      } catch (e: any) {
        setPreview({ status: 'error', message: e?.message ?? 'Invalid formula' });
      }
    }, 300);

    return () => clearTimeout(previewTimerRef.current);
  }, [value, fields, sampleRecords]);

  const isValid = !error && value.trim();

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        placeholder='e.g. IF({Status} = "Done", 1, 0)'
        className="w-full h-24 px-3 py-2 border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded-lg text-xs-plus font-mono resize-y focus:outline-none focus:ring-2 focus:ring-[#2D7FF9]/30 focus:border-[#2D7FF9] bg-white dark:bg-[hsl(200,30%,10%)] text-[#374151] dark:text-[hsl(200,25%,88%)]"
        spellCheck={false}
      />
      {isValid && (
        <div className="absolute bottom-2 right-2 flex items-center gap-1">
          <span className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center text-white text-3xs">✓</span>
        </div>
      )}

      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute left-0 right-0 z-50 mt-1 bg-white dark:bg-[hsl(200,30%,10%)] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded-lg shadow-lg overflow-hidden"
        >
          {suggestions.map((sug, idx) => (
            <button
              key={`${sug.type}-${sug.label}`}
              type="button"
              className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${idx === selectedIdx ? 'bg-[#F4F4F5] dark:bg-[hsl(220,40%,15%)]' : ''}`}
              onMouseEnter={() => setSelectedIdx(idx)}
              onMouseDown={(e) => {
                e.preventDefault();
                applySuggestion(sug);
              }}
            >
              <span className={`text-3xs font-mono px-1.5 py-0.5 rounded ${
                sug.type === 'field'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  : 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
              }`}>
                {sug.type === 'field' ? 'field' : 'fn'}
              </span>
              <span className="text-xs-plus text-[#374151] dark:text-[hsl(200,25%,88%)]">
                {sug.type === 'field' ? `{${sug.label}}` : `${sug.label}()`}
              </span>
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      {!error && value.trim() && <p className="text-xs text-success mt-1">Formula is valid</p>}
      <div className="text-3xs text-[#9AA2AF] leading-relaxed mt-1">
        <span className="font-medium">Reference fields:</span> {'{FieldName}'} &middot;{' '}
        <span className="font-medium">Functions:</span>{' '}
        {FORMULA_FUNCTIONS.slice(0, 12).join(', ')}...
      </div>

      {/* Live preview panel */}
      {preview.status === 'error' && (
        <div className="mt-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40">
          <p className="text-xs text-destructive font-mono">{preview.message}</p>
        </div>
      )}
      {preview.status === 'ok' && preview.rows.length > 0 && (
        <div className="mt-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-800/40">
          <p className="text-3xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1">
            Preview
          </p>
          <div className="space-y-0.5">
            {preview.rows.map((r) => (
              <p key={r.index} className="text-xs text-[#374151] dark:text-[hsl(200,25%,88%)] font-mono">
                <span className="text-[#9AA2AF] mr-1.5">Row {r.index}:</span>
                {r.value == null ? <span className="text-[#9AA2AF] italic">empty</span> : String(r.value)}
              </p>
            ))}
          </div>
        </div>
      )}
      {preview.status === 'ok' && preview.rows.length === 0 && value.trim() && (
        <div className="mt-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/15 border border-green-200 dark:border-green-800/40">
          <p className="text-xs text-success">Formula parses successfully. Add records to see preview values.</p>
        </div>
      )}
    </div>
  );
}
