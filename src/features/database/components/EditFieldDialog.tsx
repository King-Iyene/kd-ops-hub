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
import { Plus, X } from 'lucide-react';
import { useUpdateField } from '../hooks';
import type { FieldMeta, SelectChoice } from '../types';
import { PILL_COLORS } from '../types';
import { getFieldTypeIcon } from './grid/field-icons';
import { cn } from '@/lib/utils';

interface EditFieldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field: FieldMeta | null;
}

function ColorDot({ color, selected, onClick }: { color: typeof PILL_COLORS[0]; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cn(
        'w-5 h-5 rounded-full border-2 transition-all',
        selected ? 'border-[#374151] scale-110' : 'border-transparent hover:scale-105',
      )}
      style={{ backgroundColor: color.bg }}
      onClick={onClick}
      title={color.name}
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
  const [isRequired, setIsRequired] = useState(false);
  const [choices, setChoices] = useState<SelectChoice[]>([]);
  const [newChoiceText, setNewChoiceText] = useState('');
  const [error, setError] = useState('');
  const updateField = useUpdateField();

  // Populate form when field changes
  useEffect(() => {
    if (field) {
      setName(field.name);
      setDescription(field.description ?? '');
      setIsRequired(field.is_required);
      const fieldChoices = (field.options as any)?.choices;
      setChoices(Array.isArray(fieldChoices) ? [...fieldChoices] : []);
      setNewChoiceText('');
      setError('');
    }
  }, [field]);

  const isSelectType = field?.ui_type === 'SingleSelect' || field?.ui_type === 'MultiSelect';

  const addChoice = useCallback(() => {
    const title = newChoiceText.trim();
    if (!title || choices.some((c) => c.title === title)) return;
    const colorIdx = choices.length % PILL_COLORS.length;
    setChoices([...choices, { title, color: PILL_COLORS[colorIdx].name }]);
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
      const updates: Record<string, any> = {};
      if (name.trim() !== field.name) updates.name = name.trim();
      const newDesc = description.trim() || null;
      if (newDesc !== (field.description ?? null)) updates.description = newDesc;
      if (isRequired !== field.is_required) updates.is_required = isRequired;
      if (isSelectType) {
        updates.options = { ...(field.options as any), choices };
      }
      if (Object.keys(updates).length === 0) {
        onOpenChange(false);
        return;
      }
      await updateField.mutateAsync({
        id: field.id,
        table_id: field.table_id,
        updates,
      });
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
          <DialogTitle className="text-[15px] font-semibold text-[#374151]">Edit Field</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="edit-field-name" className="text-xs text-[#6A7184]">Field Name</Label>
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
            <Label htmlFor="edit-field-desc" className="text-xs text-[#6A7184]">Description <span className="text-[#9AA2AF]">(optional)</span></Label>
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

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-3.5 h-3.5 accent-[#3366FF]"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
            />
            <span className="text-xs text-[#374151]">Required field</span>
          </label>

          <div className="space-y-1.5">
            <Label className="text-xs text-[#6A7184]">Field Type</Label>
            <div className="flex items-center gap-2 px-3 py-2 border border-[#E7E7E9] rounded-lg bg-[#F9F9FA]">
              <Icon size={14} className="text-[#9AA2AF]" />
              <span className="text-[13px] text-[#374151]">
                {FIELD_TYPE_LABELS[field.ui_type] ?? field.ui_type}
              </span>
              <span className="text-[11px] text-[#9AA2AF] ml-auto">Cannot be changed</span>
            </div>
          </div>

          {isSelectType && (
            <div className="space-y-2">
              <Label className="text-xs text-[#6A7184]">Options</Label>
              <div className="space-y-1.5">
                {choices.map((choice) => {
                  const pillColor = PILL_COLORS.find((c) => c.name === choice.color) || PILL_COLORS[7];
                  return (
                    <div key={choice.title} className="flex items-center gap-2 group">
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium flex-1 min-w-0 truncate"
                        style={{ backgroundColor: pillColor.bg, color: pillColor.text }}
                      >
                        {choice.title}
                      </span>
                      <div className="flex items-center gap-0.5">
                        {PILL_COLORS.map((pc) => (
                          <ColorDot
                            key={pc.name}
                            color={pc}
                            selected={choice.color === pc.name}
                            onClick={() => updateChoiceColor(choice.title, pc.name)}
                          />
                        ))}
                      </div>
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
                  placeholder="Add an option"
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
            disabled={updateField.isPending}
          >
            {updateField.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
