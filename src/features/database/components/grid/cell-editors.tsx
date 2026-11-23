import React, { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Paperclip, Check, X } from 'lucide-react';
import type { FieldMeta, SelectChoice } from '@/features/database/types';
import { SELECT_COLOR_NAMES, SELECT_COLORS } from '@/features/database/types';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { DateEditor } from './DateEditor';
import { MultiSelectCellRenderer, SelectCellRenderer } from './cell-renderers';
import { currencySymbol, parseNumberInput } from '../../lib/numberFormat';
import { formatDuration, normalizeDurationFormat, parseDuration } from '../../lib/duration';
import { nextRating, ratingHexOf, ratingIconOf, ratingMaxOf, stepRating } from '../../lib/ratingStyle';
import { RatingGlyph } from './RatingGlyph';
import { AttachmentManager, type AttachmentMeta } from '../AttachmentManager';
import { useGridColors } from '../../hooks/useGridColors';
import { useWorkspaceUsers } from '../../hooks/useWorkspaceUsers';
import { usePlatformTasks } from '../../hooks/usePlatformTasks';
import { normalizeLinkedTasks, type LinkedTaskValue } from './cell-renderer-map';

/** Strip non-numeric chars, keeping at most one minus (leading) and one dot. */
function sanitizeNumeric(raw: string): string {
  const stripped = raw.replace(/[^0-9.-]/g, '');
  let result = '';
  let hasDot = false;
  let hasMinus = false;
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (ch === '-') {
      if (hasMinus || result.length > 0) continue;
      hasMinus = true;
    } else if (ch === '.') {
      if (hasDot) continue;
      hasDot = true;
    }
    result += ch;
  }
  return result;
}

/**
 * Enter then blur (or Tab then blur) used to commit twice. The first exit wins;
 * the guard releases after a moment so a rejected value can be corrected and saved.
 */
function useEditorExit(onCommit: (value: any) => void, onCancel: () => void) {
  const busy = useRef(false);
  const release = () => { setTimeout(() => { busy.current = false; }, 80); };
  const commit = useCallback((value: any) => {
    if (busy.current) return;
    busy.current = true;
    onCommit(value);
    release();
  }, [onCommit]);
  const cancel = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    onCancel();
    release();
  }, [onCancel]);
  return { commit, cancel };
}

/**
 * Number-like editor: one borderless input that sits exactly where the cell's
 * text sits (the cell owns the outline and the padding), with an optional
 * symbol before or after the number.
 */
function NumericEditor({
  value, onCommit, onCancel, prefix, suffix, placeholder,
}: {
  value: any;
  onCommit: (value: any) => void;
  onCancel: () => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
}) {
  const [num, setNum] = useState(value == null ? '' : String(value));
  const ref = useRef<HTMLInputElement>(null);
  const exit = useEditorExit(onCommit, onCancel);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const finish = () => exit.commit(num === '' ? null : Number(num));

  return (
    <div className="flex items-center gap-1 w-full h-full min-w-0">
      {prefix && <span className="shrink-0 text-muted-foreground tabular-nums" style={{ fontSize: 13 }}>{prefix}</span>}
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        value={num}
        placeholder={placeholder}
        onChange={(e) => setNum(sanitizeNumeric(e.target.value))}
        onPaste={(e) => {
          // Pasting "₦1,234.50" or "(500)" keeps the number instead of dropping characters.
          const parsed = parseNumberInput(e.clipboardData.getData('text'));
          if (parsed != null) {
            e.preventDefault();
            setNum(String(parsed));
          }
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') finish();
          else if (e.key === 'Escape') exit.cancel();
          else if (e.key === 'Tab') { e.preventDefault(); finish(); }
        }}
        onBlur={finish}
        className="flex-1 min-w-0 h-full px-0 bg-transparent border-0 rounded-none shadow-none outline-none text-right tabular-nums"
        style={{ fontSize: 13, lineHeight: '18px', letterSpacing: '-0.01em', color: 'inherit' }}
      />
      {suffix && <span className="shrink-0 text-muted-foreground tabular-nums" style={{ fontSize: 13 }}>{suffix}</span>}
    </div>
  );
}

interface CellEditorProps {
  value: any;
  field: FieldMeta;
  onCommit: (value: any) => void;
  onCancel: () => void;
  onFieldUpdate?: (fieldId: string, tableId: string, updates: Partial<FieldMeta['options']>) => void;
}

export function TextCellEditor({ value, onCommit: commitValue, onCancel: cancelValue }: CellEditorProps) {
  const [text, setText] = useState(value ?? '');
  const ref = useRef<HTMLInputElement>(null);
  const { commit: onCommit, cancel: onCancel } = useEditorExit(commitValue, cancelValue);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      type="text"
      value={text}
      maxLength={100000}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        // Stop native text-editing keys (Home/End/Ctrl+A/arrows, etc.) from
        // bubbling to the grid's window-level keyboard handler while this
        // input is focused — that handler already checks e.target.tagName
        // and bails out for real INPUT elements, but a synthesized keydown
        // (browser automation, some virtual keyboards) can arrive with a
        // target that doesn't match, letting the grid's own shortcuts (row
        // navigation, select-all-rows, etc.) fire mid-edit instead of the
        // native text-cursor behavior. Stopping propagation here means this
        // editor's behavior never depends on that check succeeding.
        if (e.key === 'Enter') onCommit(text);
        if (e.key === 'Escape') onCancel();
        if (e.key === 'Tab') { e.preventDefault(); onCommit(text); return; }
        e.stopPropagation();
      }}
      onBlur={() => onCommit(text)}
      className="w-full h-full min-w-0 px-0 outline-none border-0 rounded-none shadow-none bg-transparent"
      style={{ fontSize: 13, color: 'inherit', borderRadius: 0 }}
    />
  );
}

export function NumberCellEditor({ value, onCommit, onCancel }: CellEditorProps) {
  return <NumericEditor value={value} onCommit={onCommit} onCancel={onCancel} placeholder="0" />;
}

export function CurrencyCellEditor({ value, field, onCommit, onCancel }: CellEditorProps) {
  const symbol = currencySymbol(field.options?.currencyCode || field.options?.symbol);
  const places = field.options?.precision ?? 2;
  return (
    <NumericEditor
      value={value}
      onCommit={onCommit}
      onCancel={onCancel}
      prefix={symbol}
      placeholder={places > 0 ? `0.${'0'.repeat(places)}` : '0'}
    />
  );
}

export function DateCellEditor({ value, onCommit, onCancel }: CellEditorProps) {
  return <DateEditor value={value} mode="date" onCommit={onCommit} onCancel={onCancel} />;
}

export function YearCellEditor({ value, onCommit, onCancel }: CellEditorProps) {
  const initial = value ? String(value).slice(0, 4) : '';
  const [year, setYear] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => {
    if (!year) { onCommit(null); return; }
    const n = parseInt(year, 10);
    if (isNaN(n) || n < 1000 || n > 9999) { onCancel(); return; }
    onCommit(n);
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      value={year}
      onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, ''))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') onCancel();
        if (e.key === 'Tab') { e.preventDefault(); commit(); }
      }}
      onBlur={commit}
      placeholder="YYYY"
      className="w-full h-full min-w-0 px-0 outline-none border-0 rounded-none shadow-none bg-transparent"
      style={{ fontSize: 13, color: 'inherit' }}
    />
  );
}

export function DurationCellEditor({ value, field, onCommit, onCancel }: CellEditorProps) {
  const format = normalizeDurationFormat(field.options?.format);
  const hasValue = value != null && value !== '' && Number.isFinite(Number(value));
  const [text, setText] = useState(hasValue ? formatDuration(Number(value), format) : '');
  const [invalid, setInvalid] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const exit = useEditorExit(onCommit, onCancel);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  // Empty text clears the cell; text that is not a duration keeps the editor open
  // (Enter, Tab) or discards the edit (clicking away) instead of saving a wrong value.
  const finish = (leaving: boolean) => {
    if (text.trim() === '') { exit.commit(null); return; }
    const seconds = parseDuration(text, format);
    if (seconds == null) {
      if (leaving) exit.cancel(); else setInvalid(true);
      return;
    }
    exit.commit(seconds);
  };

  return (
    <input
      ref={ref}
      type="text"
      placeholder={format === 'h:mm' ? 'e.g. 1:30 or 1h 30m' : 'e.g. 1:30:00'}
      value={text}
      aria-invalid={invalid}
      onChange={(e) => { setText(e.target.value); setInvalid(false); }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(false);
        else if (e.key === 'Escape') exit.cancel();
        else if (e.key === 'Tab') { e.preventDefault(); finish(false); }
      }}
      onBlur={() => finish(true)}
      className="w-full h-full min-w-0 px-0 outline-none border-0 rounded-none shadow-none bg-transparent text-right tabular-nums"
      style={{ fontSize: 13, lineHeight: '18px', color: invalid ? '#EF4444' : 'inherit', fontVariantNumeric: 'tabular-nums' }}
    />
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailCellEditor({ value, onCommit: commitValue, onCancel: cancelValue }: CellEditorProps) {
  const [text, setText] = useState(value ?? '');
  const [invalid, setInvalid] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const exit = useEditorExit(commitValue, cancelValue);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = useCallback((leaving = false) => {
    const trimmed = String(text).trim();
    if (trimmed && !EMAIL_RE.test(trimmed)) {
      if (leaving) exit.cancel(); else setInvalid(true);
      return;
    }
    setInvalid(false);
    exit.commit(trimmed);
  }, [text, exit]);

  return (
    <div className="relative w-full h-full">
      <input
        ref={ref}
        type="email"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') exit.cancel();
          else if (e.key === 'Tab') { e.preventDefault(); commit(); }
        }}
        onBlur={() => commit(true)}
        placeholder="name@example.com"
        className="w-full h-full min-w-0 px-0 outline-none border-0 rounded-none shadow-none bg-transparent"
        style={{
          fontSize: 13,
          color: invalid ? '#EF4444' : 'inherit',
        }}
      />
      {invalid && (
        <div className="absolute left-0 top-full z-50 bg-popover border border-destructive/30 rounded px-2 py-1 shadow text-2xs text-destructive whitespace-nowrap mt-0.5">
          Enter a valid email address
        </div>
      )}
    </div>
  );
}

export function URLCellEditor({ value, onCommit: commitValue, onCancel: cancelValue }: CellEditorProps) {
  const [text, setText] = useState(value ?? '');
  const [invalid, setInvalid] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const exit = useEditorExit(commitValue, cancelValue);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = useCallback((leaving = false) => {
    const trimmed = String(text).trim();
    let isValid = true;
    if (trimmed) {
      try { new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`); }
      catch { isValid = false; }
    }
    if (trimmed && !isValid) {
      if (leaving) exit.cancel(); else setInvalid(true);
      return;
    }
    setInvalid(false);
    exit.commit(trimmed);
  }, [text, exit]);

  return (
    <div className="relative w-full h-full">
      <input
        ref={ref}
        type="url"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') exit.cancel();
          else if (e.key === 'Tab') { e.preventDefault(); commit(); }
        }}
        onBlur={() => commit(true)}
        placeholder="https://example.com"
        className="w-full h-full min-w-0 px-0 outline-none border-0 rounded-none shadow-none bg-transparent"
        style={{
          fontSize: 13,
          color: invalid ? '#EF4444' : 'inherit',
        }}
      />
      {invalid && (
        <div className="absolute left-0 top-full z-50 bg-popover border border-destructive/30 rounded px-2 py-1 shadow text-2xs text-destructive whitespace-nowrap mt-0.5">
          Enter a valid URL
        </div>
      )}
    </div>
  );
}

const PHONE_WARN_RE = /[a-wyzA-WYZ]/;

export function PhoneNumberCellEditor({ value, onCommit: commitValue, onCancel: cancelValue }: CellEditorProps) {
  const [text, setText] = useState(value ?? '');
  const ref = useRef<HTMLInputElement>(null);
  const hasLetters = PHONE_WARN_RE.test(String(text));
  const exit = useEditorExit(commitValue, cancelValue);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <div className="relative w-full h-full">
      <input
        ref={ref}
        type="tel"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') exit.commit(text);
          else if (e.key === 'Escape') exit.cancel();
          else if (e.key === 'Tab') { e.preventDefault(); exit.commit(text); }
        }}
        onBlur={() => exit.commit(text)}
        placeholder="(555) 555-5555"
        className="w-full h-full min-w-0 px-0 outline-none border-0 rounded-none shadow-none bg-transparent"
        style={{
          fontSize: 13,
          color: hasLetters ? '#D97706' : 'inherit',
        }}
      />
      {hasLetters && (
        <div className="absolute left-0 top-full z-50 bg-popover border border-warning/30 rounded px-2 py-1 shadow text-2xs text-warning whitespace-nowrap mt-0.5">
          Phone number contains letters
        </div>
      )}
    </div>
  );
}

export function RatingCellEditor({ value, field, onCommit, onCancel }: CellEditorProps) {
  const max = ratingMaxOf(field.options?.max);
  const icon = ratingIconOf(field.options?.icon);
  const hex = ratingHexOf(field.options?.color);
  const [draft, setDraft] = useState(Number(value) || 0);
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const exit = useEditorExit(onCommit, onCancel);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const shown = hover ?? draft;

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="slider"
      aria-label={field.name}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={draft}
      className="flex items-center gap-0.5 h-full bg-transparent outline-none rounded-none shadow-none focus-visible:shadow-none"
      onMouseLeave={() => setHover(null)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') exit.cancel();
        else if (e.key === 'Enter' || e.key === 'Tab') exit.commit(draft);
        else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); setDraft((d) => stepRating(d, 1, max)); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); setDraft((d) => stepRating(d, -1, max)); }
        else if (/^[0-9]$/.test(e.key)) { e.preventDefault(); setDraft(Math.min(Number(e.key), max)); }
        else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); setDraft(0); }
      }}
      onBlur={() => exit.commit(draft)}
    >
      {Array.from({ length: max }, (_, i) => (
        <button
          key={i}
          type="button"
          tabIndex={-1}
          className="p-0 border-0 bg-transparent cursor-pointer rounded-none shadow-none"
          onMouseEnter={() => setHover(i + 1)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exit.commit(nextRating(draft, i + 1, max))}
          aria-label={`Rate ${i + 1} of ${max}`}
        >
          <span style={{ opacity: hover != null && i >= draft && i < hover ? 0.55 : 1 }}>
            <RatingGlyph icon={icon} filled={i < shown} hex={hex} />
          </span>
        </button>
      ))}
    </div>
  );
}

function getSelectColorStyle(colorName: string) {
  return SELECT_COLORS[colorName] || SELECT_COLORS.grayLight2;
}

export function SelectCellEditor({ value, field, onCommit, onCancel, onFieldUpdate }: CellEditorProps) {
  const choices: SelectChoice[] = useMemo(() => field.options?.choices || [], [field.options?.choices]);
  const [search, setSearch] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const searchRef = useRef<HTMLInputElement>(null);
  const colors = useGridColors();

  const filtered = search
    ? choices.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
    : choices;

  const canCreate = field.options?.allowNewOptions !== false;
  const exactMatch = search
    ? choices.some((c) => c.title.toLowerCase() === search.trim().toLowerCase())
    : true;

  const handleCreateOption = useCallback(() => {
    const trimmed = search.trim();
    if (!trimmed || !canCreate) return;
    const randomColor = SELECT_COLOR_NAMES[Math.floor(Math.random() * SELECT_COLOR_NAMES.length)];
    const newChoice: SelectChoice = { title: trimmed, color: randomColor };
    const updatedChoices = [...choices, newChoice];
    onFieldUpdate?.(field.id, field.table_id, { choices: updatedChoices } as Partial<FieldMeta['options']>);
    onCommit(trimmed);
  }, [search, canCreate, choices, field.id, field.table_id, onFieldUpdate, onCommit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < filtered.length) {
        onCommit(filtered[focusedIndex].title);
      } else if (!exactMatch && search.trim() && canCreate) {
        handleCreateOption();
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < filtered.length) {
        onCommit(filtered[focusedIndex].title);
      } else {
        onCommit(value);
      }
    }
  }, [onCancel, filtered, focusedIndex, exactMatch, search, canCreate, handleCreateOption, onCommit, value]);

  return (
    <Popover open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <PopoverTrigger asChild>
        <div className="flex items-center w-full h-full min-w-0">
          {value ? <SelectCellRenderer value={value} field={field} record={{ id: '' } as any} rowHeight="short" /> : null}
        </div>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={1}
        className="!w-auto !border-none !p-0 !shadow-none"
        style={{
          minWidth: 220,
          maxHeight: 300,
          backgroundColor: colors.cellEditorBg,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        }}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          setTimeout(() => searchRef.current?.focus(), 0);
        }}
      >
        <div className="px-2 pt-2 pb-1 shrink-0">
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Find an option..."
            className="kd-flat-input w-full px-2 py-1.5 text-xs rounded outline-none bg-transparent"
            style={{
              border: `1px solid ${colors.border}`,
              color: colors.text,
            }}
          />
        </div>
        <div className="overflow-y-auto py-1" style={{ maxHeight: 200 }}>
          {filtered.map((choice, idx) => {
            const sc = getSelectColorStyle(choice.color);
            const isFocused = idx === focusedIndex;
            const isSelected = value === choice.title;
            return (
              <button
                key={choice.title}
                className="w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors"
                style={{
                  backgroundColor: isFocused ? colors.hoverRow : 'transparent',
                }}
                onMouseEnter={() => setFocusedIndex(idx)}
                onClick={() => onCommit(choice.title)}
              >
                <span
                  className="inline-flex items-center px-2.5 rounded-full text-xs font-medium select-pill"
                  style={{
                    '--pill-bg': sc.bg,
                    '--pill-text': sc.text,
                    '--pill-dark-bg': sc.darkBg,
                    '--pill-dark-text': sc.darkText,
                    backgroundColor: 'var(--pill-bg)',
                    color: 'var(--pill-text)',
                    height: 22,
                    lineHeight: '22px',
                  } as React.CSSProperties}
                >
                  {choice.title}
                </span>
                {isSelected && (
                  <Check size={14} style={{ color: colors.primary, marginLeft: 'auto' }} />
                )}
              </button>
            );
          })}
          {!exactMatch && search.trim() && canCreate && (
            <button
              className="w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors text-xs"
              style={{ color: colors.primary }}
              onClick={handleCreateOption}
            >
              Create &ldquo;{search.trim()}&rdquo;
            </button>
          )}
        </div>
        {value && (
          <>
            <div style={{ height: 1, backgroundColor: colors.border }} />
            <button
              className="w-full text-left px-3 py-1.5 text-xs transition-colors shrink-0"
              style={{ color: colors.muted }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.hoverRow)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              onClick={() => onCommit(null)}
            >
              Clear
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function MultiSelectCellEditor({ value, field, onCommit, onCancel, onFieldUpdate }: CellEditorProps) {
  const [localChoices, setLocalChoices] = useState<SelectChoice[]>(field.options?.choices || []);
  const [selected, setSelected] = useState<string[]>(
    Array.isArray(value) ? value : value ? [value] : [],
  );
  const [search, setSearch] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const searchRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const colors = useGridColors();
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number }>({ top: 0, left: 0 });
  const canCreate = field.options?.allowNewOptions !== false;

  const filtered = search
    ? localChoices.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
    : localChoices;

  const exactMatch = search
    ? localChoices.some((c) => c.title.toLowerCase() === search.trim().toLowerCase())
    : true;

  const toggle = useCallback((title: string) => {
    setSelected((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title],
    );
  }, []);

  const handleCreateOption = useCallback(() => {
    const trimmed = search.trim();
    if (!trimmed || !canCreate) return;
    const randomColor = SELECT_COLOR_NAMES[Math.floor(Math.random() * SELECT_COLOR_NAMES.length)];
    const newChoice: SelectChoice = { title: trimmed, color: randomColor };
    const updatedChoices = [...localChoices, newChoice];
    setLocalChoices(updatedChoices);
    onFieldUpdate?.(field.id, field.table_id, { choices: updatedChoices } as any);
    setSelected((prev) => [...prev, trimmed]);
    setSearch('');
  }, [search, canCreate, localChoices, field.id, field.table_id, onFieldUpdate]);

  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useLayoutEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - 236));
      const opensUp = rect.bottom + 320 > window.innerHeight && rect.top > 320;
      setPos(opensUp ? { bottom: window.innerHeight - rect.top + 1, left } : { top: rect.bottom + 1, left });
    }
  }, []);

  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        anchorRef.current && !anchorRef.current.contains(target)
      ) {
        onCommit(selectedRef.current);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onCommit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < filtered.length) {
        toggle(filtered[focusedIndex].title);
      } else if (!exactMatch && search.trim() && canCreate) {
        handleCreateOption();
      }
    }
  }, [onCancel, filtered, focusedIndex, exactMatch, search, canCreate, handleCreateOption, toggle]);

  return (
    <>
      <div ref={anchorRef} className="flex items-center w-full h-full min-w-0 overflow-hidden">
        {selected.length > 0 ? <MultiSelectCellRenderer value={selected} field={field} record={{ id: '' } as any} rowHeight="short" /> : null}
      </div>
      {createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: pos.top,
            bottom: pos.bottom,
            left: pos.left,
            zIndex: 9999,
            minWidth: 220,
            maxHeight: 300,
            backgroundColor: colors.cellEditorBg,
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          }}
        >
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1 px-2 pt-2">
              {selected.map((title) => {
                const choice = localChoices.find((c) => c.title === title);
                const sc = getSelectColorStyle(choice?.color || 'grayLight2');
                return (
                  <span
                    key={title}
                    className="inline-flex items-center gap-1 px-2 rounded-full text-xs font-medium select-pill"
                    style={{
                      '--pill-bg': sc.bg,
                      '--pill-text': sc.text,
                      '--pill-dark-bg': sc.darkBg,
                      '--pill-dark-text': sc.darkText,
                      backgroundColor: 'var(--pill-bg)',
                      color: 'var(--pill-text)',
                      height: 22,
                      lineHeight: '22px',
                    } as React.CSSProperties}
                  >
                    {title}
                    <X
                      size={12}
                      className="cursor-pointer opacity-60 hover:opacity-100"
                      onClick={() => toggle(title)}
                    />
                  </span>
                );
              })}
            </div>
          )}
          <div className="px-2 pt-2 pb-1 shrink-0">
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Find or create an option"
              className="kd-flat-input w-full px-2 py-1.5 text-xs rounded outline-none bg-transparent"
              style={{
                border: `1px solid ${colors.border}`,
                color: colors.text,
              }}
            />
          </div>
          <div className="overflow-y-auto py-1" style={{ maxHeight: 200 }}>
            {filtered.map((choice, idx) => {
              const sc = getSelectColorStyle(choice.color);
              const isFocused = idx === focusedIndex;
              const isChecked = selected.includes(choice.title);
              return (
                <button
                  key={choice.title}
                  className="w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors"
                  style={{
                    backgroundColor: isFocused ? colors.hoverRow : 'transparent',
                  }}
                  onMouseEnter={() => setFocusedIndex(idx)}
                  onClick={() => toggle(choice.title)}
                >
                  <span
                    className="inline-flex items-center justify-center w-4 h-4 rounded border text-3xs"
                    style={{
                      borderColor: isChecked ? colors.primary : colors.muted,
                      backgroundColor: isChecked ? colors.primary : 'transparent',
                      color: isChecked ? '#fff' : 'transparent',
                    }}
                  >
                    {isChecked ? '✓' : ''}
                  </span>
                  <span
                    className="inline-flex items-center px-2.5 rounded-full text-xs font-medium select-pill"
                    style={{
                      '--pill-bg': sc.bg,
                      '--pill-text': sc.text,
                      '--pill-dark-bg': sc.darkBg,
                      '--pill-dark-text': sc.darkText,
                      backgroundColor: 'var(--pill-bg)',
                      color: 'var(--pill-text)',
                      height: 22,
                      lineHeight: '22px',
                    } as React.CSSProperties}
                  >
                    {choice.title}
                  </span>
                </button>
              );
            })}
            {!exactMatch && search.trim() && canCreate && (
              <button
                className="w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors text-xs"
                style={{ color: colors.primary }}
                onClick={handleCreateOption}
              >
                Create &ldquo;{search.trim()}&rdquo;
              </button>
            )}
          </div>
          {selected.length > 0 && (
            <>
              <div style={{ height: 1, backgroundColor: colors.border }} />
              <button
                className="w-full text-left px-3 py-1.5 text-xs transition-colors shrink-0"
                style={{ color: colors.muted }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.hoverRow)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                onClick={() => {
                  setSelected([]);
                  onCommit([]);
                }}
              >
                Clear all
              </button>
            </>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}


export function PercentCellEditor({ value, onCommit, onCancel }: CellEditorProps) {
  return <NumericEditor value={value} onCommit={onCommit} onCancel={onCancel} suffix="%" placeholder="0" />;
}

export function AttachmentCellEditor({ value, field, onCommit, onCancel }: CellEditorProps) {
  const [open, setOpen] = useState(true);
  const attachments: AttachmentMeta[] = Array.isArray(value) ? value : [];
  const ref = useRef<HTMLDivElement>(null);

  return (
    <>
      <div
        ref={ref}
        tabIndex={0}
        className="flex items-center gap-1 px-2 h-full cursor-pointer text-xs outline-none text-[#6A7184] dark:text-[hsl(220,20%,55%)]"
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          if (e.key === 'Tab') onCancel();
        }}
      >
        <Paperclip size={12} />
        <span>{attachments.length} file{attachments.length !== 1 ? 's' : ''}</span>
      </div>
      <AttachmentManager
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) onCancel();
        }}
        value={attachments}
        onCommit={(updated) => {
          onCommit(updated);
        }}
        storagePath={field.id}
      />
    </>
  );
}

/**
 * LinksCellEditor - opens the LinkedRecordPicker dialog.
 * The actual picker is rendered by the grid when it detects a Links field
 * entering edit mode. This editor acts as a no-op placeholder so the grid
 * knows to trigger the picker dialog instead.
 */
export function LinksCellEditor({ onCancel }: CellEditorProps) {
  // The grid component intercepts Links editing and opens LinkedRecordPicker.
  // This component renders nothing; onCancel is called via effect to avoid
  // side effects during render.
  useEffect(() => {
    onCancel();
  }, [onCancel]);
  return null;
}

function wrapSelection(textarea: HTMLTextAreaElement, before: string, after: string, setText: (t: string) => void) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const val = textarea.value;
  const selected = val.slice(start, end);
  const newVal = val.slice(0, start) + before + selected + after + val.slice(end);
  setText(newVal);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.selectionStart = start + before.length;
    textarea.selectionEnd = end + before.length;
  });
}

function insertLinePrefix(textarea: HTMLTextAreaElement, prefix: string, setText: (t: string) => void) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const val = textarea.value;
  const lineStart = val.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = val.indexOf('\n', end);
  const blockEnd = lineEnd === -1 ? val.length : lineEnd;
  const block = val.slice(lineStart, blockEnd);
  const lines = block.split('\n');
  const prefixed = lines.map((line, i) => {
    if (prefix === '1. ') return `${i + 1}. ${line}`;
    if (prefix === 'a. ') return `${String.fromCharCode(97 + (i % 26))}. ${line}`;
    return `${prefix}${line}`;
  }).join('\n');
  const newVal = val.slice(0, lineStart) + prefixed + val.slice(blockEnd);
  setText(newVal);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.selectionStart = lineStart;
    textarea.selectionEnd = lineStart + prefixed.length;
  });
}

export function LongTextCellEditor({ value, onCommit, onCancel }: CellEditorProps) {
  const [text, setText] = useState(value ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const committedRef = useRef(false);

  useLayoutEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const cell = el.closest('[data-cell-id]') as HTMLElement | null;
    const rect = cell?.getBoundingClientRect() ?? el.getBoundingClientRect();
    const editorWidth = Math.max(360, rect.width);
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow > 260 ? rect.bottom : rect.top - 260;
    setPos({ top: Math.max(4, top), left: Math.max(4, Math.min(rect.left, window.innerWidth - editorWidth - 8)), width: editorWidth });
  }, []);

  useEffect(() => {
    if (!pos) return;
    ref.current?.focus();
    const el = ref.current;
    if (el) {
      el.selectionStart = el.value.length;
      el.selectionEnd = el.value.length;
    }
  }, [pos]);

  const doCommit = useCallback((val: string) => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(val);
  }, [onCommit]);

  const btnClass = "px-1.5 py-0.5 text-2xs text-[#6A7184] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(220,20%,14%)] rounded";

  const editor = pos ? createPortal(
    <div
      className="fixed z-[9999] shadow-xl rounded-md bg-white dark:bg-[hsl(220,20%,10%)]"
      style={{ top: pos.top, left: pos.left, width: pos.width, border: '2px solid #2D7FF9' }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-[#E5E5E5] dark:border-[hsl(220,20%,18%)]">
        <button type="button" className={`${btnClass} font-bold`} onMouseDown={(e) => { e.preventDefault(); if (ref.current) wrapSelection(ref.current, '**', '**', setText); }} title="Bold (⌘B)">B</button>
        <button type="button" className={`${btnClass} italic`} onMouseDown={(e) => { e.preventDefault(); if (ref.current) wrapSelection(ref.current, '*', '*', setText); }} title="Italic (⌘I)">I</button>
        <button type="button" className={`${btnClass} line-through`} onMouseDown={(e) => { e.preventDefault(); if (ref.current) wrapSelection(ref.current, '~~', '~~', setText); }} title="Strikethrough">S</button>
        <div className="w-px h-3 bg-[#E5E5E5] dark:bg-[hsl(220,20%,18%)] mx-0.5" />
        <button type="button" className={btnClass} onMouseDown={(e) => { e.preventDefault(); if (ref.current) wrapSelection(ref.current, '`', '`', setText); }} title="Code">&lt;/&gt;</button>
        <div className="w-px h-3 bg-[#E5E5E5] dark:bg-[hsl(220,20%,18%)] mx-0.5" />
        <button type="button" className={btnClass} onMouseDown={(e) => { e.preventDefault(); if (ref.current) insertLinePrefix(ref.current, '• ', setText); }} title="Bullet list">•</button>
        <button type="button" className={btnClass} onMouseDown={(e) => { e.preventDefault(); if (ref.current) insertLinePrefix(ref.current, '1. ', setText); }} title="Numbered list">1.</button>
        <button type="button" className={btnClass} onMouseDown={(e) => { e.preventDefault(); if (ref.current) insertLinePrefix(ref.current, 'a. ', setText); }} title="Lettered list">a.</button>
      </div>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doCommit(text); }
          if (e.key === 'Tab') { e.preventDefault(); doCommit(text); }
          if (e.key === 'b' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); wrapSelection(e.currentTarget, '**', '**', setText); }
          if (e.key === 'i' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); wrapSelection(e.currentTarget, '*', '*', setText); }
        }}
        onBlur={(e) => {
          if (e.relatedTarget?.closest?.('[data-longtext-toolbar]')) return;
          doCommit(text);
        }}
        rows={8}
        className="w-full p-2.5 outline-none resize-y border-none bg-transparent"
        style={{ fontSize: 13, lineHeight: '20px', color: 'inherit', minHeight: 160 }}
      />
      <div className="px-2.5 pb-1.5 text-3xs text-[#9AA2AF]">Enter to save · Shift+Enter for new line · Esc to cancel</div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <div ref={anchorRef} className="w-full h-full" />
      {editor}
    </>
  );
}

export function DecimalCellEditor({ value, field, onCommit, onCancel }: CellEditorProps) {
  const places = field.options?.precision ?? 2;
  return <NumericEditor value={value} onCommit={onCommit} onCancel={onCancel} placeholder={places > 0 ? `0.${'0'.repeat(places)}` : '0'} />;
}

export function DateTimeCellEditor({ value, field, onCommit, onCancel }: CellEditorProps) {
  return (
    <DateEditor
      value={value}
      mode="datetime"
      use12h={field.options?.use12h !== false}
      onCommit={onCommit}
      onCancel={onCancel}
    />
  );
}

export function TimeCellEditor({ value, onCommit, onCancel }: CellEditorProps) {
  const [time, setTime] = useState(value ?? '');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <input
      ref={ref}
      type="time"
      step="1"
      value={time}
      onChange={(e) => setTime(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(time || null);
        if (e.key === 'Escape') onCancel();
        if (e.key === 'Tab') { e.preventDefault(); onCommit(time || null); }
      }}
      onBlur={() => onCommit(time || null)}
      className="w-full h-full min-w-0 px-0 outline-none border-0 rounded-none shadow-none bg-transparent"
      style={{ fontSize: 13, color: 'inherit' }}
    />
  );
}

interface UserValue {
  id?: string;
  email?: string;
  name?: string;
}

function normalizeUserValue(value: unknown): UserValue[] {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value.filter(Boolean) as UserValue[];
  if (typeof value === 'object') return [value as UserValue];
  return [{ email: String(value), name: String(value) }];
}

function sameUser(a: UserValue, b: { id?: string; email?: string }) {
  if (a.id && b.id) return a.id === b.id;
  return !!a.email && a.email === b.email;
}

export function UserCellEditor({ value, field, onCommit, onCancel }: CellEditorProps) {
  const { data: users = [], isLoading } = useWorkspaceUsers();
  const [search, setSearch] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const searchRef = useRef<HTMLInputElement>(null);
  const colors = useGridColors();

  const allowMultiple = !!field?.options?.allowMultiple;
  const [selected, setSelected] = useState<UserValue[]>(() => normalizeUserValue(value));

  const filtered = search
    ? users.filter(
        (u) =>
          u.full_name.toLowerCase().includes(search.toLowerCase()) ||
          u.email.toLowerCase().includes(search.toLowerCase()),
      )
    : users;

  const commitValue = useCallback(
    (next: UserValue[]) => {
      if (next.length === 0) {
        onCommit(allowMultiple ? [] : null);
      } else if (allowMultiple) {
        onCommit(next);
      } else {
        onCommit(next[0]);
      }
    },
    [allowMultiple, onCommit],
  );

  const toggleUser = useCallback(
    (u: { id: string; email: string; full_name: string }) => {
      const entry: UserValue = { id: u.id, email: u.email, name: u.full_name };
      if (!allowMultiple) {
        commitValue([entry]);
        return;
      }
      const exists = selected.some((s) => sameUser(s, entry));
      setSelected(exists ? selected.filter((s) => !sameUser(s, entry)) : [...selected, entry]);
    },
    [allowMultiple, commitValue, selected],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < filtered.length) {
          toggleUser(filtered[focusedIndex]);
        } else if (e.key === 'Tab') {
          onCancel();
        }
      }
    },
    [onCancel, filtered, focusedIndex, toggleUser],
  );

  return (
    <Popover open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <PopoverTrigger asChild>
        <div className="w-full h-full" />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={1}
        className="!w-auto !border-none !p-0 !shadow-none"
        style={{
          minWidth: 240,
          maxHeight: 300,
          backgroundColor: colors.cellEditorBg,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        }}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          setTimeout(() => searchRef.current?.focus(), 0);
        }}
      >
        <div className="px-2 pt-2 pb-1 shrink-0">
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search people..."
            className="w-full px-2 py-1.5 text-xs rounded outline-none bg-transparent"
            style={{
              border: `1px solid ${colors.border}`,
              color: colors.text,
            }}
          />
        </div>
        <div className="overflow-y-auto py-1" style={{ maxHeight: 200 }}>
          {isLoading && (
            <div className="px-3 py-2 text-xs" style={{ color: colors.muted }}>
              Loading people...
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="px-3 py-2 text-xs" style={{ color: colors.muted }}>
              No people found
            </div>
          )}
          {filtered.map((user, idx) => {
            const isFocused = idx === focusedIndex;
            const isSelected = selected.some((s) => sameUser(s, { id: user.id, email: user.email }));
            const initial = (user.full_name || user.email).charAt(0).toUpperCase();
            return (
              <button
                key={user.id}
                className="w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors"
                style={{
                  backgroundColor: isFocused ? colors.hoverRow : 'transparent',
                }}
                onMouseEnter={() => setFocusedIndex(idx)}
                onClick={() => toggleUser(user)}
              >
                <span
                  className="shrink-0 flex items-center justify-center rounded-full text-white"
                  style={{
                    width: 22,
                    height: 22,
                    fontSize: 11,
                    fontWeight: 600,
                    backgroundColor: colors.avatarBg || '#6366F1',
                  }}
                >
                  {initial}
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-medium truncate" style={{ color: colors.text }}>
                    {user.full_name}
                  </span>
                  <span className="text-2xs truncate" style={{ color: colors.muted }}>
                    {user.email}
                  </span>
                </div>
                {isSelected && (
                  <Check size={14} style={{ color: colors.primary, marginLeft: 'auto' }} />
                )}
              </button>
            );
          })}
        </div>
        {selected.length > 0 && (
          <>
            <div style={{ height: 1, backgroundColor: colors.border }} />
            <button
              className="w-full text-left px-3 py-1.5 text-xs transition-colors shrink-0"
              style={{ color: colors.muted }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.hoverRow)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              onClick={() => {
                setSelected([]);
                commitValue([]);
              }}
            >
              Clear
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function LinkedTasksCellEditor({ value, onCommit, onCancel }: CellEditorProps) {
  const { data: tasks = [], isLoading } = usePlatformTasks();
  const [search, setSearch] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const searchRef = useRef<HTMLInputElement>(null);
  const colors = useGridColors();
  const [selected, setSelected] = useState<LinkedTaskValue[]>(() => normalizeLinkedTasks(value));

  const filtered = search
    ? tasks.filter((t) => t.title.toLowerCase().includes(search.toLowerCase()))
    : tasks;

  const toggle = useCallback((task: { id: string; title: string }) => {
    setSelected((prev) =>
      prev.some((s) => s.id === task.id)
        ? prev.filter((s) => s.id !== task.id)
        : [...prev, { id: task.id, title: task.title }],
    );
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < filtered.length) toggle(filtered[focusedIndex]);
      }
    },
    [onCancel, filtered, focusedIndex, toggle],
  );

  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) onCommit(selected);
      }}
    >
      <PopoverTrigger asChild>
        <div className="w-full h-full" />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={1}
        className="!w-auto !border-none !p-0 !shadow-none"
        style={{
          minWidth: 280,
          maxHeight: 320,
          backgroundColor: colors.cellEditorBg,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        }}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          setTimeout(() => searchRef.current?.focus(), 0);
        }}
      >
        <div className="px-2 pt-2 pb-1 shrink-0">
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tasks..."
            className="w-full px-2 py-1.5 text-xs rounded outline-none bg-transparent"
            style={{ border: `1px solid ${colors.border}`, color: colors.text }}
          />
        </div>
        <div className="overflow-y-auto py-1" style={{ maxHeight: 220 }}>
          {isLoading && (
            <div className="px-3 py-2 text-xs" style={{ color: colors.muted }}>Loading tasks...</div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="px-3 py-2 text-xs" style={{ color: colors.muted }}>No tasks found</div>
          )}
          {filtered.map((task, idx) => {
            const isFocused = idx === focusedIndex;
            const isSelected = selected.some((s) => s.id === task.id);
            return (
              <button
                key={task.id}
                className="w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors"
                style={{ backgroundColor: isFocused ? colors.hoverRow : 'transparent' }}
                onMouseEnter={() => setFocusedIndex(idx)}
                onClick={() => toggle(task)}
              >
                <span className="text-xs truncate flex-1" style={{ color: colors.text }}>
                  {task.title}
                </span>
                {task.status && (
                  <span className="text-3xs shrink-0" style={{ color: colors.muted }}>
                    {task.status}
                  </span>
                )}
                {isSelected && <Check size={14} style={{ color: colors.primary }} />}
              </button>
            );
          })}
        </div>
        {selected.length > 0 && (
          <>
            <div style={{ height: 1, backgroundColor: colors.border }} />
            <button
              className="w-full text-left px-3 py-1.5 text-xs transition-colors shrink-0"
              style={{ color: colors.muted }}
              onClick={() => { setSelected([]); onCommit([]); }}
            >
              Clear
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

