import { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X, Star } from 'lucide-react';
import { useUpdateField } from '../hooks';
import type { FieldMeta, SelectChoice, FieldOptions, UIType } from '../types';
import { PILL_COLORS } from '../types';
import { getFieldTypeIcon } from './grid/field-icons';

interface EditFieldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field: FieldMeta | null;
  tableId: string;
}

const UI_TYPE_LABELS: Partial<Record<UIType, string>> = {
  SingleLineText: 'Single Line Text',
  LongText: 'Long Text',
  Email: 'Email',
  PhoneNumber: 'Phone Number',
  URL: 'URL',
  Number: 'Number',
  Decimal: 'Decimal',
  Currency: 'Currency',
  Percent: 'Percent',
  Duration: 'Duration',
  Rating: 'Rating',
  Date: 'Date',
  DateTime: 'Date & Time',
  Year: 'Year',
  Time: 'Time',
  CreatedTime: 'Created Time',
  LastModifiedTime: 'Last Modified Time',
  SingleSelect: 'Single Select',
  MultiSelect: 'Multi Select',
  Checkbox: 'Checkbox',
  Links: 'Link',
  Lookup: 'Lookup',
  Rollup: 'Rollup',
  Formula: 'Formula',
  Attachment: 'Attachment',
  ID: 'ID',
  AutoNumber: 'Auto Number',
  CreatedBy: 'Created By',
  LastModifiedBy: 'Last Modified By',
  JSON: 'JSON',
};

export function EditFieldDialog({ open, onOpenChange, field, tableId }: EditFieldDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const [choices, setChoices] = useState<SelectChoice[]>([]);
  const [newChoiceText, setNewChoiceText] = useState('');
  const [ratingMax, setRatingMax] = useState(5);
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [precision, setPrecision] = useState(2);

  const updateField = useUpdateField();

  // Sync form state when field changes
  useEffect(() => {
    if (field) {
      setName(field.name);
      setDescription(field.description ?? '');
      setChoices(field.options?.choices ?? []);
      setRatingMax(field.options?.max ?? 5);
      setCurrencyCode(field.options?.currencyCode ?? 'USD');
      setPrecision(field.options?.precision ?? 2);
      setError('');
      setNewChoiceText('');
    }
  }, [field]);

  const addChoice = useCallback(() => {
    const text = newChoiceText.trim();
    if (!text || choices.some((c) => c.title === text)) return;
    const colorIdx = choices.length % PILL_COLORS.length;
    setChoices([...choices, { title: text, color: PILL_COLORS[colorIdx].name }]);
    setNewChoiceText('');
  }, [newChoiceText, choices]);

  const removeChoice = useCallback(
    (title: string) => setChoices(choices.filter((c) => c.title !== title)),
    [choices],
  );

  const buildOptions = (): FieldOptions => {
    if (!field) return {};
    const opts: FieldOptions = { ...field.options };
    if (field.ui_type === 'SingleSelect' || field.ui_type === 'MultiSelect') {
      opts.choices = choices;
    }
    if (field.ui_type === 'Rating') {
      opts.max = ratingMax;
    }
    if (field.ui_type === 'Currency') {
      opts.currencyCode = currencyCode;
      opts.precision = precision;
    }
    if (field.ui_type === 'Decimal') {
      opts.precision = precision;
    }
    return opts;
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Field name is required');
      return;
    }
    if (!field) return;
    setError('');
    try {
      await updateField.mutateAsync({
        id: field.id,
        table_id: tableId,
        updates: {
          name: name.trim(),
          description: description.trim() || null,
          options: buildOptions(),
        },
      });
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to update field');
    }
  };

  if (!field) return null;

  const Icon = getFieldTypeIcon(field.ui_type);
  const typeLabel = UI_TYPE_LABELS[field.ui_type] ?? field.ui_type;

  const showChoicesEditor = field.ui_type === 'SingleSelect' || field.ui_type === 'MultiSelect';
  const showRatingConfig = field.ui_type === 'Rating';
  const showCurrencyConfig = field.ui_type === 'Currency';
  const showPrecisionConfig = field.ui_type === 'Decimal';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Edit Field</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Field type (read-only) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-[#4A5268]">Field type</Label>
            <div
              className="flex items-center gap-2 px-3 h-9 rounded-md border text-sm"
              style={{
                borderColor: '#E7E7E9',
                backgroundColor: '#F9F9FA',
                color: '#6A7184',
              }}
            >
              <Icon size={14} className="text-[#9AA2AF]" />
              {typeLabel}
            </div>
          </div>

          {/* Field name */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-field-name" className="text-xs font-medium text-[#4A5268]">
              Field name
            </Label>
            <Input
              id="edit-field-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Amount, Status"
              autoFocus
              className="h-9"
              onKeyDown={(e) => e.key === 'Enter' && !showChoicesEditor && handleSave()}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-[#4A5268]">
              Description <span className="text-[#9AA2AF] font-normal">(optional)</span>
            </Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this field..."
              className="h-9"
            />
          </div>

          {/* Choices editor for SingleSelect / MultiSelect */}
          {showChoicesEditor && (
            <div className="space-y-2">
              <Label className="text-xs font-medium text-[#4A5268]">Options</Label>
              <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                {choices.map((choice) => {
                  const color = PILL_COLORS.find((c) => c.name === choice.color) || PILL_COLORS[7];
                  return (
                    <div key={choice.title} className="flex items-center gap-2">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-1 min-w-0"
                        style={{ backgroundColor: color.bg, color: color.text }}
                      >
                        <span className="truncate">{choice.title}</span>
                      </span>
                      <button
                        className="p-0.5 rounded hover:bg-[#F4F4F5] shrink-0"
                        onClick={() => removeChoice(choice.title)}
                      >
                        <X size={12} className="text-[#9AA2AF]" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-1.5">
                <Input
                  value={newChoiceText}
                  onChange={(e) => setNewChoiceText(e.target.value)}
                  placeholder="Add an option..."
                  className="text-xs h-8"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addChoice();
                    }
                  }}
                />
                <Button variant="ghost" size="sm" className="h-8 px-2 shrink-0 hover:bg-[#F4F4F5]" onClick={addChoice}>
                  <Plus size={14} />
                </Button>
              </div>
            </div>
          )}

          {/* Rating max selector */}
          {showRatingConfig && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#4A5268]">Max rating</Label>
              <div className="flex items-center gap-2">
                {[3, 5, 10].map((n) => (
                  <button
                    key={n}
                    className={`px-3 py-1 rounded text-xs border transition-colors ${
                      ratingMax === n
                        ? 'bg-[#3366FF] text-white border-[#3366FF]'
                        : 'bg-white text-[#4A5268] border-[#E7E7E9] hover:border-[#3366FF]'
                    }`}
                    onClick={() => setRatingMax(n)}
                  >
                    {n} <Star size={10} className="inline" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Currency code selector */}
          {showCurrencyConfig && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#4A5268]">Currency</Label>
              <Select value={currencyCode} onValueChange={setCurrencyCode}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['USD', 'EUR', 'GBP', 'NGN', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR'].map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Decimal precision selector */}
          {showPrecisionConfig && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#4A5268]">Decimal places</Label>
              <Select value={String(precision)} onValueChange={(v) => setPrecision(Number(v))}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 1, 2, 3, 4].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-[#3366FF] hover:bg-[#2952CC] text-white"
            onClick={handleSave}
            disabled={updateField.isPending || !name.trim()}
          >
            {updateField.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
