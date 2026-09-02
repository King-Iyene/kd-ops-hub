import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Paperclip } from 'lucide-react';
import type { FieldMeta, SelectChoice } from '@/features/database/types';
import { PILL_COLORS } from '@/features/database/types';
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
        className="w-full h-full px-2 outline-none bg-white"
        style={{
          fontSize: 13,
          color: '#0F172A',
          border: valid ? 'none' : '2px solid #EF4444',
        }}
      />
      {!valid && (
        <div className="absolute left-0 top-full z-50 bg-white border border-red-200 rounded px-2 py-1 shadow text-[11px] text-red-600 whitespace-nowrap">
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
        className="w-full h-full px-2 outline-none bg-white text-right"
        style={{
          fontSize: 13,
          color: '#0F172A',
          border: valid ? 'none' : '2px solid #EF4444',
        }}
      />
      {!valid && (
        <div className="absolute right-0 top-full z-50 bg-white border border-red-200 rounded px-2 py-1 shadow text-[11px] text-red-600 whitespace-nowrap">
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
        className="w-full h-full px-2 outline-none bg-white text-right"
        style={{
          fontSize: 13,
          color: '#0F172A',
          border: valid ? 'none' : '2px solid #EF4444',
        }}
      />
      {!valid && (
        <div className="absolute right-0 top-full z-50 bg-white border border-red-200 rounded px-2 py-1 shadow text-[11px] text-red-600 whitespace-nowrap">
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
      className="w-full h-full px-2 outline-none border-none bg-white"
      style={{ fontSize: 13, color: '#374151' }}
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
      className="w-full h-full px-2 outline-none border-none bg-white text-right"
      style={{ fontSize: 13, color: '#374151', fontVariantNumeric: 'tabular-nums' }}
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
      className="w-full h-full px-2 outline-none border-none bg-white"
      style={{ fontSize: 13, color: '#374151' }}
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
      className="w-full h-full px-2 outline-none border-none bg-white"
      style={{ fontSize: 13, color: '#374151' }}
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
      className="w-full h-full px-2 outline-none border-none bg-white"
      style={{ fontSize: 13, color: '#374151' }}
    />
  );
}

export function RatingCellEditor({ value, field, onCommit }: CellEditorProps) {
  const max = field.options?.max || 5;
  const rating = Number(value) || 0;
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div ref={ref} className="flex items-center gap-0.5 px-2 h-full bg-white">
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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onCancel]);

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-50 bg-white border rounded-md shadow-lg py-1 min-w-[180px] max-h-[240px] overflow-y-auto"
      style={{ borderColor: '#E7E7E9' }}
    >
      {choices.map((choice: SelectChoice) => {
        const color = getPillColor(choice.color);
        return (
          <button
            key={choice.title}
            className="w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-center gap-2"
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
      {value && (
        <button
          className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs"
          style={{ color: '#9AA2AF' }}
          onClick={() => onCommit(null)}
        >
          Clear
        </button>
      )}
    </div>
  );
}

export function MultiSelectCellEditor({ value, field, onCommit, onCancel }: CellEditorProps) {
  const choices = field.options?.choices || [];
  const [selected, setSelected] = useState<string[]>(
    Array.isArray(value) ? value : value ? [value] : [],
  );
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-50 bg-white dark:bg-[hsl(200,30%,10%)] border rounded-md shadow-lg py-1 min-w-[180px] max-h-[240px] overflow-y-auto"
      style={{ borderColor: '#E7E7E9' }}
    >
      {choices.map((choice: SelectChoice) => {
        const color = getPillColor(choice.color);
        const isChecked = selected.includes(choice.title);
        return (
          <button
            key={choice.title}
            className="w-full text-left px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-white/5 flex items-center gap-2"
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
      {selected.length > 0 && (
        <button
          className="w-full text-left px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-white/5 text-xs"
          style={{ color: '#94A3B8' }}
          onClick={() => {
            setSelected([]);
            onCommit([]);
          }}
        >
          Clear all
        </button>
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
        className="w-full h-full px-2 outline-none border-none bg-white text-right" style={{ fontSize: 13 }}
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
    case 'Checkbox':
      return null;
    default:
      return TextCellEditor;
  }
}
