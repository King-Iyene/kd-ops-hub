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
import { useCreateField, useFields } from '../hooks';
import { useDatabaseUI } from '../lib/store';
import type { UIType, SelectChoice, FieldOptions, FieldMeta } from '../types';
import { PILL_COLORS } from '../types';
import { ROLLUP_FUNCTIONS } from '../lib/computations';
import type { RollupFunction } from '../lib/computations';
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
  { value: 'Lookup', label: 'Lookup', group: 'Relations' },
  { value: 'Rollup', label: 'Rollup', group: 'Relations' },
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

  const [selectedLinkFieldId, setSelectedLinkFieldId] = useState('');
  const [selectedTargetFieldId, setSelectedTargetFieldId] = useState('');
  const [selectedRollupFn, setSelectedRollupFn] = useState<RollupFunction>('COUNT');

  const { activeTableId } = useDatabaseUI();
  const createField = useCreateField();

  // Fields for the current table (to find Link fields)
  const { data: currentTableFields } = useFields(activeTableId);
  const linkFields = (currentTableFields ?? []).filter((f: FieldMeta) => f.ui_type === 'Links');

  // Resolve the related table from the selected link field
  const selectedLinkField = linkFields.find((f: FieldMeta) => f.id === selectedLinkFieldId);
  const relatedTableId = selectedLinkField?.options?.relatedTableId ?? null;

  // Fields for the related table (to pick the target/lookup/rollup field)
  const { data: relatedTableFields } = useFields(relatedTableId);

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
    setSelectedLinkFieldId('');
    setSelectedTargetFieldId('');
    setSelectedRollupFn('COUNT');
  }, []);

  const handleTypeChange = (v: string) => {
    if (v === '_link') {
      onOpenChange(false);
      setLinkDialogOpen(true);
      return;
    }
    setUiType(v as UIType);
    setSelectedLinkFieldId('');
    setSelectedTargetFieldId('');
    setSelectedRollupFn('COUNT');
  };

  const handleLinkFieldChange = (v: string) => {
    setSelectedLinkFieldId(v);
    setSelectedTargetFieldId('');
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
    if (uiType === 'Lookup') {
      opts.linkFieldId = selectedLinkFieldId;
      opts.lookupFieldId = selectedTargetFieldId;
    }
    if (uiType === 'Rollup') {
      opts.linkFieldId = selectedLinkFieldId;
      opts.rollupFieldId = selectedTargetFieldId;
      opts.fn = selectedRollupFn;
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
    if (uiType === 'Lookup' || uiType === 'Rollup') {
      if (!selectedLinkFieldId) {
        setError('Please select a link field');
        return;
      }
      if (!selectedTargetFieldId) {
        setError('Please select a target field');
        return;
      }
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
  const showLookupRollupConfig = uiType === 'Lookup' || uiType === 'Rollup';
  const showRollupFnConfig = uiType === 'Rollup';

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
                <SelectContent className="max-h-[320px]">
                  {(() => {
                    const groups: string[] = [];
                    FIELD_TYPE_OPTIONS.forEach((o) => { if (!groups.includes(o.group)) groups.push(o.group); });
                    return groups.map((group) => (
                      <div key={group}>
                        <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#9AA2AF] select-none">
                          {group}
                        </div>
                        {FIELD_TYPE_OPTIONS.filter((o) => o.group === group).map((opt) => {
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
                      </div>
                    ));
                  })()}
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

            {showLookupRollupConfig && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-[#4A5268]">Link field</Label>
                  {linkFields.length === 0 ? (
                    <p className="text-xs text-[#6A7184]">
                      No link fields in this table. Create a &quot;Link to Another Table&quot; field first.
                    </p>
                  ) : (
                    <Select value={selectedLinkFieldId} onValueChange={handleLinkFieldChange}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select a link field..." />
                      </SelectTrigger>
                      <SelectContent>
                        {linkFields.map((f: FieldMeta) => (
                          <SelectItem key={f.id} value={f.id}>
                            <span className="flex items-center gap-2">
                              <Link2 size={14} className="text-[#9AA2AF]" />
                              {f.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {selectedLinkFieldId && relatedTableId && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-[#4A5268]">
                      {uiType === 'Lookup' ? 'Lookup field' : 'Rollup field'}
                    </Label>
                    {(relatedTableFields ?? []).length === 0 ? (
                      <p className="text-xs text-[#6A7184]">No fields found in the related table.</p>
                    ) : (
                      <Select value={selectedTargetFieldId} onValueChange={setSelectedTargetFieldId}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select a field..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-[200px]">
                          {(relatedTableFields ?? []).map((f: FieldMeta) => {
                            const Icon = getFieldTypeIcon(f.ui_type);
                            return (
                              <SelectItem key={f.id} value={f.id}>
                                <span className="flex items-center gap-2">
                                  <Icon size={14} className="text-[#9AA2AF]" />
                                  {f.name}
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}

                {showRollupFnConfig && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-[#4A5268]">Aggregate function</Label>
                    <Select value={selectedRollupFn} onValueChange={(v) => setSelectedRollupFn(v as RollupFunction)}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLLUP_FUNCTIONS.map((fn) => (
                          <SelectItem key={fn} value={fn}>{fn}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
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
