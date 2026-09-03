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
import { Plus, X, AlertTriangle, GripVertical } from 'lucide-react';
import { useUpdateField, useChangeFieldType } from '../hooks';
import type { FieldMeta, SelectChoice, UIType } from '../types';
import { PILL_COLORS, SELECT_COLORS, SELECT_COLOR_NAMES, VIRTUAL_TYPES, getConvertibleTypes } from '../types';
import { getFieldTypeIcon } from './grid/field-icons';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';


interface EditFieldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field: FieldMeta | null;
}

function ColorDot({ colorName, bg, selected, onClick }: { colorName: string; bg: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cn(
        'w-4 h-4 rounded-full border-2 transition-all',
        selected ? 'border-[#374151] dark:border-white scale-110' : 'border-transparent hover:scale-105',
      )}
      style={{ backgroundColor: bg }}
      onClick={onClick}
      title={colorName}
    />
  );
}

const FIELD_TYPE_LABELS: Record<string, string> = {
  SingleLineText: 'Single Line Text',
  LongText: 'Long Text',
  Email: 'Email',
  PhoneNumber: 'Phone Number',
  URL: 'URL',
  Number: 'Number',
  Decimal: 'Decimal',
  Currency: 'Currency',
  Percent: 'Percent',
  Rating: 'Rating',
  Duration: 'Duration',
  Date: 'Date',
  DateTime: 'Date & Time',
  Year: 'Year',
  Time: 'Time',
  SingleSelect: 'Single Select',
  MultiSelect: 'Multi Select',
  Checkbox: 'Checkbox',
  Attachment: 'Attachment',
  JSON: 'JSON',
};

export function EditFieldDialog({ open, onOpenChange, field }: EditFieldDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [choices, setChoices] = useState<SelectChoice[]>([]);
  const [newChoiceText, setNewChoiceText] = useState('');
  const [error, setError] = useState('');
  const [selectedNewType, setSelectedNewType] = useState<UIType | null>(null);
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [typeChangeConfirmed, setTypeChangeConfirmed] = useState(false);
  const updateField = useUpdateField();
  const changeFieldType = useChangeFieldType();

  // Populate form when field changes
  useEffect(() => {
    if (field) {
      setName(field.name);
      setDescription(field.description ?? '');
      const fieldChoices = (field.options as any)?.choices;
      setChoices(Array.isArray(fieldChoices) ? [...fieldChoices] : []);
      setNewChoiceText('');
      setError('');
      setSelectedNewType(null);
      setShowTypeSelector(false);
      setTypeChangeConfirmed(false);
    }
  }, [field]);

  const isSelectType = field?.ui_type === 'SingleSelect' || field?.ui_type === 'MultiSelect';

  const addChoice = useCallback(() => {
    const title = newChoiceText.trim();
    if (!title || choices.some((c) => c.title === title)) return;
    const colorIdx = choices.length % SELECT_COLOR_NAMES.length;
    setChoices([...choices, { title, color: SELECT_COLOR_NAMES[colorIdx] }]);
    setNewChoiceText('');
  }, [newChoiceText, choices]);

  const removeChoice = useCallback((title: string) => {
    setChoices(choices.filter((c) => c.title !== title));
  }, [choices]);

  const updateChoiceColor = useCallback((title: string, color: string) => {
    setChoices(choices.map((c) => c.title === title ? { ...c, color } : c));
  }, [choices]);

  const handleSave = async () => {
    if (!field) return;
    if (!name.trim()) {
      setError('Field name is required');
      return;
    }
    setError('');
    try {
      // Handle type change first if selected
      if (selectedNewType && selectedNewType !== field.ui_type) {
        await changeFieldType.mutateAsync({
          id: field.id,
          table_id: field.table_id,
          newUiType: selectedNewType,
        });
      }

      const updates: Record<string, any> = {};
      if (name.trim() !== field.name) updates.name = name.trim();
      const newDesc = description.trim() || null;
      if (newDesc !== (field.description ?? null)) updates.description = newDesc;
      if (isSelectType) {
        updates.options = { ...(field.options as any), choices };
      }
      if (Object.keys(updates).length > 0) {
        await updateField.mutateAsync({
          id: field.id,
          table_id: field.table_id,
          updates,
        });
      }
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to update field');
    }
  };

  if (!field) return null;

  const Icon = getFieldTypeIcon(field.ui_type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">Edit Field</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="edit-field-name" className="text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Field Name</Label>
            <Input
              id="edit-field-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Field name"
              className="h-9"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && !isSelectType && handleSave()}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-field-desc" className="text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Description <span className="text-[#9AA2AF]">(optional)</span></Label>
            <textarea
              id="edit-field-desc"
              value={description}
              onChange={(e) => {
                if (e.target.value.length <= 500) setDescription(e.target.value);
              }}
              placeholder="Add a description for this field..."
              className="w-full rounded-md border border-[#E7E7E9] bg-white dark:bg-[hsl(200,30%,10%)] px-3 py-2 text-xs text-[#374151] dark:text-[hsl(200,25%,88%)] placeholder:text-[#9AA2AF] focus:outline-none focus:ring-2 focus:ring-[#3366FF] focus:border-transparent resize-none"
              rows={3}
              maxLength={500}
            />
            <div className="text-[11px] text-[#9AA2AF] text-right">{description.length}/500</div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Field Type</Label>
            {(() => {
              const isVirtual = VIRTUAL_TYPES.includes(field.ui_type);
              const convertibleTypes = isVirtual ? [] : getConvertibleTypes(field.ui_type);
              const canConvert = convertibleTypes.length > 0 && !field.is_primary;
              const activeType = selectedNewType ?? field.ui_type;
              const ActiveIcon = getFieldTypeIcon(activeType);
              const selectedRule = selectedNewType
                ? convertibleTypes.find((c) => c.type === selectedNewType)?.rule
                : null;

              return (
                <>
                  <button
                    type="button"
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 border rounded-lg w-full text-left transition-colors',
                      canConvert
                        ? 'border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] bg-white dark:bg-[hsl(200,30%,10%)] hover:border-[#3366FF] cursor-pointer'
                        : 'border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] bg-[#F9F9FA] dark:bg-[hsl(200,25%,13%)] cursor-default',
                    )}
                    onClick={() => canConvert && setShowTypeSelector(!showTypeSelector)}
                    disabled={!canConvert}
                  >
                    <ActiveIcon size={14} className="text-[#9AA2AF]" />
                    <span className="text-[13px] text-[#374151] dark:text-[hsl(200,25%,88%)]">
                      {FIELD_TYPE_LABELS[activeType] ?? activeType}
                    </span>
                    {selectedNewType && selectedNewType !== field.ui_type && (
                      <span className="text-[11px] text-[#3366FF] ml-1">(changing)</span>
                    )}
                    {!canConvert && (
                      <span className="text-[11px] text-[#9AA2AF] ml-auto">
                        {isVirtual ? 'Virtual type' : field.is_primary ? 'Primary field' : 'No conversions available'}
                      </span>
                    )}
                    {canConvert && (
                      <span className="text-[11px] text-[#9AA2AF] ml-auto">Click to change</span>
                    )}
                  </button>

                  {showTypeSelector && canConvert && (
                    <div className="border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] rounded-lg bg-white dark:bg-[hsl(200,30%,10%)] p-2 space-y-0.5 max-h-48 overflow-y-auto">
                      {/* Option to revert to original */}
                      {selectedNewType && (
                        <button
                          type="button"
                          className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-left hover:bg-[#F3F4F6] dark:hover:bg-[hsl(200,25%,15%)] transition-colors"
                          onClick={() => {
                            setSelectedNewType(null);
                            setTypeChangeConfirmed(false);
                            setShowTypeSelector(false);
                          }}
                        >
                          <Icon size={13} className="text-[#9AA2AF]" />
                          <span className="text-xs text-[#374151] dark:text-[hsl(200,25%,88%)]">
                            {FIELD_TYPE_LABELS[field.ui_type] ?? field.ui_type}
                          </span>
                          <span className="text-[10px] text-[#9AA2AF] ml-auto">current</span>
                        </button>
                      )}
                      {convertibleTypes.map(({ type, rule }) => {
                        const TypeIcon = getFieldTypeIcon(type);
                        const isSelected = type === selectedNewType;
                        return (
                          <button
                            key={type}
                            type="button"
                            className={cn(
                              'flex items-center gap-2 w-full px-2 py-1.5 rounded text-left transition-colors',
                              isSelected
                                ? 'bg-[#EBF0FF] dark:bg-[hsl(220,40%,18%)]'
                                : 'hover:bg-[#F3F4F6] dark:hover:bg-[hsl(200,25%,15%)]',
                            )}
                            onClick={() => {
                              setSelectedNewType(type);
                              setTypeChangeConfirmed(rule.safety === 'safe');
                              setShowTypeSelector(false);
                            }}
                          >
                            <TypeIcon size={13} className="text-[#9AA2AF]" />
                            <span className="text-xs text-[#374151] dark:text-[hsl(200,25%,88%)]">
                              {FIELD_TYPE_LABELS[type] ?? type}
                            </span>
                            <span className={cn(
                              'text-[10px] ml-auto',
                              rule.safety === 'safe' ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400',
                            )}>
                              {rule.safety === 'safe' ? 'safe' : 'lossy'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {selectedRule && selectedRule.warning && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                      <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                      <div className="space-y-1.5">
                        <p className="text-xs text-amber-800 dark:text-amber-300">{selectedRule.warning}</p>
                        {selectedRule.safety === 'lossy' && (
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              className="w-3.5 h-3.5 accent-[#3366FF]"
                              checked={typeChangeConfirmed}
                              onChange={(e) => setTypeChangeConfirmed(e.target.checked)}
                            />
                            <span className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                              I understand some data may be lost
                            </span>
                          </label>
                        )}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {isSelectType && (
            <div className="space-y-2">
              <Label className="text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Options</Label>
              <div className="space-y-1.5">
                {choices.map((choice) => {
                  const sc = SELECT_COLORS[choice.color] || SELECT_COLORS.grayLight2;
                  return (
                    <div key={choice.title} className="flex items-center gap-2 group">
                      <GripVertical size={14} className="text-[#9AA2AF] cursor-grab shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium flex-1 min-w-0 truncate select-pill"
                        style={{
                          '--pill-bg': sc.bg, '--pill-text': sc.text,
                          '--pill-dark-bg': sc.darkBg, '--pill-dark-text': sc.darkText,
                          backgroundColor: sc.bg, color: sc.text,
                        } as React.CSSProperties}
                      >
                        {choice.title}
                      </span>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="w-5 h-5 rounded-full border-2 border-gray-200 dark:border-gray-600 hover:scale-110 transition-transform shrink-0"
                            style={{ backgroundColor: sc.bg }}
                            title="Change color"
                          />
                        </PopoverTrigger>
                        <PopoverContent
                          side="right"
                          align="start"
                          className="!w-auto !p-2"
                          style={{ zIndex: 100 }}
                        >
                          <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}>
                            {SELECT_COLOR_NAMES.map((cName) => (
                              <ColorDot
                                key={cName}
                                colorName={cName}
                                bg={SELECT_COLORS[cName].bg}
                                selected={choice.color === cName}
                                onClick={() => updateChoiceColor(choice.title, cName)}
                              />
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                      <button
                        type="button"
                        className="p-0.5 rounded hover:bg-red-50 text-[#9AA2AF] hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        onClick={() => removeChoice(choice.title)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newChoiceText}
                  onChange={(e) => setNewChoiceText(e.target.value)}
                  placeholder="Add an option..."
                  className="h-8 text-xs flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addChoice();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-[#3366FF] hover:text-[#2952CC] gap-1"
                  onClick={addChoice}
                  disabled={!newChoiceText.trim()}
                >
                  <Plus size={13} /> Add
                </Button>
              </div>
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
            style={{ backgroundColor: '#3366FF' }}
            className="hover:opacity-90 text-white"
            onClick={handleSave}
            disabled={updateField.isPending || changeFieldType.isPending || (!!selectedNewType && selectedNewType !== field?.ui_type && !typeChangeConfirmed)}
          >
            {updateField.isPending || changeFieldType.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
