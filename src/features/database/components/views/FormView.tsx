import { useState, useMemo } from 'react';
import { CheckCircle } from 'lucide-react';
import type { FieldMeta } from '../../types';
import { PILL_COLORS } from '../../types';
import { getFieldTypeIcon } from '../grid/field-icons';

interface FormViewProps {
  fields: FieldMeta[];
  onAddRow: (record: Record<string, any>) => void;
  isLoading: boolean;
}

function getPillColor(colorName: string) {
  return PILL_COLORS.find((c) => c.name === colorName) || PILL_COLORS[7];
}

function MultiSelectInput({
  field,
  value,
  onChange,
}: {
  field: FieldMeta;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const choices = field.options?.choices ?? [];
  const toggle = (title: string) => {
    onChange(
      value.includes(title) ? value.filter((v) => v !== title) : [...value, title],
    );
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {choices.map((c) => {
        const color = getPillColor(c.color);
        const selected = value.includes(c.title);
        return (
          <button
            key={c.title}
            type="button"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all"
            style={{
              backgroundColor: selected ? color.bg : '#F1F5F9',
              color: selected ? color.text : '#9AA2AF',
              outline: selected ? `2px solid ${color.text}40` : 'none',
            }}
            onClick={() => toggle(c.title)}
          >
            {c.title}
          </button>
        );
      })}
    </div>
  );
}

function RatingInput({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <button
          key={i}
          type="button"
          className="text-lg transition-colors"
          style={{ color: i < value ? '#F59E0B' : '#E2E8F0' }}
          onClick={() => onChange(i + 1 === value ? 0 : i + 1)}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export default function FormView({ fields, onAddRow }: FormViewProps) {
  const editableFields = useMemo(
    () =>
      fields
        .filter((f) => !f.is_system && f.ui_type !== 'ID' && f.ui_type !== 'AutoNumber')
        .sort((a, b) => a.position - b.position),
    [fields],
  );

  const [values, setValues] = useState<Record<string, any>>({});
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const record: Record<string, any> = {};
    for (const f of editableFields) {
      if (values[f.id] !== undefined && values[f.id] !== '') {
        record[f.pg_column_name] = values[f.id];
      }
    }
    onAddRow(record);
    setValues({});
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 2500);
  };

  const renderInput = (f: FieldMeta) => {
    const inputClass =
      'w-full border border-[#E7E7E9] rounded-md px-3 py-2 text-sm text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#3366FF]/30 focus:border-[#3366FF]';

    switch (f.ui_type) {
      case 'LongText':
        return (
          <textarea
            className={inputClass + ' resize-none'}
            rows={3}
            value={values[f.id] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
            required={f.is_required}
          />
        );
      case 'Checkbox':
        return (
          <input
            type="checkbox"
            className="w-4 h-4 accent-[#3366FF]"
            checked={!!values[f.id]}
            onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.checked }))}
          />
        );
      case 'Number':
      case 'Decimal':
      case 'Currency':
      case 'Percent':
        return (
          <input
            type="number"
            className={inputClass}
            value={values[f.id] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
            required={f.is_required}
            step="any"
          />
        );
      case 'Rating':
        return (
          <RatingInput
            value={values[f.id] ?? 0}
            max={f.options?.max ?? 5}
            onChange={(v) => setValues((prev) => ({ ...prev, [f.id]: v }))}
          />
        );
      case 'Date':
        return (
          <input
            type="date"
            className={inputClass}
            value={values[f.id] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
            required={f.is_required}
          />
        );
      case 'DateTime':
        return (
          <input
            type="datetime-local"
            className={inputClass}
            value={values[f.id] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
            required={f.is_required}
          />
        );
      case 'SingleSelect':
        return (
          <select
            className={inputClass}
            value={values[f.id] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
            required={f.is_required}
          >
            <option value="">Select...</option>
            {(f.options?.choices ?? []).map((c) => (
              <option key={c.title} value={c.title}>{c.title}</option>
            ))}
          </select>
        );
      case 'MultiSelect':
        return (
          <MultiSelectInput
            field={f}
            value={Array.isArray(values[f.id]) ? values[f.id] : []}
            onChange={(v) => setValues((prev) => ({ ...prev, [f.id]: v }))}
          />
        );
      default:
        return (
          <input
            type={f.ui_type === 'Email' ? 'email' : f.ui_type === 'URL' ? 'url' : 'text'}
            className={inputClass}
            value={values[f.id] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
            required={f.is_required}
            placeholder={f.description ?? undefined}
          />
        );
    }
  };

  return (
    <div className="flex-1 overflow-auto flex justify-center py-8 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg bg-white rounded-xl border border-[#E7E7E9] shadow-sm overflow-hidden h-fit"
      >
        <div
          className="h-1.5"
          style={{ background: 'linear-gradient(90deg, #3366FF, #5B8DEF)' }}
        />
        <div className="p-6 space-y-5">
          <h2 className="text-lg font-semibold text-[#374151]">New Record</h2>
          {editableFields.map((f) => {
            const Icon = getFieldTypeIcon(f.ui_type);
            return (
              <div key={f.id}>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-[#6A7184] mb-1.5">
                  <Icon size={12} className="text-[#9AA2AF]" />
                  {f.name}
                  {f.is_required && <span className="text-red-400">*</span>}
                </label>
                {f.description && (
                  <p className="text-[11px] text-[#9AA2AF] mb-1.5">{f.description}</p>
                )}
                {renderInput(f)}
              </div>
            );
          })}
          <button
            type="submit"
            className="w-full py-2.5 rounded-lg text-white text-sm font-medium transition-all flex items-center justify-center gap-2"
            style={{ backgroundColor: submitted ? '#22C55E' : '#3366FF' }}
          >
            {submitted ? (
              <>
                <CheckCircle size={16} /> Submitted!
              </>
            ) : (
              'Submit'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
