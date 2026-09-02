import React, { useState, useRef, useEffect } from 'react';
import type { FieldMeta, SelectChoice } from '@/features/database/types';
import { PILL_COLORS } from '@/features/database/types';

interface CellEditorProps {
  value: any;
  field: FieldMeta;
  onCommit: (value: any) => void;
  onCancel: () => void;
}

function getPillColor(colorName: string) {
  return PILL_COLORS.find((c) => c.name === colorName) || PILL_COLORS[7];
}

export function TextCellEditor({ value, onCommit, onCancel }: CellEditorProps) {
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
      className="w-full h-full px-2 outline-none border-none bg-white"
      style={{ fontSize: 13, color: '#0F172A' }}
    />
  );
}

export function NumberCellEditor({ value, onCommit, onCancel }: CellEditorProps) {
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
      className="w-full h-full px-2 outline-none border-none bg-white text-right"
      style={{ fontSize: 13, color: '#0F172A' }}
    />
  );
}

export function CurrencyCellEditor({ value, onCommit, onCancel }: CellEditorProps) {
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
      className="w-full h-full px-2 outline-none border-none bg-white text-right"
      style={{ fontSize: 13, color: '#0F172A' }}
    />
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
      style={{ fontSize: 13, color: '#0F172A' }}
    />
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
      style={{ borderColor: '#E2E8F0' }}
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
          style={{ color: '#94A3B8' }}
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

export function getCellEditor(uiType: string) {
  switch (uiType) {
    case 'Number':
    case 'Decimal':
      return NumberCellEditor;
    case 'Currency':
      return CurrencyCellEditor;
    case 'Date':
    case 'DateTime':
      return DateCellEditor;
    case 'SingleSelect':
      return SelectCellEditor;
    case 'MultiSelect':
      return MultiSelectCellEditor;
    case 'Checkbox':
      return null; // toggled directly in renderer
    default:
      return TextCellEditor;
  }
}
