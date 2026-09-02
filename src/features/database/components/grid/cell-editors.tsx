import React, { useState, useRef, useEffect } from 'react';
import { Star, Paperclip, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
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
      style={{ fontSize: 13, color: '#374151' }}
    />
  );
}

export function LongTextCellEditor({ value, onCommit, onCancel }: CellEditorProps) {
  const [text, setText] = useState(value ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <textarea
      ref={ref}
      rows={4}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onCommit(text);
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={() => onCommit(text)}
      className="w-full px-2 py-1 outline-none border-none bg-white resize-none"
      style={{ fontSize: 13, color: '#374151', minHeight: 80 }}
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
      style={{ fontSize: 13, color: '#374151' }}
    />
  );
}

export function DecimalCellEditor({ value, onCommit, onCancel }: CellEditorProps) {
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
      style={{ fontSize: 13, color: '#374151' }}
    />
  );
}

export function PercentCellEditor({ value, onCommit, onCancel }: CellEditorProps) {
  const [num, setNum] = useState(value ?? '');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <div className="flex items-center w-full h-full bg-white">
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
        style={{ fontSize: 13, color: '#374151' }}
      />
      <span className="pr-2 shrink-0" style={{ fontSize: 13, color: '#9AA2AF' }}>%</span>
    </div>
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
      style={{ fontSize: 13, color: '#374151' }}
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
  const selected: string[] = Array.isArray(value) ? value : value ? [value] : [];
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

  function toggle(title: string) {
    const next = selected.includes(title)
      ? selected.filter((s) => s !== title)
      : [...selected, title];
    onCommit(next.length > 0 ? next : null);
  }

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-50 bg-white border rounded-md shadow-lg py-1 min-w-[180px] max-h-[240px] overflow-y-auto"
      style={{ borderColor: '#E7E7E9' }}
    >
      {choices.map((choice: SelectChoice) => {
        const color = getPillColor(choice.color);
        const isSelected = selected.includes(choice.title);
        return (
          <button
            key={choice.title}
            className="w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-center gap-2"
            onClick={() => toggle(choice.title)}
          >
            <span
              className="w-4 h-4 rounded border flex items-center justify-center shrink-0"
              style={{
                borderColor: isSelected ? color.text : '#CBD5E1',
                backgroundColor: isSelected ? color.bg : 'transparent',
              }}
            >
              {isSelected && (
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <path d="M2 5l2 2 4-4" stroke={color.text} strokeWidth="1.5" fill="none" />
                </svg>
              )}
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
          className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs"
          style={{ color: '#9AA2AF' }}
          onClick={() => onCommit(null)}
        >
          Clear all
        </button>
      )}
    </div>
  );
}

export function JSONCellEditor({ value, onCommit, onCancel }: CellEditorProps) {
  const initial = typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? '';
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  function commitJSON() {
    try {
      onCommit(JSON.parse(text));
    } catch {
      onCommit(text);
    }
  }

  return (
    <textarea
      ref={ref}
      rows={4}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commitJSON();
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={() => commitJSON()}
      className="w-full px-2 py-1 outline-none border-none bg-white resize-none"
      style={{ fontSize: 12, color: '#374151', fontFamily: 'monospace', minHeight: 80 }}
    />
  );
}

export function AttachmentCellEditor({ value, onCommit, onCancel }: CellEditorProps) {
  const [files, setFiles] = useState<{ name: string; url: string; type: string; size: number }[]>(
    Array.isArray(value) ? value : [],
  );
  const [uploading, setUploading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onCancel]);

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function removeFile(index: number) {
    const next = files.filter((_, i) => i !== index);
    setFiles(next);
    onCommit(next.length > 0 ? next : null);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    setUploading(true);
    const newFiles = [...files];
    for (let i = 0; i < selected.length; i++) {
      const file = selected[i];
      const path = `attachments/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from('attachments').upload(path, file);
      if (error) continue;
      const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path);
      newFiles.push({ name: file.name, url: urlData.publicUrl, type: file.type, size: file.size });
    }
    setFiles(newFiles);
    setUploading(false);
    onCommit(newFiles);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-50 bg-white border rounded-md shadow-lg py-2 min-w-[240px] max-h-[300px] overflow-y-auto"
      style={{ borderColor: '#E7E7E9' }}
    >
      {files.map((f, i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50">
          <Paperclip size={14} color="#9AA2AF" className="shrink-0" />
          <span
            className="text-xs truncate flex-1"
            style={{ color: '#374151', maxWidth: 140 }}
            title={f.name}
          >
            {f.name}
          </span>
          <span className="text-xs shrink-0" style={{ color: '#9AA2AF' }}>
            {formatSize(f.size)}
          </span>
          <button
            type="button"
            className="p-0 border-none bg-transparent cursor-pointer shrink-0"
            onClick={() => removeFile(i)}
          >
            <X size={14} color="#9AA2AF" />
          </button>
        </div>
      ))}
      <div className="px-3 pt-1">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleUpload}
          className="hidden"
        />
        <button
          type="button"
          className="w-full text-xs font-medium py-1.5 px-3 rounded cursor-pointer border-none text-white"
          style={{ backgroundColor: '#3366FF' }}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Uploading...' : 'Add file'}
        </button>
      </div>
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
        if (e.key === 'Enter') onCommit(dt || null);
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={() => onCommit(dt || null)}
      className="w-full h-full px-2 outline-none border-none bg-white"
      style={{ fontSize: 13, color: '#374151' }}
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
      value={time}
      onChange={(e) => setTime(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(time || null);
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={() => onCommit(time || null)}
      className="w-full h-full px-2 outline-none border-none bg-white"
      style={{ fontSize: 13, color: '#374151' }}
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
    case 'JSON':
      return JSONCellEditor;
    case 'Checkbox':
      return null; // toggled directly in renderer
    // Read-only / system / computed fields — no editor
    case 'CreatedTime':
    case 'LastModifiedTime':
    case 'CreatedBy':
    case 'LastModifiedBy':
    case 'AutoNumber':
    case 'ID':
    case 'Formula':
    case 'Rollup':
    case 'Lookup':
    case 'Links':
    case 'Attachment':
      return AttachmentCellEditor;
    default:
      return TextCellEditor;
  }
}
