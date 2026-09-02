import { useState, useMemo } from 'react';
import type { FieldMeta } from '../../types';
import { getFieldTypeIcon } from '../grid/field-icons';

interface FormViewProps {
  fields: FieldMeta[];
  onAddRow: (record: Record<string, any>) => void;
  isLoading: boolean;
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
    setTimeout(() => setSubmitted(false), 2000);
  };

  return (
    <div className="flex-1 overflow-auto flex justify-center py-8 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg bg-white rounded-xl border border-[#E7E7E9] shadow-sm p-6 space-y-5 h-fit"
      >
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
              {f.ui_type === 'LongText' ? (
                <textarea
                  className="w-full border border-[#E7E7E9] rounded-md px-3 py-2 text-sm text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#3366FF]/30 focus:border-[#3366FF] resize-none"
                  rows={3}
                  value={values[f.id] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                  required={f.is_required}
                />
              ) : f.ui_type === 'Checkbox' ? (
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-[#3366FF]"
                  checked={!!values[f.id]}
                  onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.checked }))}
                />
              ) : f.ui_type === 'Number' || f.ui_type === 'Decimal' || f.ui_type === 'Currency' || f.ui_type === 'Percent' ? (
                <input
                  type="number"
                  className="w-full border border-[#E7E7E9] rounded-md px-3 py-2 text-sm text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#3366FF]/30 focus:border-[#3366FF]"
                  value={values[f.id] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                  required={f.is_required}
                  step="any"
                />
              ) : f.ui_type === 'Date' || f.ui_type === 'DateTime' ? (
                <input
                  type={f.ui_type === 'DateTime' ? 'datetime-local' : 'date'}
                  className="w-full border border-[#E7E7E9] rounded-md px-3 py-2 text-sm text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#3366FF]/30 focus:border-[#3366FF]"
                  value={values[f.id] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                  required={f.is_required}
                />
              ) : f.ui_type === 'SingleSelect' ? (
                <select
                  className="w-full border border-[#E7E7E9] rounded-md px-3 py-2 text-sm text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#3366FF]/30 focus:border-[#3366FF]"
                  value={values[f.id] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                  required={f.is_required}
                >
                  <option value="">Select...</option>
                  {(f.options?.choices ?? []).map((c) => (
                    <option key={c.title} value={c.title}>{c.title}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.ui_type === 'Email' ? 'email' : f.ui_type === 'URL' ? 'url' : 'text'}
                  className="w-full border border-[#E7E7E9] rounded-md px-3 py-2 text-sm text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#3366FF]/30 focus:border-[#3366FF]"
                  value={values[f.id] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                  required={f.is_required}
                />
              )}
            </div>
          );
        })}
        <button
          type="submit"
          className="w-full py-2.5 rounded-lg text-white text-sm font-medium transition-colors"
          style={{ backgroundColor: '#3366FF' }}
        >
          {submitted ? 'Submitted!' : 'Submit'}
        </button>
      </form>
    </div>
  );
}
