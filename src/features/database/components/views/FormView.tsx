import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  CheckCircle, Star, GripVertical, ImageIcon, RotateCcw, Eye, EyeOff,
  Settings2, Share2, ExternalLink, Copy, Check, Palette, Type,
  Upload, Paperclip, X, FileText,
} from 'lucide-react';
import type { FieldMeta, ViewMeta, FormConfig, FormFieldConfig } from '../../types';
import { PILL_COLORS, VIRTUAL_TYPES } from '../../types';
import { getFieldTypeIcon } from '../grid/field-icons';
import { useUpdateView } from '../../hooks/useViews';
import { useSharedView, useCreateSharedView } from '../../hooks/useSharedViews';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';

interface FormViewProps {
  fields: FieldMeta[];
  onAddRow: (record: Record<string, any>) => void;
  isLoading: boolean;
  view?: ViewMeta;
  isPublic?: boolean;
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
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all border"
            style={{
              backgroundColor: selected ? color.bg : 'transparent',
              color: selected ? color.text : undefined,
              borderColor: selected ? `${color.text}30` : '#E2E8F0',
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
    <div className="flex gap-1">
      {Array.from({ length: max }, (_, i) => (
        <button
          key={i}
          type="button"
          className="text-xl transition-transform hover:scale-110"
          style={{ color: i < value ? '#F59E0B' : '#E2E8F0' }}
          onClick={() => onChange(i + 1 === value ? 0 : i + 1)}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function AttachmentInput({
  value,
  onChange,
}: {
  value: { name: string; url: string; type: string; size: number }[];
  onChange: (v: { name: string; url: string; type: string; size: number }[]) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | File[]) => {
    setUploading(true);
    const newFiles: { name: string; url: string; type: string; size: number }[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 50 * 1024 * 1024) continue;
      const ts = Date.now();
      const path = `form-uploads/${ts}_${file.name}`;
      const { error } = await supabase.storage
        .from('attachments')
        .upload(path, file, { upsert: false });
      if (error) continue;
      const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path);
      newFiles.push({ name: file.name, url: urlData.publicUrl, type: file.type, size: file.size });
    }
    onChange([...value, ...newFiles]);
    setUploading(false);
  };

  const removeFile = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        className="flex flex-col items-center justify-center gap-1.5 py-6 rounded-lg cursor-pointer transition-colors"
        style={{
          border: `2px dashed ${dragOver ? '#2D7FF9' : '#E2E8F0'}`,
          backgroundColor: dragOver ? 'rgba(45,127,249,0.04)' : 'transparent',
        }}
      >
        <Upload size={20} className={dragOver ? 'text-[#2D7FF9]' : 'text-[#94A3B8]'} />
        <span className="text-xs text-[#64748B]">
          {uploading ? 'Uploading...' : 'Drop files or click to upload'}
        </span>
      </div>
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => { if (e.target.files?.length) { handleFiles(e.target.files); e.target.value = ''; } }}
      />
      {value.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {value.map((f, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-md bg-[#F8FAFC] dark:bg-[hsl(220,18%,12%)] border border-[#E2E8F0] dark:border-[hsl(220,15%,20%)]">
              {f.type?.startsWith('image/') ? (
                <img src={f.url} alt={f.name} className="h-8 w-8 rounded object-cover shrink-0" />
              ) : (
                <FileText size={16} className="text-[#94A3B8] shrink-0" />
              )}
              <span className="text-xs text-[#1E293B] dark:text-[hsl(210,20%,85%)] truncate flex-1">{f.name}</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); removeFile(i); }} className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20">
                <X size={12} className="text-[#94A3B8] hover:text-red-500" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const SYSTEM_TYPES = new Set<string>([
  'ID', 'AutoNumber', 'CreatedTime', 'LastModifiedTime', 'CreatedBy', 'LastModifiedBy',
]);

const COVER_COLORS = [
  { name: 'Blue', value: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)' },
  { name: 'Teal', value: 'linear-gradient(135deg, #0EA5E9 0%, #2DD4BF 100%)' },
  { name: 'Green', value: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)' },
  { name: 'Orange', value: 'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)' },
  { name: 'Purple', value: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)' },
  { name: 'Slate', value: 'linear-gradient(135deg, #475569 0%, #1E293B 100%)' },
  { name: 'Indigo', value: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)' },
  { name: 'Rose', value: 'linear-gradient(135deg, #FDA4AF 0%, #FB7185 100%)' },
];

export default function FormView({ fields, onAddRow, isLoading, view, isPublic }: FormViewProps) {
  const updateView = useUpdateView();
  const formConfig: FormConfig = view?.form_config ?? {};
  const fieldConfigs = formConfig.field_configs ?? {};

  const allEditableFields = useMemo(
    () =>
      fields
        .filter(
          (f) =>
            !f.is_system &&
            !SYSTEM_TYPES.has(f.ui_type) &&
            !VIRTUAL_TYPES.includes(f.ui_type),
        )
        .sort((a, b) => a.position - b.position),
    [fields],
  );

  const visibleFields = useMemo(
    () => allEditableFields.filter((f) => !fieldConfigs[f.id]?.hidden),
    [allEditableFields, fieldConfigs],
  );

  const hiddenFields = useMemo(
    () => allEditableFields.filter((f) => fieldConfigs[f.id]?.hidden),
    [allEditableFields, fieldConfigs],
  );

  const [values, setValues] = useState<Record<string, any>>({});
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showBuilder, setShowBuilder] = useState(!isPublic);
  const [copiedLink, setCopiedLink] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  const { data: sharedView } = useSharedView(view?.id);
  const createSharedView = useCreateSharedView();

  const saveConfig = useCallback(
    (patch: Partial<FormConfig>) => {
      if (!view) return;
      const newConfig = { ...formConfig, ...patch };
      updateView.mutate({
        id: view.id,
        table_id: view.table_id,
        updates: { form_config: newConfig },
      });
    },
    [view, formConfig, updateView],
  );

  const updateFieldConfig = useCallback(
    (fieldId: string, patch: Partial<FormFieldConfig>) => {
      const current = fieldConfigs[fieldId] ?? {};
      saveConfig({
        field_configs: { ...fieldConfigs, [fieldId]: { ...current, ...patch } },
      });
    },
    [fieldConfigs, saveConfig],
  );

  const isFieldRequired = useCallback(
    (f: FieldMeta) => fieldConfigs[f.id]?.required ?? f.is_required,
    [fieldConfigs],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    for (const f of visibleFields) {
      if (isFieldRequired(f)) {
        const v = values[f.id];
        if (v === undefined || v === '' || v === null || (Array.isArray(v) && v.length === 0)) {
          newErrors[f.id] = 'This field is required';
        }
      }
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    const record: Record<string, any> = {};
    const numericTypes = new Set(['Number', 'Decimal', 'Currency', 'Percent', 'Duration']);
    for (const f of visibleFields) {
      const v = values[f.id];
      if (v !== undefined && v !== '') {
        record[f.pg_column_name] = numericTypes.has(f.ui_type) ? Number(v) : v;
      }
    }
    onAddRow(record);
    setValues({});
    setErrors({});
    setSubmitted(true);
  };

  const handleSubmitAnother = () => {
    setSubmitted(false);
    setValues({});
  };

  const formTitle = formConfig.title || view?.name || 'New Record';
  const formDescription = formConfig.description || 'Fill out the fields below to submit a new record.';
  const coverColor = formConfig.cover_color || COVER_COLORS[0].value;
  const submitLabel = formConfig.submit_label || 'Submit';
  const successMessage = formConfig.success_message || 'Your response has been recorded.';

  const handleShareForm = async () => {
    if (!view) return;
    if (sharedView) {
      const url = `${window.location.origin}/shared/${sharedView.share_token}`;
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      toast({ title: 'Link copied', description: 'Form link copied to clipboard' });
    } else {
      createSharedView.mutate(
        { view_id: view.id, table_id: view.table_id },
        {
          onSuccess: (sv) => {
            const url = `${window.location.origin}/shared/${sv.share_token}`;
            navigator.clipboard.writeText(url);
            setCopiedLink(true);
            setTimeout(() => setCopiedLink(false), 2000);
            toast({ title: 'Form shared', description: 'Public form link copied to clipboard' });
          },
        },
      );
    }
  };

  const inputClass =
    'w-full border border-[#E2E8F0] dark:border-[hsl(220,15%,22%)] rounded-lg px-3.5 py-2.5 text-sm text-[#1E293B] dark:text-[hsl(210,20%,90%)] bg-white dark:bg-[hsl(220,20%,10%)] focus:outline-none focus:ring-2 focus:ring-[#2D7FF9]/25 focus:border-[#2D7FF9] placeholder:text-[#94A3B8] dark:placeholder:text-[hsl(215,12%,40%)] transition-all';

  const renderInput = (f: FieldMeta) => {
    const req = isFieldRequired(f);
    const hasError = !!errors[f.id];
    const errorClass = hasError ? ' border-red-400 focus:ring-red-400/25 focus:border-red-400' : '';

    switch (f.ui_type) {
      case 'LongText':
        return (
          <textarea
            className={inputClass + errorClass + ' resize-none'}
            rows={4}
            value={values[f.id] ?? ''}
            onChange={(e) => { setValues((v) => ({ ...v, [f.id]: e.target.value })); setErrors((p) => { const n = { ...p }; delete n[f.id]; return n; }); }}
            required={req}
            placeholder={fieldConfigs[f.id]?.description || `Enter ${f.name.toLowerCase()}...`}
          />
        );
      case 'Checkbox':
        return (
          <label className="relative inline-flex items-center cursor-pointer group/cb">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={!!values[f.id]}
              onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.checked }))}
            />
            <div className="w-10 h-[22px] bg-[#E2E8F0] dark:bg-[hsl(220,15%,22%)] rounded-full peer peer-checked:bg-[#2D7FF9] transition-colors after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all after:shadow-sm peer-checked:after:translate-x-[18px]" />
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
            className={inputClass + errorClass}
            value={values[f.id] ?? ''}
            onChange={(e) => { setValues((v) => ({ ...v, [f.id]: e.target.value })); setErrors((p) => { const n = { ...p }; delete n[f.id]; return n; }); }}
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
            className={inputClass + errorClass}
            value={values[f.id] ?? ''}
            onChange={(e) => { setValues((v) => ({ ...v, [f.id]: e.target.value })); setErrors((p) => { const n = { ...p }; delete n[f.id]; return n; }); }}
            required={req}
          />
        );
      case 'DateTime':
        return (
          <input
            type="datetime-local"
            className={inputClass + errorClass}
            value={values[f.id] ?? ''}
            onChange={(e) => { setValues((v) => ({ ...v, [f.id]: e.target.value })); setErrors((p) => { const n = { ...p }; delete n[f.id]; return n; }); }}
            required={req}
          />
        );
      case 'Time':
        return (
          <input
            type="time"
            className={inputClass + errorClass}
            value={values[f.id] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
            required={req}
          />
        );
      case 'Year':
        return (
          <input
            type="number"
            className={inputClass + errorClass}
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
            className={inputClass + errorClass}
            value={values[f.id] ?? ''}
            onChange={(e) => { setValues((v) => ({ ...v, [f.id]: e.target.value })); setErrors((p) => { const n = { ...p }; delete n[f.id]; return n; }); }}
            required={req}
          >
            <option value="">Select an option...</option>
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
      case 'Attachment':
        return (
          <AttachmentInput
            value={Array.isArray(values[f.id]) ? values[f.id] : []}
            onChange={(v) => { setValues((prev) => ({ ...prev, [f.id]: v })); setErrors((p) => { const n = { ...p }; delete n[f.id]; return n; }); }}
          />
        );
      default:
        return (
          <input
            type={f.ui_type === 'Email' ? 'email' : f.ui_type === 'URL' ? 'url' : f.ui_type === 'PhoneNumber' ? 'tel' : 'text'}
            className={inputClass + errorClass}
            value={values[f.id] ?? ''}
            onChange={(e) => { setValues((v) => ({ ...v, [f.id]: e.target.value })); setErrors((p) => { const n = { ...p }; delete n[f.id]; return n; }); }}
            required={req}
            placeholder={fieldConfigs[f.id]?.description || `Enter ${f.name.toLowerCase()}...`}
          />
        );
    }
  };

  // --- Success screen ---
  if (submitted) {
    return (
      <div className="flex-1 overflow-auto flex justify-center items-start py-12 px-4 bg-[#F8FAFC] dark:bg-[hsl(220,20%,7%)]">
        <div className="w-full max-w-xl mx-auto">
          <div className="bg-white dark:bg-[hsl(220,20%,10%)] rounded-2xl border border-[#E2E8F0] dark:border-[hsl(220,15%,18%)] shadow-lg shadow-black/[0.04] overflow-hidden">
            <div className="h-2 rounded-t-2xl" style={{ background: coverColor }} />
            <div className="p-12 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-6">
                <CheckCircle size={36} className="text-emerald-500" />
              </div>
              <h2 className="text-xl font-semibold text-[#1E293B] dark:text-[hsl(210,20%,90%)] mb-2">
                Thank you!
              </h2>
              <p className="text-sm text-[#64748B] dark:text-[hsl(215,15%,55%)] mb-8 max-w-sm">
                {successMessage}
              </p>
              <button
                type="button"
                onClick={handleSubmitAnother}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium text-white bg-[#2D7FF9] hover:bg-[#1D6FE9] transition-colors shadow-sm"
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

  // --- Form builder sidebar ---
  const renderBuilderSidebar = () => {
    if (!showBuilder || isPublic) return null;

    const selectedField = selectedFieldId ? allEditableFields.find((f) => f.id === selectedFieldId) : null;

    return (
      <div className="w-[280px] shrink-0 bg-white dark:bg-[hsl(220,20%,9%)] border-r border-[#E2E8F0] dark:border-[hsl(220,15%,18%)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#E2E8F0] dark:border-[hsl(220,15%,18%)] flex items-center justify-between">
          <span className="text-xs font-semibold text-[#64748B] dark:text-[hsl(215,12%,50%)] uppercase tracking-wider">Form Builder</span>
          <button
            onClick={handleShareForm}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-[#2D7FF9] hover:bg-[#2D7FF9]/10 transition-colors"
          >
            {copiedLink ? <Check size={12} /> : <Share2 size={12} />}
            {copiedLink ? 'Copied!' : 'Share'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Cover color */}
          <div className="px-4 py-3 border-b border-[#F1F5F9] dark:border-[hsl(220,15%,15%)]">
            <label className="text-[11px] font-semibold text-[#94A3B8] dark:text-[hsl(215,12%,45%)] uppercase tracking-wider mb-2 block">Cover</label>
            <div className="grid grid-cols-4 gap-1.5">
              {COVER_COLORS.map((c) => (
                <button
                  key={c.name}
                  className="h-6 rounded-md transition-all hover:scale-105"
                  style={{
                    background: c.value,
                    outline: coverColor === c.value ? '2px solid #2D7FF9' : 'none',
                    outlineOffset: 1,
                  }}
                  onClick={() => saveConfig({ cover_color: c.value })}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          {/* Submit button label */}
          <div className="px-4 py-3 border-b border-[#F1F5F9] dark:border-[hsl(220,15%,15%)]">
            <label className="text-[11px] font-semibold text-[#94A3B8] dark:text-[hsl(215,12%,45%)] uppercase tracking-wider mb-1.5 block">Submit Button</label>
            <input
              type="text"
              value={formConfig.submit_label ?? ''}
              onChange={(e) => saveConfig({ submit_label: e.target.value })}
              placeholder="Submit"
              className="w-full text-xs px-2.5 py-1.5 rounded-md border border-[#E2E8F0] dark:border-[hsl(220,15%,22%)] bg-transparent focus:outline-none focus:border-[#2D7FF9] text-[#1E293B] dark:text-[hsl(210,20%,85%)]"
            />
          </div>

          {/* Success message */}
          <div className="px-4 py-3 border-b border-[#F1F5F9] dark:border-[hsl(220,15%,15%)]">
            <label className="text-[11px] font-semibold text-[#94A3B8] dark:text-[hsl(215,12%,45%)] uppercase tracking-wider mb-1.5 block">Success Message</label>
            <textarea
              value={formConfig.success_message ?? ''}
              onChange={(e) => saveConfig({ success_message: e.target.value })}
              placeholder="Your response has been recorded."
              rows={2}
              className="w-full text-xs px-2.5 py-1.5 rounded-md border border-[#E2E8F0] dark:border-[hsl(220,15%,22%)] bg-transparent focus:outline-none focus:border-[#2D7FF9] resize-none text-[#1E293B] dark:text-[hsl(210,20%,85%)]"
            />
          </div>

          {/* Visible fields */}
          <div className="px-4 py-3">
            <label className="text-[11px] font-semibold text-[#94A3B8] dark:text-[hsl(215,12%,45%)] uppercase tracking-wider mb-2 block">
              Fields ({visibleFields.length})
            </label>
            <div className="space-y-0.5">
              {visibleFields.map((f) => {
                const Icon = getFieldTypeIcon(f.ui_type);
                const fc = fieldConfigs[f.id] ?? {};
                const isSelected = selectedFieldId === f.id;
                return (
                  <div
                    key={f.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${isSelected ? 'bg-[#2D7FF9]/10' : 'hover:bg-[#F1F5F9] dark:hover:bg-[hsl(220,15%,14%)]'}`}
                    onClick={() => setSelectedFieldId(isSelected ? null : f.id)}
                  >
                    <GripVertical size={12} className="text-[#CBD5E1] dark:text-[hsl(215,12%,30%)] shrink-0" />
                    <Icon size={12} className="text-[#94A3B8] dark:text-[hsl(215,12%,45%)] shrink-0" />
                    <span className="text-xs text-[#1E293B] dark:text-[hsl(210,20%,85%)] truncate flex-1">{f.name}</span>
                    {fc.required && <span className="text-red-400 text-[10px]">*</span>}
                    <button
                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[#FEE2E2] rounded transition-all"
                      onClick={(e) => { e.stopPropagation(); updateFieldConfig(f.id, { hidden: true }); }}
                      title="Hide field"
                    >
                      <EyeOff size={11} className="text-[#94A3B8]" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected field config */}
          {selectedField && (
            <div className="px-4 py-3 border-t border-[#E2E8F0] dark:border-[hsl(220,15%,18%)] bg-[#F8FAFC] dark:bg-[hsl(220,18%,8%)]">
              <div className="flex items-center gap-2 mb-3">
                {(() => { const Icon = getFieldTypeIcon(selectedField.ui_type); return <Icon size={13} className="text-[#64748B]" />; })()}
                <span className="text-xs font-semibold text-[#1E293B] dark:text-[hsl(210,20%,85%)]">{selectedField.name}</span>
              </div>
              <div className="space-y-2.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fieldConfigs[selectedField.id]?.required ?? selectedField.is_required}
                    onChange={(e) => updateFieldConfig(selectedField.id, { required: e.target.checked })}
                    className="w-3.5 h-3.5 rounded border-[#CBD5E1] text-[#2D7FF9] focus:ring-[#2D7FF9]/25"
                  />
                  <span className="text-xs text-[#475569] dark:text-[hsl(215,15%,60%)]">Required</span>
                </label>
                <div>
                  <label className="text-[10px] font-medium text-[#94A3B8] uppercase tracking-wider mb-1 block">Help Text</label>
                  <input
                    type="text"
                    value={fieldConfigs[selectedField.id]?.description ?? ''}
                    onChange={(e) => updateFieldConfig(selectedField.id, { description: e.target.value })}
                    placeholder="Add help text..."
                    className="w-full text-xs px-2 py-1.5 rounded border border-[#E2E8F0] dark:border-[hsl(220,15%,22%)] bg-transparent focus:outline-none focus:border-[#2D7FF9] text-[#1E293B] dark:text-[hsl(210,20%,85%)]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Hidden fields */}
          {hiddenFields.length > 0 && (
            <div className="px-4 py-3 border-t border-[#E2E8F0] dark:border-[hsl(220,15%,18%)]">
              <label className="text-[11px] font-semibold text-[#94A3B8] dark:text-[hsl(215,12%,45%)] uppercase tracking-wider mb-2 block">
                Hidden ({hiddenFields.length})
              </label>
              <div className="space-y-0.5">
                {hiddenFields.map((f) => {
                  const Icon = getFieldTypeIcon(f.ui_type);
                  return (
                    <div
                      key={f.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[#F1F5F9] dark:hover:bg-[hsl(220,15%,14%)] cursor-pointer opacity-50 transition-colors"
                      onClick={() => updateFieldConfig(f.id, { hidden: false })}
                    >
                      <Icon size={12} className="text-[#94A3B8] shrink-0" />
                      <span className="text-xs text-[#64748B] truncate flex-1">{f.name}</span>
                      <Eye size={11} className="text-[#94A3B8] shrink-0" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // --- Main form ---
  return (
    <div className="flex-1 min-h-0 flex overflow-hidden">
      {renderBuilderSidebar()}

      <div className="flex-1 overflow-auto flex justify-center py-10 px-4 bg-[#F8FAFC] dark:bg-[hsl(220,20%,7%)]">
        <div className="w-full max-w-xl mx-auto">
          <form onSubmit={handleSubmit}>
            {/* Cover */}
            <div
              className="rounded-t-2xl h-32 flex items-center justify-center relative overflow-hidden"
              style={{ background: coverColor }}
            >
              {!isPublic && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/10">
                  <div className="flex items-center gap-1.5 text-white/90 text-xs font-medium">
                    <Palette size={14} />
                    Change in sidebar
                  </div>
                </div>
              )}
            </div>

            {/* Form header */}
            <div className="bg-white dark:bg-[hsl(220,20%,10%)] border-x border-[#E2E8F0] dark:border-[hsl(220,15%,18%)] px-8 pt-7 pb-5">
              {isPublic ? (
                <>
                  <h1 className="text-2xl font-bold text-[#1E293B] dark:text-[hsl(210,20%,92%)] leading-tight">{formTitle}</h1>
                  <p className="mt-2 text-sm text-[#64748B] dark:text-[hsl(215,15%,55%)] leading-relaxed">{formDescription}</p>
                </>
              ) : (
                <>
                  <input
                    type="text"
                    value={formConfig.title ?? ''}
                    onChange={(e) => saveConfig({ title: e.target.value })}
                    className="w-full text-2xl font-bold text-[#1E293B] dark:text-[hsl(210,20%,92%)] bg-transparent border-none outline-none placeholder:text-[#CBD5E1] dark:placeholder:text-[hsl(215,12%,30%)]"
                    placeholder="Form title"
                  />
                  <input
                    type="text"
                    value={formConfig.description ?? ''}
                    onChange={(e) => saveConfig({ description: e.target.value })}
                    className="w-full mt-2 text-sm text-[#64748B] dark:text-[hsl(215,15%,55%)] bg-transparent border-none outline-none placeholder:text-[#CBD5E1] dark:placeholder:text-[hsl(215,12%,30%)]"
                    placeholder="Add a description..."
                  />
                </>
              )}
            </div>

            {/* Fields */}
            <div className="space-y-0">
              {visibleFields.map((f) => {
                const Icon = getFieldTypeIcon(f.ui_type);
                const req = isFieldRequired(f);
                const fc = fieldConfigs[f.id] ?? {};
                const isSelected = selectedFieldId === f.id;
                const hasError = !!errors[f.id];
                return (
                  <div
                    key={f.id}
                    className={`bg-white dark:bg-[hsl(220,20%,10%)] border-x border-b border-[#E2E8F0] dark:border-[hsl(220,15%,18%)] px-8 py-5 transition-all ${isSelected && !isPublic ? 'ring-2 ring-inset ring-[#2D7FF9]/20' : ''}`}
                    onClick={() => !isPublic && setSelectedFieldId(f.id)}
                  >
                    <div className="flex items-start gap-3">
                      {!isPublic && (
                        <div className="mt-1 opacity-0 group-hover:opacity-40 transition-opacity cursor-grab text-[#94A3B8]">
                          <GripVertical size={16} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Icon size={14} className="text-[#94A3B8] dark:text-[hsl(215,12%,45%)] shrink-0" />
                          <span className="text-sm font-semibold text-[#1E293B] dark:text-[hsl(210,20%,90%)]">
                            {f.name}
                          </span>
                          {req && <span className="text-red-400 text-sm font-bold">*</span>}
                        </div>
                        {(fc.description || f.description) && (
                          <p className="text-xs text-[#94A3B8] dark:text-[hsl(215,12%,50%)] mb-2.5">{fc.description || f.description}</p>
                        )}
                        {renderInput(f)}
                        {hasError && (
                          <p className="text-xs text-red-500 mt-1.5">{errors[f.id]}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Submit */}
            <div className="bg-white dark:bg-[hsl(220,20%,10%)] border-x border-b border-[#E2E8F0] dark:border-[hsl(220,15%,18%)] rounded-b-2xl px-8 py-6">
              <button
                type="submit"
                disabled={isLoading}
                className="px-8 py-2.5 rounded-lg text-white text-sm font-medium bg-[#2D7FF9] hover:bg-[#1D6FE9] transition-colors disabled:opacity-50 shadow-sm"
              >
                {isLoading ? 'Submitting...' : submitLabel}
              </button>
            </div>
          </form>

          {/* Branding */}
          {(formConfig.show_branding !== false) && (
            <p className="text-center text-[11px] text-[#CBD5E1] dark:text-[hsl(215,12%,30%)] mt-4">
              Powered by KDOps
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
