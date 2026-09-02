import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Star } from 'lucide-react';
import type { FieldMeta, UIType, SelectChoice } from '@/features/database/types';
import { PILL_COLORS, VIRTUAL_TYPES } from '@/features/database/types';

interface FormViewProps {
  fields: FieldMeta[];
  onAddRow: (record: Record<string, any>) => void;
  isLoading: boolean;
}

const SYSTEM_TYPES: UIType[] = [
  'CreatedTime', 'LastModifiedTime', 'Formula', 'Rollup',
  'Lookup', 'Links', 'ID', 'AutoNumber', 'CreatedBy', 'LastModifiedBy',
];

function getChoiceColor(colorName: string) {
  return PILL_COLORS.find((c) => c.name === colorName) ?? PILL_COLORS[7];
}

function buildInitialValues(fields: FieldMeta[]): Record<string, any> {
  const vals: Record<string, any> = {};
  for (const f of fields) {
    if (f.is_system || f.is_hidden || SYSTEM_TYPES.includes(f.ui_type)) continue;
    switch (f.ui_type) {
      case 'Checkbox':
        vals[f.id] = false;
        break;
      case 'MultiSelect':
        vals[f.id] = [] as string[];
        break;
      case 'Rating':
        vals[f.id] = 0;
        break;
      default:
        vals[f.id] = '';
    }
  }
  return vals;
}

export default function FormView({ fields, onAddRow, isLoading }: FormViewProps) {
  const [values, setValues] = useState<Record<string, any>>(() => buildInitialValues(fields));
  const [showSuccess, setShowSuccess] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const visibleFields = fields.filter(
    (f) => !f.is_system && !f.is_hidden && !SYSTEM_TYPES.includes(f.ui_type),
  );

  const setValue = useCallback((fieldId: string, value: any) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const record: Record<string, any> = {};
    for (const f of visibleFields) {
      const v = values[f.id];
      if (v === '' || v === undefined || v === null) continue;
      if (f.ui_type === 'MultiSelect' && Array.isArray(v) && v.length === 0) continue;
      if (f.ui_type === 'Rating' && v === 0) continue;
      record[f.pg_column_name] = v;
    }
    onAddRow(record);
    setValues(buildInitialValues(fields));
    setShowSuccess(true);
    timerRef.current = setTimeout(() => setShowSuccess(false), 2000);
  };

  return (
    <div style={{ minHeight: '100%', background: '#F8FAFC', padding: '32px 16px' }}>
      {showSuccess && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            background: '#10B981',
            zIndex: 9999,
            animation: 'formSuccessFade 2s ease-out forwards',
          }}
        />
      )}
      <style>{`
        @keyframes formSuccessFade {
          0%, 60% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>

      <form
        onSubmit={handleSubmit}
        style={{
          maxWidth: 640,
          margin: '0 auto',
          background: '#FFFFFF',
          borderRadius: 8,
          border: '1px solid #E2E8F0',
          padding: '32px 28px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: '#0F172A' }}>
          New Record
        </h2>
        <p style={{ margin: '0 0 28px', fontSize: 14, color: '#94A3B8' }}>
          Fill in the fields below to create a new record.
        </p>

        {visibleFields.map((field) => (
          <FieldInput
            key={field.id}
            field={field}
            value={values[field.id]}
            onChange={(v) => setValue(field.id, v)}
          />
        ))}

        <button
          type="submit"
          disabled={isLoading}
          style={{
            width: '100%',
            padding: '10px 0',
            background: isLoading ? '#5AA5BB' : '#006994',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 6,
            fontSize: 15,
            fontWeight: 600,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            marginTop: 8,
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => {
            if (!isLoading) (e.currentTarget.style.background = '#005577');
          }}
          onMouseLeave={(e) => {
            if (!isLoading) (e.currentTarget.style.background = '#006994');
          }}
        >
          {isLoading ? 'Creating...' : 'Create Record'}
        </button>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface FieldInputProps {
  field: FieldMeta;
  value: any;
  onChange: (v: any) => void;
}

const inputBase: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: 14,
  color: '#0F172A',
  border: '1px solid #E2E8F0',
  borderRadius: 6,
  outline: 'none',
  background: '#FFFFFF',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s',
};

function FieldInput({ field, value, onChange }: FieldInputProps) {
  const inputType = (): string => {
    switch (field.ui_type) {
      case 'Email': return 'email';
      case 'URL': return 'url';
      case 'PhoneNumber': return 'tel';
      case 'Number': case 'Decimal': case 'Currency': case 'Percent':
        return 'number';
      case 'Date': return 'date';
      case 'DateTime': return 'datetime-local';
      default: return 'text';
    }
  };

  const step = (): string | undefined => {
    switch (field.ui_type) {
      case 'Number': return '1';
      case 'Decimal': return '0.0001';
      case 'Currency': return '0.01';
      case 'Percent': return '0.01';
      default: return undefined;
    }
  };

  const renderInput = () => {
    switch (field.ui_type) {
      case 'LongText':
        return (
          <textarea
            rows={3}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            style={{ ...inputBase, resize: 'vertical' }}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#006994')}
            onBlur={(e) => (e.currentTarget.style.borderColor = '#E2E8F0')}
          />
        );

      case 'Checkbox':
        return (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <div
              onClick={() => onChange(!value)}
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                border: `2px solid ${value ? '#006994' : '#E2E8F0'}`,
                background: value ? '#006994' : '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s',
                flexShrink: 0,
              }}
            >
              {value && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span style={{ fontSize: 14, color: '#0F172A' }}>
              {value ? 'Checked' : 'Unchecked'}
            </span>
          </label>
        );

      case 'SingleSelect': {
        const choices = field.options.choices ?? [];
        return (
          <select
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            style={{ ...inputBase, cursor: 'pointer' }}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#006994')}
            onBlur={(e) => (e.currentTarget.style.borderColor = '#E2E8F0')}
          >
            <option value="">Select an option</option>
            {choices.map((c) => {
              const color = getChoiceColor(c.color);
              return (
                <option key={c.title} value={c.title} style={{ color: color.text, background: color.bg }}>
                  {c.title}
                </option>
              );
            })}
          </select>
        );
      }

      case 'MultiSelect': {
        const choices = field.options.choices ?? [];
        const selected: string[] = Array.isArray(value) ? value : [];
        const toggle = (title: string) => {
          onChange(
            selected.includes(title)
              ? selected.filter((s) => s !== title)
              : [...selected, title],
          );
        };
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {choices.map((c) => {
              const color = getChoiceColor(c.color);
              const active = selected.includes(c.title);
              return (
                <button
                  type="button"
                  key={c.title}
                  onClick={() => toggle(c.title)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 12,
                    fontSize: 13,
                    fontWeight: 500,
                    border: active ? `2px solid ${color.text}` : '2px solid transparent',
                    background: color.bg,
                    color: color.text,
                    cursor: 'pointer',
                    opacity: active ? 1 : 0.6,
                    transition: 'all 0.15s',
                  }}
                >
                  {c.title}
                </button>
              );
            })}
            {choices.length === 0 && (
              <span style={{ fontSize: 13, color: '#94A3B8' }}>No choices defined</span>
            )}
          </div>
        );
      }

      case 'Rating': {
        const max = field.options.max ?? 5;
        const current = typeof value === 'number' ? value : 0;
        return (
          <div style={{ display: 'flex', gap: 4 }}>
            {Array.from({ length: max }, (_, i) => (
              <button
                type="button"
                key={i}
                onClick={() => onChange(current === i + 1 ? 0 : i + 1)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 2,
                  cursor: 'pointer',
                  transition: 'transform 0.1s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.15)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <Star
                  size={22}
                  fill={i < current ? '#F59E0B' : 'none'}
                  stroke={i < current ? '#F59E0B' : '#CBD5E1'}
                  strokeWidth={1.5}
                />
              </button>
            ))}
          </div>
        );
      }

      case 'Duration':
        return (
          <input
            type="text"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="HH:MM:SS"
            style={inputBase}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#006994')}
            onBlur={(e) => (e.currentTarget.style.borderColor = '#E2E8F0')}
          />
        );

      default:
        return (
          <input
            type={inputType()}
            value={value ?? ''}
            step={step()}
            onChange={(e) => onChange(
              inputType() === 'number' && e.target.value !== ''
                ? parseFloat(e.target.value)
                : e.target.value,
            )}
            style={inputBase}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#006994')}
            onBlur={(e) => (e.currentTarget.style.borderColor = '#E2E8F0')}
          />
        );
    }
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500, color: '#0F172A' }}>
        {field.name}
        {field.is_required && <span style={{ color: '#EF4444', marginLeft: 2 }}>*</span>}
      </label>
      {field.description && (
        <p style={{ margin: '0 0 6px', fontSize: 13, color: '#94A3B8' }}>
          {field.description}
        </p>
      )}
      {renderInput()}
    </div>
  );
}
