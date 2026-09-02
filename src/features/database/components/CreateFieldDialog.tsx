import { useState, useCallback } from 'react';
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
import { Link2, Plus, X, Star } from 'lucide-react';
import { useCreateField } from '../hooks';
import { useDatabaseUI } from '../lib/store';
import type { UIType, SelectChoice, FieldOptions } from '../types';
import { PILL_COLORS } from '../types';
import { getFieldTypeIcon } from './grid/field-icons';
import { CreateLinkDialog } from './CreateLinkDialog';

interface CreateFieldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FIELD_TYPE_OPTIONS: { value: UIType | '_link'; label: string; group: string }[] = [
  { value: 'SingleLineText', label: 'Single Line Text', group: 'Text' },
  { value: 'LongText', label: 'Long Text', group: 'Text' },
  { value: 'Email', label: 'Email', group: 'Text' },
  { value: 'PhoneNumber', label: 'Phone Number', group: 'Text' },
  { value: 'URL', label: 'URL', group: 'Text' },
  { value: 'Number', label: 'Number', group: 'Numeric' },
  { value: 'Decimal', label: 'Decimal', group: 'Numeric' },
  { value: 'Currency', label: 'Currency', group: 'Numeric' },
  { value: 'Percent', label: 'Percent', group: 'Numeric' },
  { value: 'Duration', label: 'Duration', group: 'Numeric' },
  { value: 'Rating', label: 'Rating', group: 'Numeric' },
  { value: 'Date', label: 'Date', group: 'Date & Time' },
  { value: 'DateTime', label: 'Date & Time', group: 'Date & Time' },
  { value: 'Time', label: 'Time', group: 'Date & Time' },
  { value: 'Year', label: 'Year', group: 'Date & Time' },
  { value: 'Checkbox', label: 'Checkbox', group: 'Selection' },
  { value: 'SingleSelect', label: 'Single Select', group: 'Selection' },
  { value: 'MultiSelect', label: 'Multi Select', group: 'Selection' },
  { value: 'Attachment', label: 'Attachment', group: 'Other' },
  { value: 'JSON', label: 'JSON', group: 'Other' },
  { value: '_link', label: 'Link to Another Table', group: 'Relations' },
];

export function CreateFieldDialog({ open, onOpenChange }: CreateFieldDialogProps) {
  const [name, setName] = useState('');
  const [uiType, setUiType] = useState<UIType | '_link'>('SingleLineText');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);

  const [choices, setChoices] = useState<SelectChoice[]>([]);
  const [newChoiceText, setNewChoiceText] = useState('');
  const [ratingMax, setRatingMax] = useState(5);
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [precision, setPrecision] = useState(2);

  const { activeTableId } = useDatabaseUI();
  const createField = useCreateField();

  const resetForm = useCallback(() => {
    setName('');
    setUiType('SingleLineText');
    setDescription('');
    setError('');
    setChoices([]);
    setNewChoiceText('');
    setRatingMax(5);
    setCurrencyCode('USD');
    setPrecision(2);
  }, []);

  const handleTypeChange = (v: string) => {
    if (v === '_link') {
      onOpenChange(false);
      setLinkDialogOpen(true);
      return;
    }
    setUiType(v as UIType);
  };

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
    const opts: FieldOptions = {};
    if (uiType === 'SingleSelect' || uiType === 'MultiSelect') {
      opts.choices = choices;
    }
    if (uiType === 'Rating') {
      opts.max = ratingMax;
    }
    if (uiType === 'Currency') {
      opts.currencyCode = currencyCode;
      opts.precision = precision;
    }
    if (uiType === 'Decimal') {
      opts.precision = precision;
    }
    return opts;
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Field name is required');
      return;
    }
    if (!activeTableId) {
      setError('No table selected');
      return;
    }
    if (uiType === '_link') {
      onOpenChange(false);
      setLinkDialogOpen(true);
      return;
    }
    setError('');
    try {
      await createField.mutateAsync({
        table_id: activeTableId,
        name: name.trim(),
        ui_type: uiType,
        options: buildOptions(),
        description: description.trim() || undefined,
      });
      resetForm();
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create field');
    }
  };

  const showChoicesEditor = uiType === 'SingleSelect' || uiType === 'MultiSelect';
  const showRatingConfig = uiType === 'Rating';
  const showCurrencyConfig = uiType === 'Currency';
  const showPrecisionConfig = uiType === 'Decimal';

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Add Field</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="field-name" className="text-xs font-medium text-[#4A5268]">
                Field name
              </Label>
              <Input
                id="field-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Amount, Status"
                autoFocus
                className="h-9"
                onKeyDown={(e) => e.key === 'Enter' && !showChoicesEditor && handleCreate()}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#4A5268]">Field type</Label>
              <Select value={uiType} onValueChange={handleTypeChange}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {FIELD_TYPE_OPTIONS.map((opt) => {
                    const Icon = opt.value === '_link' ? Link2 : getFieldTypeIcon(opt.value as UIType);
                    return (
                      <SelectItem key={opt.value} value={opt.value}>
                        <span className="flex items-center gap-2">
                          <Icon size={14} className="text-[#9AA2AF]" />
                          {opt.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

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
            <Button variant="outline" size="sm" onClick={() => { resetForm(); onOpenChange(false); }}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-[#3366FF] hover:bg-[#2952CC] text-white"
              onClick={handleCreate}
              disabled={createField.isPending || !name.trim()}
            >
              {createField.isPending ? 'Adding...' : 'Add Field'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CreateLinkDialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen} />
    </>
  );
}
