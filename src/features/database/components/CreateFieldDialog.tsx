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
import { Plus, X } from 'lucide-react';
import { useCreateField } from '../hooks';
import { useCreateLink } from '../hooks/useLinks';
import { useTables } from '../hooks/useTables';
import { useDatabaseUI } from '../lib/store';
import type { UIType, SelectChoice } from '../types';
import { PILL_COLORS } from '../types';
import { getFieldTypeIcon } from './grid/field-icons';
import { cn } from '@/lib/utils';
import { validateFormula, FORMULA_FUNCTIONS } from '../lib/formula';

interface CreateFieldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FieldTypeOption {
  value: UIType;
  label: string;
  group: string;
}

const FIELD_TYPE_OPTIONS: FieldTypeOption[] = [
  { value: 'SingleLineText', label: 'Single Line Text', group: 'Text' },
  { value: 'LongText', label: 'Long Text', group: 'Text' },
  { value: 'Email', label: 'Email', group: 'Text' },
  { value: 'PhoneNumber', label: 'Phone Number', group: 'Text' },
  { value: 'URL', label: 'URL', group: 'Text' },
  { value: 'Number', label: 'Number', group: 'Numeric' },
  { value: 'Decimal', label: 'Decimal', group: 'Numeric' },
  { value: 'Currency', label: 'Currency', group: 'Numeric' },
  { value: 'Percent', label: 'Percent', group: 'Numeric' },
  { value: 'Rating', label: 'Rating', group: 'Numeric' },
  { value: 'Duration', label: 'Duration', group: 'Numeric' },
  { value: 'Date', label: 'Date', group: 'Date & Time' },
  { value: 'DateTime', label: 'Date & Time', group: 'Date & Time' },
  { value: 'Year', label: 'Year', group: 'Date & Time' },
  { value: 'Time', label: 'Time', group: 'Date & Time' },
  { value: 'SingleSelect', label: 'Single Select', group: 'Selection' },
  { value: 'MultiSelect', label: 'Multi Select', group: 'Selection' },
  { value: 'Checkbox', label: 'Checkbox', group: 'Selection' },
  { value: 'Formula', label: 'Formula', group: 'Computed' },
  { value: 'Links', label: 'Links', group: 'Relations' },
  { value: 'Attachment', label: 'Attachment', group: 'Other' },
  { value: 'JSON', label: 'JSON', group: 'Other' },
];

const GROUPS = ['Text', 'Numeric', 'Date & Time', 'Selection', 'Relations', 'Computed', 'Other'];

type RelationType = 'one_to_one' | 'one_to_many' | 'many_to_many';

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

export function CreateFieldDialog({ open, onOpenChange }: CreateFieldDialogProps) {
  const [name, setName] = useState('');
  const [uiType, setUiType] = useState<UIType>('SingleLineText');
  const [description, setDescription] = useState('');
  const [isRequired, setIsRequired] = useState(false);
  const [choices, setChoices] = useState<SelectChoice[]>([]);
  const [newChoiceText, setNewChoiceText] = useState('');
  const [formulaExpression, setFormulaExpression] = useState('');
  const [formulaError, setFormulaError] = useState('');
  const [targetTableId, setTargetTableId] = useState('');
  const [relationType, setRelationType] = useState<RelationType>('many_to_many');
  const [error, setError] = useState('');
  const { activeTableId, activeBaseId } = useDatabaseUI();
  const createField = useCreateField();
  const createLink = useCreateLink();
  const { data: tables = [] } = useTables(activeBaseId);

  const isSelectType = uiType === 'SingleSelect' || uiType === 'MultiSelect';
  const isLinksType = uiType === 'Links';
  const isFormula = uiType === 'Formula';

  const handleFormulaChange = useCallback((expr: string) => {
    setFormulaExpression(expr);
    if (expr.trim()) {
      const result = validateFormula(expr);
      setFormulaError(result.valid ? '' : (result.error ?? 'Invalid formula'));
    } else {
      setFormulaError('');
    }
  }, []);

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

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Field name is required');
      return;
    }
    if (!activeTableId) {
      setError('No table selected');
      return;
    }
    setError('');
    try {
      if (isLinksType) {
        if (!targetTableId) {
          setError('Please select a target table');
          return;
        }
        if (!activeBaseId) {
          setError('No base selected');
          return;
        }
        await createLink.mutateAsync({
          base_id: activeBaseId,
          table_id: activeTableId,
          field_name: name.trim(),
          target_table_id: targetTableId,
          relation_type: relationType,
        });
        setName('');
        setUiType('SingleLineText');
        setDescription('');
        setIsRequired(false);
        setChoices([]);
        setNewChoiceText('');
        setTargetTableId('');
        setRelationType('many_to_many');
        setFormulaExpression('');
        setFormulaError('');
        onOpenChange(false);
        return;
      }
      const options: Record<string, any> = {};
      if (isSelectType && choices.length > 0) {
        options.choices = choices;
      }
      if (isFormula) {
        if (!formulaExpression.trim()) {
          setError('Formula expression is required');
          return;
        }
        const validation = validateFormula(formulaExpression);
        if (!validation.valid) {
          setError(validation.error ?? 'Invalid formula');
          return;
        }
        options.expression = formulaExpression;
      }
      await createField.mutateAsync({
        table_id: activeTableId,
        name: name.trim(),
        ui_type: uiType,
        options: Object.keys(options).length > 0 ? options : undefined,
        description: description.trim() || undefined,
        is_required: isRequired || undefined,
      });
      setName('');
      setUiType('SingleLineText');
      setDescription('');
      setIsRequired(false);
      setChoices([]);
      setNewChoiceText('');
      setFormulaExpression('');
      setFormulaError('');
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create field');
    }
  };

  const handleTypeChange = (type: UIType) => {
    setUiType(type);
    if (type !== 'SingleSelect' && type !== 'MultiSelect') {
      setChoices([]);
    }
    if (type !== 'Formula') {
      setFormulaExpression('');
      setFormulaError('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold text-[#374151]">Add Field</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="field-name" className="text-xs text-[#6A7184]">Field Name</Label>
            <Input
              id="field-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Status, Amount, Email"
              className="h-9"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && !isSelectType && handleCreate()}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="field-desc" className="text-xs text-[#6A7184]">Description <span className="text-[#9AA2AF]">(optional)</span></Label>
            <Input
              id="field-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this field..."
              className="h-8 text-xs"
            />
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
            <div className="border border-[#E7E7E9] rounded-lg max-h-[200px] overflow-y-auto">
              {GROUPS.map((group) => {
                const items = FIELD_TYPE_OPTIONS.filter((o) => o.group === group);
                if (items.length === 0) return null;
                return (
                  <div key={group}>
                    <div className="px-3 py-1 text-[10px] font-semibold text-[#9AA2AF] uppercase tracking-wider bg-[#F9F9FA] sticky top-0">
                      {group}
                    </div>
                    {items.map((opt) => {
                      const Icon = getFieldTypeIcon(opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          className={cn(
                            'w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-left transition-colors',
                            uiType === opt.value
                              ? 'bg-[#3366FF]/10 text-[#3366FF] font-medium'
                              : 'text-[#374151] hover:bg-[#F4F4F5]',
                          )}
                          onClick={() => handleTypeChange(opt.value)}
                        >
                          <Icon size={14} className={uiType === opt.value ? 'text-[#3366FF]' : 'text-[#9AA2AF]'} />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
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

          {isLinksType && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-[#6A7184]">Target Table</Label>
                <select
                  value={targetTableId}
                  onChange={(e) => setTargetTableId(e.target.value)}
                  className="w-full h-9 px-2 border border-[#E7E7E9] rounded-lg text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-[#3366FF]/30 focus:border-[#3366FF]"
                >
                  <option value="">Select a table...</option>
                  {tables
                    .filter((t) => t.id !== activeTableId)
                    .map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-[#6A7184]">Relation Type</Label>
                <div className="flex gap-1">
                  {([
                    { value: 'one_to_one' as const, label: 'One-to-One' },
                    { value: 'one_to_many' as const, label: 'One-to-Many' },
                    { value: 'many_to_many' as const, label: 'Many-to-Many' },
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={cn(
                        'flex-1 px-2 py-1.5 rounded-md text-xs font-medium border transition-colors',
                        relationType === opt.value
                          ? 'bg-[#3366FF]/10 text-[#3366FF] border-[#3366FF]/30'
                          : 'text-[#6A7184] border-[#E7E7E9] hover:bg-[#F4F4F5]',
                      )}
                      onClick={() => setRelationType(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {isFormula && (
            <div className="space-y-2">
              <Label className="text-xs text-[#6A7184]">Formula</Label>
              <textarea
                value={formulaExpression}
                onChange={(e) => handleFormulaChange(e.target.value)}
                placeholder='e.g. IF({Status} = "Done", 1, 0)'
                className="w-full h-24 px-3 py-2 border border-[#E7E7E9] rounded-lg text-[13px] font-mono resize-y focus:outline-none focus:ring-2 focus:ring-[#3366FF]/30 focus:border-[#3366FF]"
                spellCheck={false}
              />
              {formulaError && (
                <p className="text-xs text-red-500">{formulaError}</p>
              )}
              {!formulaError && formulaExpression.trim() && (
                <p className="text-xs text-green-600">Formula is valid</p>
              )}
              <div className="text-[10px] text-[#9AA2AF] leading-relaxed">
                <span className="font-medium">Reference fields:</span> {'{FieldName}'} &middot;{' '}
                <span className="font-medium">Functions:</span>{' '}
                {FORMULA_FUNCTIONS.slice(0, 12).join(', ')}...
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
            onClick={handleCreate}
            disabled={createField.isPending || createLink.isPending}
          >
            {createField.isPending ? 'Adding...' : 'Add Field'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
