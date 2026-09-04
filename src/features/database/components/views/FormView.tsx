import { useState, useMemo, useCallback } from 'react';
import { CheckCircle, Star, GripVertical, ImageIcon, RotateCcw } from 'lucide-react';
import type { FieldMeta } from '../../types';
import { PILL_COLORS, VIRTUAL_TYPES } from '../../types';
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
              backgroundColor: selected ? color.bg : undefined,
              color: selected ? color.text : undefined,
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

const SYSTEM_TYPES = new Set<string>([
  'ID', 'AutoNumber', 'CreatedTime', 'LastModifiedTime', 'CreatedBy', 'LastModifiedBy',
]);

export default function FormView({ fields, onAddRow, isLoading }: FormViewProps) {
  const editableFields = useMemo(
    () =>
      fields
        .filter(
          (f) =>
            !f.is_system &&
            !f.is_hidden &&
            !SYSTEM_TYPES.has(f.ui_type) &&
            !VIRTUAL_TYPES.includes(f.ui_type),
        )
        .sort((a, b) => a.position - b.position),
    [fields],
  );

  const [values, setValues] = useState<Record<string, any>>({});
  const [submitted, setSubmitted] = useState(false);
  const [formTitle, setFormTitle] = useState('New Record');
  const [formDescription, setFormDescription] = useState('Fill out the fields below to submit a new record.');
  const [requiredOverrides, setRequiredOverrides] = useState<Record<string, boolean>>({});

  const isFieldRequired = useCallback(
    (f: FieldMeta) => requiredOverrides[f.id] ?? f.is_required,
    [requiredOverrides],
  );

  const toggleRequired = useCallback((fieldId: string, currentRequired: boolean) => {
    setRequiredOverrides((prev) => ({ ...prev, [fieldId]: !currentRequired }));
  }, []);

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
  };

  const handleSubmitAnother = () => {
    setSubmitted(false);
    setValues({});
  };

  const inputClass =
    'w-full border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded-lg px-3 py-2.5 text-sm text-[#374151] dark:text-[hsl(200,25%,88%)] bg-white dark:bg-[hsl(200,30%,8%)] focus:outline-none focus:ring-2 focus:ring-[#166EE1]/30 focus:border-[#166EE1] placeholder:text-[#9AA2AF] dark:placeholder:text-[hsl(200,25%,40%)] transition-colors';

  const renderInput = (f: FieldMeta) => {
    const req = isFieldRequired(f);

    switch (f.ui_type) {
      case 'LongText':
        return (
          <textarea
            className={inputClass + ' resize-none'}
            rows={4}
            value={values[f.id] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
            required={req}
            placeholder={f.description ?? `Enter ${f.name.toLowerCase()}...`}
          />
        );
      case 'Checkbox':
        return (
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={!!values[f.id]}
              onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.checked }))}
            />
            <div className="w-9 h-5 bg-[#E5E5E5] dark:bg-[hsl(200,25%,20%)] peer-focus:ring-2 peer-focus:ring-[#166EE1]/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-gray-300 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#166EE1]" />
          </label>
        );
      case 'Number':
      case 'Decimal':
      case 'Currency':
      case 'Percent':
      case 'Duration':
        return (
          <input
            type="number"
            className={inputClass}
            value={values[f.id] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
            required={req}
            step="any"
            placeholder={`Enter ${f.name.toLowerCase()}...`}
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
            required={req}
          />
        );
      case 'DateTime':
        return (
          <input
            type="datetime-local"
            className={inputClass}
            value={values[f.id] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
            required={req}
          />
        );
      case 'Time':
        return (
          <input
            type="time"
            className={inputClass}
            value={values[f.id] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
            required={req}
          />
        );
      case 'Year':
        return (
          <input
            type="number"
            className={inputClass}
            value={values[f.id] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
            required={req}
            min={1900}
            max={2100}
            placeholder="YYYY"
          />
        );
      case 'SingleSelect':
        return (
          <select
            className={inputClass}
            value={values[f.id] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
            required={req}
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
            type={f.ui_type === 'Email' ? 'email' : f.ui_type === 'URL' ? 'url' : f.ui_type === 'PhoneNumber' ? 'tel' : 'text'}
            className={inputClass}
            value={values[f.id] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
            required={req}
            placeholder={f.description ?? `Enter ${f.name.toLowerCase()}...`}
          />
        );
    }
  };

  if (submitted) {
    return (
      <div className="flex-1 overflow-auto flex justify-center items-start py-10 px-4 bg-[#F9F9FA] dark:bg-[hsl(200,30%,10%)]">
        <div className="w-full max-w-2xl mx-auto">
          <div className="bg-white dark:bg-[hsl(200,30%,12%)] rounded-xl border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] shadow-sm overflow-hidden">
            <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #22C55E, #4ADE80)' }} />
            <div className="p-10 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center mb-5">
                <CheckCircle size={32} className="text-green-500" />
              </div>
              <h2 className="text-xl font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)] mb-2">
                Record submitted successfully
              </h2>
              <p className="text-sm text-[#6A7184] dark:text-[hsl(200,25%,60%)] mb-6">
                Your response has been recorded.
              </p>
              <button
                type="button"
                onClick={handleSubmitAnother}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: '#166EE1' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2952CC')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#166EE1')}
              >
                <RotateCcw size={14} />
                Submit another response
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto flex justify-center py-10 px-4 bg-[#F9F9FA] dark:bg-[hsl(200,30%,10%)]">
      <div className="w-full max-w-2xl mx-auto">
        <form onSubmit={handleSubmit}>
          {/* Cover image placeholder */}
          <div className="rounded-t-xl border border-b-0 border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] bg-gradient-to-br from-[#EEF2FF] to-[#E0E7FF] dark:from-[hsl(220,30%,14%)] dark:to-[hsl(230,25%,16%)] h-36 flex items-center justify-center">
            <div className="flex flex-col items-center gap-1.5 text-[#9AA2AF] dark:text-[hsl(200,25%,40%)]">
              <ImageIcon size={28} />
              <span className="text-xs font-medium">Add cover image</span>
            </div>
          </div>

          {/* Form header */}
          <div className="bg-white dark:bg-[hsl(200,30%,12%)] border-x border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] px-8 pt-6 pb-4">
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              className="w-full text-2xl font-bold text-[#374151] dark:text-[hsl(200,25%,88%)] bg-transparent border-none outline-none placeholder:text-[#9AA2AF] dark:placeholder:text-[hsl(200,25%,40%)]"
              placeholder="Form title"
            />
            <input
              type="text"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              className="w-full mt-1.5 text-sm text-[#6A7184] dark:text-[hsl(200,25%,60%)] bg-transparent border-none outline-none placeholder:text-[#9AA2AF] dark:placeholder:text-[hsl(200,25%,40%)]"
              placeholder="Add a description..."
            />
          </div>

          {/* Form fields */}
          <div className="space-y-0">
            {editableFields.map((f) => {
              const Icon = getFieldTypeIcon(f.ui_type);
              const req = isFieldRequired(f);
              return (
                <div
                  key={f.id}
                  className="bg-white dark:bg-[hsl(200,30%,12%)] border-x border-b border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] px-8 py-5 group"
                >
                  <div className="flex items-start gap-3">
                    {/* Drag handle */}
                    <div className="mt-0.5 opacity-0 group-hover:opacity-40 transition-opacity cursor-grab text-[#6A7184] dark:text-[hsl(200,25%,50%)]">
                      <GripVertical size={16} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon size={14} className="text-[#9AA2AF] dark:text-[hsl(200,25%,45%)] shrink-0" />
                        <span className="text-sm font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">
                          {f.name}
                        </span>
                        {req && (
                          <span className="text-red-400 text-xs">*</span>
                        )}
                        {/* Required toggle */}
                        <button
                          type="button"
                          onClick={() => toggleRequired(f.id, req)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
                          title={req ? 'Mark as optional' : 'Mark as required'}
                        >
                          <Star
                            size={14}
                            className={
                              req
                                ? 'text-amber-400 fill-amber-400'
                                : 'text-[#9AA2AF] dark:text-[hsl(200,25%,40%)]'
                            }
                          />
                        </button>
                      </div>
                      {f.description && (
                        <p className="text-xs text-[#9AA2AF] dark:text-[hsl(200,25%,45%)] mb-2">{f.description}</p>
                      )}
                      {renderInput(f)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Submit button */}
          <div className="bg-white dark:bg-[hsl(200,30%,12%)] border-x border-b border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded-b-xl px-8 py-6">
            <button
              type="submit"
              disabled={isLoading}
              className="px-8 py-2.5 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#166EE1' }}
              onMouseEnter={(e) => {
                if (!isLoading) e.currentTarget.style.backgroundColor = '#2952CC';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#166EE1';
              }}
            >
              {isLoading ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
