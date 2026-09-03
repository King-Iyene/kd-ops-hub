import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Paperclip, Star, Check, X, Palette } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { FieldMeta, SelectChoice } from '@/features/database/types';
import { PILL_COLORS, SELECT_COLORS, SELECT_COLOR_NAMES } from '@/features/database/types';
import { AttachmentManager, type AttachmentMeta } from '../AttachmentManager';
import { validateField, type ValidationRule } from '../../lib/validation';
import { useGridColors } from '../../hooks/useGridColors';

function useEditorValidation(value: any, field: FieldMeta) {
  return useMemo(() => {
    const rules: ValidationRule[] = (field.options as any)?.validations ?? [];
    if (rules.length === 0) return { valid: true, errors: [] as string[] };
    return validateField(value, field, rules);
  }, [value, field]);
}

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
  const { valid, errors } = useEditorValidation(text, field);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <div className="relative w-full h-full">
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
        style={{
          fontSize: 14,
          color: 'inherit',
          border: valid ? 'none' : '2px solid #EF4444',
        }}
      />
      {!valid && (
        <div className="absolute left-0 top-full z-50 bg-white dark:bg-[hsl(200,30%,10%)] border border-red-200 rounded px-2 py-1 shadow text-[11px] text-red-600 whitespace-nowrap">
          {errors[0]}
        </div>
      )}
    </div>
  );
}

export function NumberCellEditor({ value, field, onCommit, onCancel }: CellEditorProps) {
  const [num, setNum] = useState(value ?? '');
  const ref = useRef<HTMLInputElement>(null);
  const numVal = num === '' ? null : Number(num);
  const { valid, errors } = useEditorValidation(numVal, field);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <div className="relative w-full h-full">
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
        style={{
          fontSize: 14,
          color: 'inherit',
          border: valid ? 'none' : '2px solid #EF4444',
        }}
      />
      {!valid && (
        <div className="absolute right-0 top-full z-50 bg-white dark:bg-[hsl(200,30%,10%)] border border-red-200 rounded px-2 py-1 shadow text-[11px] text-red-600 whitespace-nowrap">
          {errors[0]}
        </div>
      )}
    </div>
  );
}

export function CurrencyCellEditor({ value, field, onCommit, onCancel }: CellEditorProps) {
  const [num, setNum] = useState(value ?? '');
  const ref = useRef<HTMLInputElement>(null);
  const numVal = num === '' ? null : Number(num);
  const { valid, errors } = useEditorValidation(numVal, field);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <div className="relative w-full h-full">
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
        style={{
          fontSize: 14,
          color: 'inherit',
          border: valid ? 'none' : '2px solid #EF4444',
        }}
      />
      {!valid && (
        <div className="absolute right-0 top-full z-50 bg-white dark:bg-[hsl(200,30%,10%)] border border-red-200 rounded px-2 py-1 shadow text-[11px] text-red-600 whitespace-nowrap">
          {errors[0]}
        </div>
      )}
    </div>
  );
}

export function DateCellEditor({ value, onCommit, onCancel }: CellEditorProps) {
  const colors = useGridColors();
  const initial = value ? new Date(value) : undefined;
  const [selected, setSelected] = useState<Date | undefined>(initial);

  const handleSelect = useCallback(
    (day: Date | undefined) => {
      if (!day) return;
      setSelected(day);
      const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      onCommit(iso);
    },
    [onCommit],
  );

  return (
    <Popover open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <PopoverTrigger asChild>
        <span className="sr-only">Pick date</span>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={0}
        className="p-0 w-auto"
        style={{
          backgroundColor: colors.cellEditorBg,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
        }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          defaultMonth={selected}
          initialFocus
        />
        <div className="flex items-center justify-between px-3 pb-2">
          <button
            type="button"
            className="text-xs px-2 py-1 rounded transition-colors"
            style={{ color: colors.primary }}
            onClick={() => handleSelect(new Date())}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.hoverRow)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            Today
          </button>
          {value && (
            <button
              type="button"
              className="text-xs px-2 py-1 rounded transition-colors"
              style={{ color: colors.muted }}
              onClick={() => onCommit(null)}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.hoverRow)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              Clear
            </button>
          )}
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

export function EmailCellEditor({ value, onCommit, onCancel }: CellEditorProps) {
  const [text, setText] = useState(value ?? '');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      type="email"
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

export function URLCellEditor({ value, onCommit, onCancel }: CellEditorProps) {
  const [text, setText] = useState(value ?? '');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      type="url"
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

function ColorPickerGrid({
  currentColor,
  onSelect,
}: {
  currentColor: string;
  onSelect: (colorName: string) => void;
}) {
  const colors = useGridColors();
  const groups = useMemo(() => {
    const families = ['blue', 'cyan', 'teal', 'green', 'yellow', 'orange', 'red', 'pink', 'purple', 'gray'] as const;
    return families.map((family) => {
      const shades = SELECT_COLOR_NAMES.filter((n) => n.toLowerCase().startsWith(family));
      return { family, shades };
    });
  }, []);

  return (
    <div className="grid grid-cols-4 gap-1 p-2" style={{ minWidth: 180 }}>
      {groups.map((group) =>
        group.shades.map((name) => {
          const c = SELECT_COLORS[name];
          const isActive = name === currentColor;
          return (
            <button
              key={name}
              type="button"
              className="w-7 h-7 rounded-md flex items-center justify-center transition-transform hover:scale-110"
              style={{
                backgroundColor: c.bg,
                outline: isActive ? `2px solid ${colors.primary}` : 'none',
                outlineOffset: 1,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(name);
              }}
              title={name}
            >
              {isActive && <Check size={12} style={{ color: c.text }} />}
            </button>
          );
        }),
      )}
    </div>
  );
}

export function SelectCellEditor({ value, field, onCommit, onCancel, onFieldUpdate }: CellEditorProps) {
  const choices: SelectChoice[] = field.options?.choices ?? [];
  const colors = useGridColors();
  const [search, setSearch] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [colorPickerChoice, setColorPickerChoice] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 0);
  }, []);

  const filtered = useMemo(
    () =>
      search
        ? choices.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
        : choices,
    [choices, search],
  );

  const exactMatch = useMemo(
    () =>
      search
        ? choices.some((c) => c.title.toLowerCase() === search.trim().toLowerCase())
        : true,
    [choices, search],
  );

  const canCreate = !exactMatch && search.trim().length > 0;
  const itemCount = filtered.length + (canCreate ? 1 : 0) + (value ? 1 : 0);

  useEffect(() => {
    setFocusedIndex(filtered.length > 0 ? 0 : -1);
  }, [filtered.length]);

  useEffect(() => {
    if (focusedIndex < 0 || !listRef.current) return;
    const el = listRef.current.children[focusedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex]);

  const handleCreateOption = useCallback(() => {
    const trimmed = search.trim();
    if (!trimmed) return;
    const randomColor = SELECT_COLOR_NAMES[Math.floor(Math.random() * SELECT_COLOR_NAMES.length)];
    const newChoice: SelectChoice = { title: trimmed, color: randomColor };
    const updatedChoices = [...choices, newChoice];
    onFieldUpdate?.(field.id, field.table_id, { choices: updatedChoices });
    onCommit(trimmed);
  }, [search, choices, field.id, field.table_id, onFieldUpdate, onCommit]);

  const handleColorChange = useCallback(
    (choiceTitle: string, newColor: string) => {
      const updatedChoices = choices.map((c) =>
        c.title === choiceTitle ? { ...c, color: newColor } : c,
      );
      onFieldUpdate?.(field.id, field.table_id, { choices: updatedChoices });
      setColorPickerChoice(null);
    },
    [choices, field.id, field.table_id, onFieldUpdate],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, itemCount - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < filtered.length) {
          onCommit(filtered[focusedIndex].title);
        } else if (focusedIndex === filtered.length && canCreate) {
          handleCreateOption();
        } else if (focusedIndex === filtered.length + (canCreate ? 1 : 0) && value) {
          onCommit(null);
        }
      } else if (e.key === 'Escape') {
        onCancel();
      }
    },
    [focusedIndex, filtered, itemCount, canCreate, value, onCommit, onCancel, handleCreateOption],
  );

  return (
    <Popover open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <PopoverTrigger asChild>
        <span className="sr-only">Select option</span>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={0}
        className="p-0 w-auto"
        style={{
          minWidth: 220,
          maxHeight: 300,
          backgroundColor: colors.cellEditorBg,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
        }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="px-2 pt-2 pb-1 shrink-0">
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Find or create an option"
            className="w-full px-2 py-1.5 text-xs rounded outline-none bg-transparent placeholder:text-[#9AA2AF]"
            style={{
              border: `1px solid ${colors.border}`,
              color: colors.text,
            }}
          />
        </div>
        <div ref={listRef} className="overflow-y-auto py-1" style={{ maxHeight: 220 }}>
          {filtered.map((choice, idx) => {
            const color = getPillColor(choice.color);
            const isFocused = idx === focusedIndex;
            const isSelected = value === choice.title;
            return (
              <div
                key={choice.title}
                className="flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors group/option"
                style={{
                  backgroundColor: isFocused ? colors.hoverRow : 'transparent',
                }}
                onClick={() => onCommit(choice.title)}
                onMouseEnter={() => setFocusedIndex(idx)}
              >
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-1"
                  style={{ backgroundColor: color.bg, color: color.text }}
                >
                  {choice.title}
                </span>
                {isSelected && (
                  <Check size={14} style={{ color: colors.primary }} className="shrink-0" />
                )}
                <button
                  type="button"
                  className="shrink-0 opacity-0 group-hover/option:opacity-100 transition-opacity p-0.5 rounded hover:bg-black/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    setColorPickerChoice(colorPickerChoice === choice.title ? null : choice.title);
                  }}
                  title="Change color"
                >
                  <Palette size={12} style={{ color: colors.muted }} />
                </button>
              </div>
            );
          })}
          {canCreate && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors text-xs"
              style={{
                backgroundColor: focusedIndex === filtered.length ? colors.hoverRow : 'transparent',
                color: colors.primary,
              }}
              onClick={handleCreateOption}
              onMouseEnter={() => setFocusedIndex(filtered.length)}
            >
              Create &ldquo;{search.trim()}&rdquo;
            </div>
          )}
          {filtered.length === 0 && !search.trim() && (
            <div className="px-3 py-2 text-xs" style={{ color: colors.muted }}>No options</div>
          )}
        </div>
        {colorPickerChoice && (
          <>
            <div className="h-px" style={{ backgroundColor: colors.border }} />
            <div className="p-1">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-[11px] font-medium" style={{ color: colors.textSecondary }}>
                  Color for &ldquo;{colorPickerChoice}&rdquo;
                </span>
                <button
                  type="button"
                  className="p-0.5 rounded hover:bg-black/10"
                  onClick={() => setColorPickerChoice(null)}
                >
                  <X size={12} style={{ color: colors.muted }} />
                </button>
              </div>
              <ColorPickerGrid
                currentColor={choices.find((c) => c.title === colorPickerChoice)?.color ?? ''}
                onSelect={(newColor) => handleColorChange(colorPickerChoice, newColor)}
              />
            </div>
          </>
        )}
        {value && (
          <>
            <div className="h-px" style={{ backgroundColor: colors.border }} />
            <div
              className="px-3 py-1.5 text-xs cursor-pointer transition-colors shrink-0"
              style={{
                backgroundColor: focusedIndex === filtered.length + (canCreate ? 1 : 0) ? colors.hoverRow : 'transparent',
                color: colors.muted,
              }}
              onClick={() => onCommit(null)}
              onMouseEnter={() => setFocusedIndex(filtered.length + (canCreate ? 1 : 0))}
            >
              Clear
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function MultiSelectCellEditor({ value, field, onCommit, onCancel, onFieldUpdate }: CellEditorProps) {
  const [localChoices, setLocalChoices] = useState<SelectChoice[]>(field.options?.choices ?? []);
  const [selected, setSelected] = useState<string[]>(
    Array.isArray(value) ? value : value ? [value] : [],
  );
  const [search, setSearch] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [colorPickerChoice, setColorPickerChoice] = useState<string | null>(null);
  const colors = useGridColors();
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 0);
  }, []);

  const filtered = useMemo(
    () =>
      search
        ? localChoices.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
        : localChoices,
    [localChoices, search],
  );

  const exactMatch = useMemo(
    () =>
      search
        ? localChoices.some((c) => c.title.toLowerCase() === search.trim().toLowerCase())
        : true,
    [localChoices, search],
  );

  const canCreate = !exactMatch && search.trim().length > 0;
  const itemCount = filtered.length + (canCreate ? 1 : 0) + (selected.length > 0 ? 1 : 0);

  useEffect(() => {
    setFocusedIndex(filtered.length > 0 ? 0 : -1);
  }, [filtered.length]);

  useEffect(() => {
    if (focusedIndex < 0 || !listRef.current) return;
    const el = listRef.current.children[focusedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex]);

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
    onFieldUpdate?.(field.id, field.table_id, { choices: updatedChoices });
    setSelected((prev) => [...prev, trimmed]);
    setSearch('');
  }, [search, localChoices, field.id, field.table_id, onFieldUpdate]);

  const handleColorChange = useCallback(
    (choiceTitle: string, newColor: string) => {
      const updatedChoices = localChoices.map((c) =>
        c.title === choiceTitle ? { ...c, color: newColor } : c,
      );
      setLocalChoices(updatedChoices);
      onFieldUpdate?.(field.id, field.table_id, { choices: updatedChoices });
      setColorPickerChoice(null);
    },
    [localChoices, field.id, field.table_id, onFieldUpdate],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, itemCount - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < filtered.length) {
          toggle(filtered[focusedIndex].title);
        } else if (focusedIndex === filtered.length && canCreate) {
          handleCreateOption();
        } else if (focusedIndex === filtered.length + (canCreate ? 1 : 0) && selected.length > 0) {
          setSelected([]);
        }
      } else if (e.key === 'Escape') {
        onCommit(selectedRef.current);
      }
    },
    [focusedIndex, filtered, itemCount, canCreate, selected.length, toggle, onCommit, handleCreateOption],
  );

  const commitSelected = useCallback(() => {
    onCommit(selectedRef.current);
  }, [onCommit]);

  return (
    <Popover open onOpenChange={(open) => { if (!open) commitSelected(); }}>
      <PopoverTrigger asChild>
        <span className="sr-only">Select options</span>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={0}
        className="p-0 w-auto"
        style={{
          minWidth: 220,
          maxHeight: 340,
          backgroundColor: colors.cellEditorBg,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
        }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1 px-2 pt-2 pb-1">
            {selected.map((title) => {
              const color = getPillColor(
                localChoices.find((c) => c.title === title)?.color ?? '',
              );
              return (
                <span
                  key={title}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: color.bg, color: color.text }}
                >
                  {title}
                  <button
                    type="button"
                    className="p-0 bg-transparent border-none cursor-pointer leading-none"
                    style={{ color: color.text }}
                    onClick={() => toggle(title)}
                  >
                    <X size={10} />
                  </button>
                </span>
              );
            })}
          </div>
        )}
        <div className="px-2 pt-1 pb-1 shrink-0">
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Find or create an option"
            className="w-full px-2 py-1.5 text-xs rounded outline-none bg-transparent placeholder:text-[#9AA2AF]"
            style={{
              border: `1px solid ${colors.border}`,
              color: colors.text,
            }}
          />
        </div>
        <div ref={listRef} className="overflow-y-auto py-1" style={{ maxHeight: 200 }}>
          {filtered.map((choice, idx) => {
            const color = getPillColor(choice.color);
            const isFocused = idx === focusedIndex;
            const isChecked = selected.includes(choice.title);
            return (
              <div
                key={choice.title}
                className="flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors group/option"
                style={{
                  backgroundColor: isFocused ? colors.hoverRow : 'transparent',
                }}
                onClick={() => toggle(choice.title)}
                onMouseEnter={() => setFocusedIndex(idx)}
              >
                <span
                  className="inline-flex items-center justify-center w-4 h-4 rounded shrink-0 transition-colors"
                  style={{
                    border: `1.5px solid ${isChecked ? colors.primary : colors.muted}`,
                    backgroundColor: isChecked ? colors.primary : 'transparent',
                  }}
                >
                  {isChecked && <Check size={10} color="#fff" />}
                </span>
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-1"
                  style={{ backgroundColor: color.bg, color: color.text }}
                >
                  {choice.title}
                </span>
                <button
                  type="button"
                  className="shrink-0 opacity-0 group-hover/option:opacity-100 transition-opacity p-0.5 rounded hover:bg-black/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    setColorPickerChoice(colorPickerChoice === choice.title ? null : choice.title);
                  }}
                  title="Change color"
                >
                  <Palette size={12} style={{ color: colors.muted }} />
                </button>
              </div>
            );
          })}
          {canCreate && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors text-xs"
              style={{
                backgroundColor: focusedIndex === filtered.length ? colors.hoverRow : 'transparent',
                color: colors.primary,
              }}
              onClick={handleCreateOption}
              onMouseEnter={() => setFocusedIndex(filtered.length)}
            >
              Create &ldquo;{search.trim()}&rdquo;
            </div>
          )}
          {filtered.length === 0 && !search.trim() && (
            <div className="px-3 py-2 text-xs" style={{ color: colors.muted }}>No options</div>
          )}
        </div>
        {colorPickerChoice && (
          <>
            <div className="h-px" style={{ backgroundColor: colors.border }} />
            <div className="p-1">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-[11px] font-medium" style={{ color: colors.textSecondary }}>
                  Color for &ldquo;{colorPickerChoice}&rdquo;
                </span>
                <button
                  type="button"
                  className="p-0.5 rounded hover:bg-black/10"
                  onClick={() => setColorPickerChoice(null)}
                >
                  <X size={12} style={{ color: colors.muted }} />
                </button>
              </div>
              <ColorPickerGrid
                currentColor={localChoices.find((c) => c.title === colorPickerChoice)?.color ?? ''}
                onSelect={(newColor) => handleColorChange(colorPickerChoice, newColor)}
              />
            </div>
          </>
        )}
        {selected.length > 0 && !colorPickerChoice && (
          <>
            <div className="h-px" style={{ backgroundColor: colors.border }} />
            <div
              className="px-3 py-1.5 text-xs cursor-pointer transition-colors shrink-0"
              style={{
                backgroundColor: focusedIndex === filtered.length + (canCreate ? 1 : 0) ? colors.hoverRow : 'transparent',
                color: colors.muted,
              }}
              onClick={() => {
                setSelected([]);
                onCommit([]);
              }}
              onMouseEnter={() => setFocusedIndex(filtered.length + (canCreate ? 1 : 0))}
            >
              Clear all
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
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
  const { valid, errors } = useEditorValidation(text, field);

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
        style={{
          fontSize: 14,
          color: 'inherit',
          border: valid ? 'none' : '2px solid #EF4444',
        }}
      />
      {!valid && (
        <div className="px-2 py-1 text-[11px] text-red-600">{errors[0]}</div>
      )}
    </div>
  );
}

export function DecimalCellEditor({ value, field, onCommit, onCancel }: CellEditorProps) {
  const [num, setNum] = useState(value ?? '');
  const ref = useRef<HTMLInputElement>(null);
  const numVal = num === '' ? null : Number(num);
  const { valid, errors } = useEditorValidation(numVal, field);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <div className="relative w-full h-full">
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
        style={{
          fontSize: 14,
          color: 'inherit',
          border: valid ? 'none' : '2px solid #EF4444',
        }}
      />
      {!valid && (
        <div className="absolute right-0 top-full z-50 bg-white dark:bg-[hsl(200,30%,10%)] border border-red-200 rounded px-2 py-1 shadow text-[11px] text-red-600 whitespace-nowrap">
          {errors[0]}
        </div>
      )}
    </div>
  );
}

export function DateTimeCellEditor({ value, onCommit, onCancel }: CellEditorProps) {
  const colors = useGridColors();
  const initial = value ? new Date(value) : undefined;
  const [selected, setSelected] = useState<Date | undefined>(initial);
  const [hours, setHours] = useState(initial ? String(initial.getHours()).padStart(2, '0') : '12');
  const [minutes, setMinutes] = useState(initial ? String(initial.getMinutes()).padStart(2, '0') : '00');

  const commitDateTime = useCallback(
    (day: Date | undefined, h: string, m: string) => {
      if (!day) return;
      const d = new Date(day);
      d.setHours(parseInt(h, 10) || 0, parseInt(m, 10) || 0, 0, 0);
      onCommit(d.toISOString());
    },
    [onCommit],
  );

  const handleSelect = useCallback(
    (day: Date | undefined) => {
      if (!day) return;
      setSelected(day);
    },
    [],
  );

  return (
    <Popover open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <PopoverTrigger asChild>
        <span className="sr-only">Pick date and time</span>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={0}
        className="p-0 w-auto"
        style={{
          backgroundColor: colors.cellEditorBg,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
        }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          defaultMonth={selected}
          initialFocus
        />
        <div
          className="flex items-center gap-2 px-3 pb-2"
          style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 8 }}
        >
          <span className="text-xs font-medium" style={{ color: colors.textSecondary }}>Time</span>
          <input
            type="text"
            value={hours}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 2);
              setHours(v);
            }}
            onBlur={() => {
              const h = Math.min(23, Math.max(0, parseInt(hours, 10) || 0));
              setHours(String(h).padStart(2, '0'));
            }}
            className="w-8 text-center text-xs rounded outline-none"
            style={{
              border: `1px solid ${colors.border}`,
              backgroundColor: 'transparent',
              color: colors.text,
              padding: '2px 0',
            }}
            maxLength={2}
          />
          <span style={{ color: colors.muted }}>:</span>
          <input
            type="text"
            value={minutes}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 2);
              setMinutes(v);
            }}
            onBlur={() => {
              const m = Math.min(59, Math.max(0, parseInt(minutes, 10) || 0));
              setMinutes(String(m).padStart(2, '0'));
            }}
            className="w-8 text-center text-xs rounded outline-none"
            style={{
              border: `1px solid ${colors.border}`,
              backgroundColor: 'transparent',
              color: colors.text,
              padding: '2px 0',
            }}
            maxLength={2}
          />
        </div>
        <div className="flex items-center justify-between px-3 pb-2">
          <button
            type="button"
            className="text-xs px-2 py-1 rounded transition-colors"
            style={{ color: colors.primary }}
            onClick={() => commitDateTime(selected ?? new Date(), hours, minutes)}
          >
            Apply
          </button>
          <div className="flex gap-1">
            <button
              type="button"
              className="text-xs px-2 py-1 rounded transition-colors"
              style={{ color: colors.primary }}
              onClick={() => {
                const now = new Date();
                setSelected(now);
                setHours(String(now.getHours()).padStart(2, '0'));
                setMinutes(String(now.getMinutes()).padStart(2, '0'));
                commitDateTime(now, String(now.getHours()).padStart(2, '0'), String(now.getMinutes()).padStart(2, '0'));
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.hoverRow)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              Now
            </button>
            {value && (
              <button
                type="button"
                className="text-xs px-2 py-1 rounded transition-colors"
                style={{ color: colors.muted }}
                onClick={() => onCommit(null)}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.hoverRow)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                Clear
              </button>
            )}
          </div>
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
