import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Paperclip, Star, Check, X } from 'lucide-react';
import type { FieldMeta, SelectChoice } from '@/features/database/types';
import { PILL_COLORS, SELECT_COLOR_NAMES, SELECT_COLORS } from '@/features/database/types';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { AttachmentManager, type AttachmentMeta } from '../AttachmentManager';
import { useGridColors } from '../../hooks/useGridColors';

interface CellEditorProps {
  value: any;
  field: FieldMeta;
  onCommit: (value: any) => void;
  onCancel: () => void;
  onFieldUpdate?: (fieldId: string, tableId: string, updates: Partial<FieldMeta['options']>) => void;
}

function getPillColor(colorName: string) {
  return PILL_COLORS.find((c) => c.name === colorName) || PILL_COLORS[7];
}

export function TextCellEditor({ value, field, onCommit, onCancel }: CellEditorProps) {
  const [text, setText] = useState(value ?? '');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      type="text"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(text);
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={() => onCommit(text)}
      className="w-full h-full px-2 outline-none bg-white dark:bg-[hsl(200,30%,10%)]"
      style={{ fontSize: 14, color: 'inherit' }}
    />
  );
}

export function NumberCellEditor({ value, field, onCommit, onCancel }: CellEditorProps) {
  const [num, setNum] = useState(value ?? '');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      type="number"
      value={num}
      onChange={(e) => setNum(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(num === '' ? null : Number(num));
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={() => onCommit(num === '' ? null : Number(num))}
      className="w-full h-full px-2 outline-none bg-white dark:bg-[hsl(200,30%,10%)] text-right"
      style={{ fontSize: 14, color: 'inherit' }}
    />
  );
}

export function CurrencyCellEditor({ value, field, onCommit, onCancel }: CellEditorProps) {
  const [num, setNum] = useState(value ?? '');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      type="number"
      step="0.01"
      value={num}
      onChange={(e) => setNum(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(num === '' ? null : Number(num));
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={() => onCommit(num === '' ? null : Number(num))}
      className="w-full h-full px-2 outline-none bg-white dark:bg-[hsl(200,30%,10%)] text-right"
      style={{ fontSize: 14, color: 'inherit' }}
    />
  );
}

export function DateCellEditor({ value, onCommit, onCancel }: CellEditorProps) {
  const initial = value ? new Date(value) : undefined;
  const [selected, setSelected] = useState<Date | undefined>(initial);
  const colors = useGridColors();

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
          backgroundColor: colors.cellEditorBg,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(day) => {
            setSelected(day);
            if (day) {
              onCommit(day.toISOString().split('T')[0]);
            }
          }}
          defaultMonth={selected || new Date()}
        />
        <div style={{ height: 1, backgroundColor: colors.border }} />
        <div className="flex items-center justify-between px-3 py-2">
          <button
            className="text-xs transition-colors"
            style={{ color: colors.muted }}
            onClick={() => onCommit(null)}
          >
            Clear
          </button>
          <button
            className="text-xs px-3 py-1 rounded"
            style={{ backgroundColor: colors.primary, color: '#fff' }}
            onClick={() => {
              const today = new Date();
              setSelected(today);
              onCommit(today.toISOString().split('T')[0]);
            }}
          >
            Today
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
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
      type="number"
      min={1000}
      max={9999}
      value={year}
      onChange={(e) => setYear(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={commit}
      placeholder="YYYY"
      className="w-full h-full px-2 outline-none border-none bg-white dark:bg-[hsl(200,30%,10%)]"
      style={{ fontSize: 13, color: 'inherit' }}
    />
  );
}

export function DurationCellEditor({ value, onCommit, onCancel }: CellEditorProps) {
  const totalSeconds = Number(value) || 0;
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  const [text, setText] = useState(`${h}:${m}:${s}`);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  function parseDuration(str: string): number | null {
    const parts = str.split(':').map(Number);
    if (parts.some(isNaN)) return null;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return null;
  }

  return (
    <input
      ref={ref}
      type="text"
      placeholder="HH:MM:SS"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(parseDuration(text));
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={() => onCommit(parseDuration(text))}
      className="w-full h-full px-2 outline-none border-none bg-white dark:bg-[hsl(200,30%,10%)] text-right"
      style={{ fontSize: 13, color: 'inherit', fontVariantNumeric: 'tabular-nums' }}
    />
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailCellEditor({ value, onCommit, onCancel }: CellEditorProps) {
  const [text, setText] = useState(value ?? '');
  const [invalid, setInvalid] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = useCallback(() => {
    const trimmed = String(text).trim();
    setInvalid(!!trimmed && !EMAIL_RE.test(trimmed));
    onCommit(text);
  }, [text, onCommit]);

  return (
    <div className="relative w-full h-full">
      <input
        ref={ref}
        type="email"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') onCancel();
        }}
        onBlur={commit}
        className="w-full h-full px-2 outline-none border-none bg-white dark:bg-[hsl(200,30%,10%)]"
        style={{
          fontSize: 13,
          color: 'inherit',
          boxShadow: invalid ? 'inset 0 0 0 2px #EF4444' : undefined,
        }}
      />
      {invalid && (
        <div className="absolute left-0 top-full z-50 bg-white dark:bg-[hsl(200,30%,10%)] border border-red-300 rounded px-2 py-1 shadow text-[11px] text-red-600 whitespace-nowrap mt-0.5">
          Enter a valid email address
        </div>
      )}
    </div>
  );
}

export function URLCellEditor({ value, onCommit, onCancel }: CellEditorProps) {
  const [text, setText] = useState(value ?? '');
  const [invalid, setInvalid] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = useCallback(() => {
    const trimmed = String(text).trim();
    let isValid = true;
    if (trimmed) {
      try { new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`); }
      catch { isValid = false; }
    }
    setInvalid(!!trimmed && !isValid);
    onCommit(text);
  }, [text, onCommit]);

  return (
    <div className="relative w-full h-full">
      <input
        ref={ref}
        type="url"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') onCancel();
        }}
        onBlur={commit}
        className="w-full h-full px-2 outline-none border-none bg-white dark:bg-[hsl(200,30%,10%)]"
        style={{
          fontSize: 13,
          color: 'inherit',
          boxShadow: invalid ? 'inset 0 0 0 2px #EF4444' : undefined,
        }}
      />
      {invalid && (
        <div className="absolute left-0 top-full z-50 bg-white dark:bg-[hsl(200,30%,10%)] border border-red-300 rounded px-2 py-1 shadow text-[11px] text-red-600 whitespace-nowrap mt-0.5">
          Enter a valid URL
        </div>
      )}
    </div>
  );
}

export function PhoneNumberCellEditor({ value, onCommit, onCancel }: CellEditorProps) {
  const [text, setText] = useState(value ?? '');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      type="tel"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(text);
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={() => onCommit(text)}
      className="w-full h-full px-2 outline-none border-none bg-white dark:bg-[hsl(200,30%,10%)]"
      style={{ fontSize: 13, color: 'inherit' }}
    />
  );
}

export function RatingCellEditor({ value, field, onCommit }: CellEditorProps) {
  const max = field.options?.max || 5;
  const rating = Number(value) || 0;
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div ref={ref} className="flex items-center gap-0.5 px-2 h-full bg-white dark:bg-[hsl(200,30%,10%)]">
      {Array.from({ length: max }, (_, i) => (
        <button
          key={i}
          type="button"
          className="p-0 border-none bg-transparent cursor-pointer"
          onClick={() => onCommit(i + 1 === rating ? 0 : i + 1)}
        >
          <Star
            size={16}
            fill={i < rating ? '#F59E0B' : 'none'}
            color={i < rating ? '#F59E0B' : '#E7E7E9'}
            strokeWidth={1.5}
          />
        </button>
      ))}
    </div>
  );
}

function getSelectColorStyle(colorName: string) {
  const sc = SELECT_COLORS[colorName] || SELECT_COLORS.grayLight2;
  return sc;
}

export function SelectCellEditor({ value, field, onCommit, onCancel, onFieldUpdate }: CellEditorProps) {
  const choices: SelectChoice[] = field.options?.choices || [];
  const [search, setSearch] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const searchRef = useRef<HTMLInputElement>(null);
  const colors = useGridColors();

  const filtered = search
    ? choices.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
    : choices;

  const exactMatch = search
    ? choices.some((c) => c.title.toLowerCase() === search.trim().toLowerCase())
    : true;

  const handleCreateOption = useCallback(() => {
    const trimmed = search.trim();
    if (!trimmed) return;
    const randomColor = SELECT_COLOR_NAMES[Math.floor(Math.random() * SELECT_COLOR_NAMES.length)];
    const newChoice: SelectChoice = { title: trimmed, color: randomColor };
    const updatedChoices = [...choices, newChoice];
    onFieldUpdate?.(field.id, field.table_id, { choices: updatedChoices } as Partial<FieldMeta['options']>);
    onCommit(trimmed);
  }, [search, choices, field.id, field.table_id, onFieldUpdate, onCommit]);

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
      } else if (!exactMatch && search.trim()) {
        handleCreateOption();
      }
    }
  }, [onCancel, filtered, focusedIndex, exactMatch, search, handleCreateOption, onCommit]);

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
            className="w-full px-2 py-1.5 text-xs rounded outline-none bg-transparent"
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
          {!exactMatch && search.trim() && (
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
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

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
    if (!trimmed) return;
    const randomColor = SELECT_COLOR_NAMES[Math.floor(Math.random() * SELECT_COLOR_NAMES.length)];
    const newChoice: SelectChoice = { title: trimmed, color: randomColor };
    const updatedChoices = [...localChoices, newChoice];
    setLocalChoices(updatedChoices);
    onFieldUpdate?.(field.id, field.table_id, { choices: updatedChoices } as any);
    setSelected((prev) => [...prev, trimmed]);
    setSearch('');
  }, [search, localChoices, field.id, field.table_id, onFieldUpdate]);

  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useLayoutEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 1, left: rect.left });
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
      onCommit(selectedRef.current);
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
      } else if (!exactMatch && search.trim()) {
        handleCreateOption();
      }
    }
  }, [onCommit, filtered, focusedIndex, exactMatch, search, handleCreateOption, toggle]);

  return (
    <>
      <div ref={anchorRef} className="w-full h-full" />
      {createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: pos.top,
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
              className="w-full px-2 py-1.5 text-xs rounded outline-none bg-transparent"
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
                    className="inline-flex items-center justify-center w-4 h-4 rounded border text-[10px]"
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
            {!exactMatch && search.trim() && (
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
  const [num, setNum] = useState(value ?? '');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <div className="flex items-center w-full h-full">
      <input ref={ref} type="number" value={num} onChange={(e) => setNum(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onCommit(num === '' ? null : Number(num)); if (e.key === 'Escape') onCancel(); }}
        onBlur={() => onCommit(num === '' ? null : Number(num))}
        className="w-full h-full px-2 outline-none border-none bg-white dark:bg-[hsl(200,30%,10%)] text-right" style={{ fontSize: 13 }}
      />
      <span className="pr-2 text-xs text-[#9AA2AF]">%</span>
    </div>
  );
}

export function AttachmentCellEditor({ value, field, onCommit, onCancel }: CellEditorProps) {
  const [open, setOpen] = useState(true);
  const attachments: AttachmentMeta[] = Array.isArray(value) ? value : [];

  return (
    <>
      {/* Inline trigger showing count */}
      <div
        className="flex items-center gap-1 px-2 h-full cursor-pointer text-xs"
        style={{ color: '#6A7184' }}
        onClick={() => setOpen(true)}
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
  // This component renders nothing; onCancel is called immediately.
  onCancel();
  return null;
}

export function LongTextCellEditor({ value, field, onCommit, onCancel }: CellEditorProps) {
  const [text, setText] = useState(value ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const el = ref.current;
    if (el) {
      el.selectionStart = el.value.length;
      el.selectionEnd = el.value.length;
    }
  }, []);

  return (
    <div className="absolute left-0 top-0 z-50 w-64 shadow-lg rounded border bg-white dark:bg-[hsl(200,30%,10%)]" style={{ minHeight: 80 }}>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onCommit(text);
        }}
        onBlur={() => onCommit(text)}
        rows={4}
        className="w-full p-2 outline-none resize-y border-none bg-white dark:bg-[hsl(200,30%,10%)]"
        style={{ fontSize: 14, color: 'inherit' }}
      />
    </div>
  );
}

export function DecimalCellEditor({ value, field, onCommit, onCancel }: CellEditorProps) {
  const [num, setNum] = useState(value ?? '');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      type="number"
      step="any"
      value={num}
      onChange={(e) => setNum(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(num === '' ? null : Number(num));
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={() => onCommit(num === '' ? null : Number(num))}
      className="w-full h-full px-2 outline-none bg-white dark:bg-[hsl(200,30%,10%)] text-right"
      style={{ fontSize: 14, color: 'inherit' }}
    />
  );
}

export function DateTimeCellEditor({ value, onCommit, onCancel }: CellEditorProps) {
  const initialDate = value ? new Date(value) : undefined;
  const initialHour = initialDate ? String(initialDate.getHours()).padStart(2, '0') : '12';
  const initialMin = initialDate ? String(initialDate.getMinutes()).padStart(2, '0') : '00';
  const [selected, setSelected] = useState<Date | undefined>(initialDate);
  const [hour, setHour] = useState(initialHour);
  const [minute, setMinute] = useState(initialMin);
  const colors = useGridColors();

  const commitDateTime = useCallback((day: Date | undefined, h: string, m: string) => {
    if (!day) { onCommit(null); return; }
    const d = new Date(day);
    d.setHours(parseInt(h, 10) || 0, parseInt(m, 10) || 0, 0, 0);
    onCommit(d.toISOString());
  }, [onCommit]);

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
          backgroundColor: colors.cellEditorBg,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(day) => setSelected(day)}
          defaultMonth={selected || new Date()}
        />
        <div style={{ height: 1, backgroundColor: colors.border }} />
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="text-xs" style={{ color: colors.muted }}>Time</span>
          <input
            type="number"
            min={0}
            max={23}
            value={hour}
            onChange={(e) => setHour(e.target.value)}
            className="w-10 text-center text-xs rounded outline-none bg-transparent"
            style={{ border: `1px solid ${colors.border}`, color: colors.text, padding: '2px 4px' }}
          />
          <span style={{ color: colors.muted }}>:</span>
          <input
            type="number"
            min={0}
            max={59}
            value={minute}
            onChange={(e) => setMinute(e.target.value)}
            className="w-10 text-center text-xs rounded outline-none bg-transparent"
            style={{ border: `1px solid ${colors.border}`, color: colors.text, padding: '2px 4px' }}
          />
        </div>
        <div style={{ height: 1, backgroundColor: colors.border }} />
        <div className="flex items-center justify-between px-3 py-2">
          <button
            className="text-xs transition-colors"
            style={{ color: colors.muted }}
            onClick={() => onCommit(null)}
          >
            Clear
          </button>
          <button
            className="text-xs px-3 py-1 rounded"
            style={{ backgroundColor: colors.primary, color: '#fff' }}
            onClick={() => commitDateTime(selected, hour, minute)}
          >
            Done
          </button>
        </div>
      </PopoverContent>
    </Popover>
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
      }}
      onBlur={() => onCommit(time || null)}
      className="w-full h-full px-2 outline-none border-none bg-white dark:bg-[hsl(200,30%,10%)]"
      style={{ fontSize: 13, color: 'inherit' }}
    />
  );
}

export function getCellEditor(uiType: string) {
  switch (uiType) {
    case 'SingleLineText':
      return TextCellEditor;
    case 'LongText':
      return LongTextCellEditor;
    case 'Number':
      return NumberCellEditor;
    case 'Decimal':
      return DecimalCellEditor;
    case 'Percent':
      return PercentCellEditor;
    case 'Currency':
      return CurrencyCellEditor;
    case 'Date':
      return DateCellEditor;
    case 'Year':
      return YearCellEditor;
    case 'DateTime':
      return DateTimeCellEditor;
    case 'Time':
      return TimeCellEditor;
    case 'Duration':
      return DurationCellEditor;
    case 'Email':
      return EmailCellEditor;
    case 'URL':
      return URLCellEditor;
    case 'PhoneNumber':
      return PhoneNumberCellEditor;
    case 'Rating':
      return RatingCellEditor;
    case 'SingleSelect':
      return SelectCellEditor;
    case 'MultiSelect':
      return MultiSelectCellEditor;
    case 'Attachment':
      return AttachmentCellEditor;
    case 'Links':
      return LinksCellEditor;
    case 'Barcode':
      return TextCellEditor;
    case 'User':
      return TextCellEditor;
    case 'Button':
      return null;
    case 'Checkbox':
      return null;
    case 'Formula':
    case 'Lookup':
    case 'Rollup':
    case 'AutoNumber':
    case 'ID':
    case 'CreatedTime':
    case 'LastModifiedTime':
    case 'CreatedBy':
    case 'LastModifiedBy':
      return null;
    default:
      return TextCellEditor;
  }
}
