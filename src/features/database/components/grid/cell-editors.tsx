import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Paperclip, Star } from 'lucide-react';
import type { FieldMeta, SelectChoice } from '@/features/database/types';
import { PILL_COLORS, SELECT_COLOR_NAMES } from '@/features/database/types';
import { AttachmentManager, type AttachmentMeta } from '../AttachmentManager';
import { validateField, type ValidationRule } from '../../lib/validation';

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
          fontSize: 13,
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
          fontSize: 13,
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
          fontSize: 13,
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
  const initial = value ? new Date(value).toISOString().split('T')[0] : '';
  const [date, setDate] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <input
      ref={ref}
      type="date"
      value={date}
      onChange={(e) => setDate(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(date || null);
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={() => onCommit(date || null)}
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

export function SelectCellEditor({ value, field, onCommit, onCancel }: CellEditorProps) {
  const choices = field.options?.choices || [];
  const ref = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onCancel]);

  const filtered = search
    ? choices.filter((c: SelectChoice) => c.title.toLowerCase().includes(search.toLowerCase()))
    : choices;

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-50 bg-white dark:bg-[hsl(200,30%,10%)] border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] rounded-lg shadow-lg min-w-[200px] max-h-[280px] flex flex-col animate-[panelSlideDown_150ms_ease-out]"
    >
      {choices.length > 5 && (
        <div className="px-2 pt-2 pb-1 shrink-0">
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
            placeholder="Find an option"
            className="w-full px-2 py-1 text-xs rounded border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] outline-none bg-transparent text-[#374151] dark:text-[hsl(200,25%,88%)] placeholder:text-[#9AA2AF] focus:border-[#3366FF]"
          />
        </div>
      )}
      <div className="overflow-y-auto py-1">
        {filtered.map((choice: SelectChoice) => {
          const color = getPillColor(choice.color);
          return (
            <button
              key={choice.title}
              className="w-full text-left px-3 py-1.5 hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,15%)] flex items-center gap-2 transition-colors"
              onClick={() => onCommit(choice.title)}
            >
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ backgroundColor: color.bg, color: color.text }}
              >
                {choice.title}
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-3 py-2 text-xs text-[#9AA2AF]">No options found</div>
        )}
      </div>
      {value && (
        <>
          <div className="h-px bg-[#E7E7E9] dark:bg-[hsl(200,25%,18%)]" />
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,15%)] text-xs text-[#9AA2AF] transition-colors shrink-0"
            onClick={() => onCommit(null)}
          >
            Clear
          </button>
        </>
      )}
    </div>
  );
}

export function MultiSelectCellEditor({ value, field, onCommit, onCancel }: CellEditorProps) {
  const choices = field.options?.choices || [];
  const [selected, setSelected] = useState<string[]>(
    Array.isArray(value) ? value : value ? [value] : [],
  );
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCommit(selected);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onCommit, selected]);

  const toggle = (title: string) => {
    setSelected((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title],
    );
  };

  const filtered = search
    ? choices.filter((c: SelectChoice) => c.title.toLowerCase().includes(search.toLowerCase()))
    : choices;

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-50 bg-white dark:bg-[hsl(200,30%,10%)] border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] rounded-lg shadow-lg min-w-[200px] max-h-[280px] flex flex-col animate-[panelSlideDown_150ms_ease-out]"
    >
      {choices.length > 5 && (
        <div className="px-2 pt-2 pb-1 shrink-0">
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { onCommit(selected); } }}
            placeholder="Find an option"
            className="w-full px-2 py-1 text-xs rounded border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] outline-none bg-transparent text-[#374151] dark:text-[hsl(200,25%,88%)] placeholder:text-[#9AA2AF] focus:border-[#3366FF]"
          />
        </div>
      )}
      <div className="overflow-y-auto py-1">
        {filtered.map((choice: SelectChoice) => {
          const color = getPillColor(choice.color);
          const isChecked = selected.includes(choice.title);
          return (
            <button
              key={choice.title}
              className="w-full text-left px-3 py-1.5 hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,15%)] flex items-center gap-2 transition-colors"
              onClick={() => toggle(choice.title)}
            >
              <span
                className="inline-flex items-center justify-center w-4 h-4 rounded border text-[10px]"
                style={{
                  borderColor: isChecked ? '#3366FF' : '#9AA2AF',
                  backgroundColor: isChecked ? '#3366FF' : 'transparent',
                  color: isChecked ? '#fff' : 'transparent',
                }}
              >
                {isChecked ? '✓' : ''}
              </span>
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ backgroundColor: color.bg, color: color.text }}
              >
                {choice.title}
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-3 py-2 text-xs text-[#9AA2AF]">No options found</div>
        )}
      </div>
      {selected.length > 0 && (
        <>
          <div className="h-px bg-[#E7E7E9] dark:bg-[hsl(200,25%,18%)]" />
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,15%)] text-xs text-[#9AA2AF] transition-colors shrink-0"
            onClick={() => {
              setSelected([]);
              onCommit([]);
            }}
          >
            Clear all
          </button>
        </>
      )}
    </div>
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
          fontSize: 13,
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
          fontSize: 13,
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
  const initial = value ? new Date(value).toISOString().slice(0, 16) : '';
  const [dt, setDt] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <input
      ref={ref}
      type="datetime-local"
      value={dt}
      onChange={(e) => setDt(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(dt ? new Date(dt).toISOString() : null);
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={() => onCommit(dt ? new Date(dt).toISOString() : null)}
      className="w-full h-full px-2 outline-none border-none bg-white dark:bg-[hsl(200,30%,10%)]"
      style={{ fontSize: 13, color: 'inherit' }}
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
    case 'Year':
      return DateCellEditor;
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
