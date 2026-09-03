import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { FORMULA_FUNCTIONS, validateFormula } from '../lib/formula';
import type { FieldMeta } from '../types';

interface FormulaEditorProps {
  value: string;
  onChange: (value: string) => void;
  fields: FieldMeta[];
  error?: string;
}

interface Suggestion {
  label: string;
  type: 'field' | 'function';
  insert: string;
}

export function FormulaEditor({ value, onChange, fields, error }: FormulaEditorProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
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
        className="w-full h-24 px-3 py-2 border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] rounded-lg text-[13px] font-mono resize-y focus:outline-none focus:ring-2 focus:ring-[#3366FF]/30 focus:border-[#3366FF] bg-white dark:bg-[hsl(200,30%,10%)] text-[#374151] dark:text-[hsl(200,25%,88%)]"
        spellCheck={false}
      />
      {isValid && (
        <div className="absolute bottom-2 right-2 flex items-center gap-1">
          <span className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center text-white text-[10px]">✓</span>
        </div>
      )}

      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute left-0 right-0 z-50 mt-1 bg-white dark:bg-[hsl(200,30%,10%)] border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] rounded-lg shadow-lg overflow-hidden"
        >
          {suggestions.map((sug, idx) => (
            <button
              key={`${sug.type}-${sug.label}`}
              type="button"
              className="w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors"
              style={{
                backgroundColor: idx === selectedIdx ? '#F4F4F5' : 'transparent',
              }}
              onMouseEnter={() => setSelectedIdx(idx)}
              onMouseDown={(e) => {
                e.preventDefault();
                applySuggestion(sug);
              }}
            >
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                sug.type === 'field'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  : 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
              }`}>
                {sug.type === 'field' ? 'field' : 'fn'}
              </span>
              <span className="text-[13px] text-[#374151] dark:text-[hsl(200,25%,88%)]">
                {sug.type === 'field' ? `{${sug.label}}` : `${sug.label}()`}
              </span>
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      {!error && value.trim() && <p className="text-xs text-green-600 mt-1">Formula is valid</p>}
      <div className="text-[10px] text-[#9AA2AF] leading-relaxed mt-1">
        <span className="font-medium">Reference fields:</span> {'{FieldName}'} &middot;{' '}
        <span className="font-medium">Functions:</span>{' '}
        {FORMULA_FUNCTIONS.slice(0, 12).join(', ')}...
      </div>
    </div>
  );
}
