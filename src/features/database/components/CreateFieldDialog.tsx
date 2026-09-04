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
import { Plus, X, Search, GripVertical, Info } from 'lucide-react';
import { useCreateField } from '../hooks';
import { useCreateLink } from '../hooks/useLinks';
import { useTables } from '../hooks/useTables';
import { useFields } from '../hooks/useFields';
import { useDatabaseUI } from '../lib/store';
import type { UIType, SelectChoice, FieldMeta, FieldOptions } from '../types';
import { SELECT_COLORS, SELECT_COLOR_NAMES } from '../types';
import { getFieldTypeIcon } from './grid/field-icons';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { validateFormula } from '../lib/formula';
import { FormulaEditor } from './FormulaEditor';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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
  { value: 'Lookup', label: 'Lookup', group: 'Computed' },
  { value: 'Rollup', label: 'Rollup', group: 'Computed' },
  { value: 'Links', label: 'Links', group: 'Relations' },
  { value: 'Attachment', label: 'Attachment', group: 'Other' },
  { value: 'JSON', label: 'JSON', group: 'Other' },
  { value: 'AutoNumber', label: 'Auto Number', group: 'System' },
  { value: 'CreatedTime', label: 'Created Time', group: 'System' },
  { value: 'LastModifiedTime', label: 'Last Modified Time', group: 'System' },
  { value: 'CreatedBy', label: 'Created By', group: 'System' },
  { value: 'LastModifiedBy', label: 'Last Modified By', group: 'System' },
];

const GROUPS = ['Text', 'Numeric', 'Date & Time', 'Selection', 'Relations', 'Computed', 'Other', 'System'];

type RelationType = 'one_to_one' | 'one_to_many' | 'many_to_many';

interface SortableOptionProps {
  choice: SelectChoice;
  onRemove: (title: string) => void;
  onColorChange: (title: string, color: string) => void;
  isEditing: boolean;
  editValue: string;
  onEditChange: (value: string) => void;
  onEditStart: (title: string) => void;
  onEditCommit: (oldTitle: string, newTitle: string) => void;
  onEditCancel: () => void;
}

function SortableOption({ choice, onRemove, onColorChange, isEditing, editValue, onEditChange, onEditStart, onEditCommit, onEditCancel }: SortableOptionProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: choice.title });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const sc = SELECT_COLORS[choice.color] || SELECT_COLORS.grayLight2;
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 group">
      <button
        type="button"
        className="text-[#9AA2AF] cursor-grab shrink-0 opacity-0 group-hover:opacity-100 transition-opacity touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>
      {isEditing ? (
        <input
          autoFocus
          className="flex-1 min-w-0 px-2.5 py-0.5 rounded-full text-[12px] font-medium border border-[#3366FF] outline-none bg-white dark:bg-[hsl(200,30%,10%)] text-[#374151] dark:text-[hsl(200,25%,88%)]"
          value={editValue}
          onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onEditCommit(choice.title, editValue);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onEditCancel();
            }
          }}
          onBlur={() => onEditCommit(choice.title, editValue)}
        />
      ) : (
        <span
          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium flex-1 min-w-0 truncate select-pill cursor-default"
          style={{
            '--pill-bg': sc.bg, '--pill-text': sc.text,
            '--pill-dark-bg': sc.darkBg, '--pill-dark-text': sc.darkText,
            backgroundColor: sc.bg, color: sc.text,
          } as React.CSSProperties}
          onDoubleClick={() => onEditStart(choice.title)}
          title="Double-click to rename"
        >
          {choice.title}
        </span>
      )}
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
                onClick={() => onColorChange(choice.title, cName)}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <button
        type="button"
        className="p-0.5 rounded hover:bg-red-50 text-[#9AA2AF] hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
        onClick={() => onRemove(choice.title)}
      >
        <X size={14} />
      </button>
    </div>
  );
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

export function CreateFieldDialog({ open, onOpenChange }: CreateFieldDialogProps) {
  const [name, setName] = useState('');
  const [uiType, setUiType] = useState<UIType>('SingleLineText');
  const [description, setDescription] = useState('');

  const [choices, setChoices] = useState<SelectChoice[]>([]);
  const [newChoiceText, setNewChoiceText] = useState('');
  const [editingChoiceTitle, setEditingChoiceTitle] = useState<string | null>(null);
  const [editingChoiceValue, setEditingChoiceValue] = useState('');
  const [formulaExpression, setFormulaExpression] = useState('');
  const [formulaError, setFormulaError] = useState('');
  const [targetTableId, setTargetTableId] = useState('');
  const [relationType, setRelationType] = useState<RelationType>('many_to_many');
  const [linkFieldId, setLinkFieldId] = useState('');
  const [lookupFieldId, setLookupFieldId] = useState('');
  const [rollupFieldId, setRollupFieldId] = useState('');
  const [rollupFn, setRollupFn] = useState('COUNT');
  const [selectedLinkFieldId, setSelectedLinkFieldId] = useState('');
  const [selectedTargetFieldId, setSelectedTargetFieldId] = useState('');
  const [selectedRollupFn, setSelectedRollupFn] = useState('COUNT');
  const [ratingMax, setRatingMax] = useState(5);
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [precision, setPrecision] = useState(2);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [typeSearch, setTypeSearch] = useState('');
  const [error, setError] = useState('');
  const { activeTableId, activeBaseId } = useDatabaseUI();
  const createField = useCreateField();
  const createLink = useCreateLink();
  const { data: tables = [] } = useTables(activeBaseId);

  const { data: currentTableFields = [] } = useFields(activeTableId);
  const linkFields = currentTableFields.filter((f: FieldMeta) => f.ui_type === 'Links');
  const selectedLinkField = linkFields.find((f: FieldMeta) => f.id === linkFieldId);
  const targetTableIdFromLink = selectedLinkField?.options?.relatedTableId ?? null;
  const { data: targetFields = [] } = useFields(targetTableIdFromLink);
  const numericTargetFields = targetFields.filter((f: FieldMeta) =>
    ['Number', 'Decimal', 'Currency', 'Percent', 'Duration', 'Rating'].includes(f.ui_type),
  );

  const isSelectType = uiType === 'SingleSelect' || uiType === 'MultiSelect';
  const isLinksType = uiType === 'Links';

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setChoices((prev) => {
        const oldIndex = prev.findIndex((c) => c.title === active.id);
        const newIndex = prev.findIndex((c) => c.title === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }, []);
  const isFormula = uiType === 'Formula';
  const isLookup = uiType === 'Lookup';
  const isRollup = uiType === 'Rollup';

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

  const commitChoiceRename = useCallback((oldTitle: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed || trimmed === oldTitle) {
      setEditingChoiceTitle(null);
      return;
    }
    if (choices.some((c) => c.title !== oldTitle && c.title === trimmed)) {
      setEditingChoiceTitle(null);
      return;
    }
    setChoices(choices.map((c) => c.title === oldTitle ? { ...c, title: trimmed } : c));
    setEditingChoiceTitle(null);
  }, [choices]);

  const relatedTableId = selectedLinkField?.options?.relatedTableId ?? null;
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
    setTypeSearch('');
  }, []);

  const handleTypeChange = (type: UIType) => {
    setUiType(type);
    if (type !== 'SingleSelect' && type !== 'MultiSelect') {
      setChoices([]);
    }
    if (type !== 'Formula') {
      setFormulaExpression('');
      setFormulaError('');
    }
    if (type !== 'Lookup' && type !== 'Rollup') {
      setLinkFieldId('');
      setLookupFieldId('');
      setRollupFieldId('');
      setRollupFn('COUNT');
    }
  };

  const handleLinkFieldChange = (v: string) => {
    setSelectedLinkFieldId(v);
    setSelectedTargetFieldId('');
  };

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
      if (isLookup) {
        if (!linkFieldId) { setError('Please select a link field'); return; }
        if (!lookupFieldId) { setError('Please select a lookup field'); return; }
        options.linkFieldId = linkFieldId;
        options.lookupFieldId = lookupFieldId;
      }
      if (isRollup) {
        if (!linkFieldId) { setError('Please select a link field'); return; }
        if (!rollupFieldId) { setError('Please select a rollup field'); return; }
        options.linkFieldId = linkFieldId;
        options.rollupFieldId = rollupFieldId;
        options.fn = rollupFn;
      }
      await createField.mutateAsync({
        table_id: activeTableId,
        name: name.trim(),
        ui_type: uiType,
        options: Object.keys(options).length > 0 ? options : undefined,
        description: description.trim() || undefined,
      });
      setName('');
      setUiType('SingleLineText');
      setDescription('');

      setChoices([]);
      setNewChoiceText('');
      setFormulaExpression('');
      setFormulaError('');
      setLinkFieldId('');
      setLookupFieldId('');
      setRollupFieldId('');
      setRollupFn('COUNT');
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create field');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">Add Field</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="field-name" className="text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Field Name</Label>
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
            <Label htmlFor="field-desc" className="text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Description <span className="text-[#9AA2AF]">(optional)</span></Label>
            <textarea
              id="field-desc"
              value={description}
              onChange={(e) => {
                if (e.target.value.length <= 500) setDescription(e.target.value);
              }}
              placeholder="Describe this field..."
              className="w-full rounded-md border border-[#E7E7E9] bg-white dark:bg-[hsl(200,30%,10%)] px-3 py-2 text-xs text-[#374151] dark:text-[hsl(200,25%,88%)] placeholder:text-[#9AA2AF] focus:outline-none focus:ring-2 focus:ring-[#3366FF] focus:border-transparent resize-none"
              rows={2}
              maxLength={500}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Field Type</Label>
            <div className="border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] bg-[#F9F9FA] dark:bg-[hsl(200,25%,13%)]">
                <Search size={13} className="text-[#9AA2AF] shrink-0" />
                <input
                  type="text"
                  value={typeSearch}
                  onChange={(e) => setTypeSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      if (typeSearch) {
                        e.stopPropagation();
                        setTypeSearch('');
                      }
                    }
                  }}
                  placeholder="Search field types..."
                  className="w-full bg-transparent text-[12px] text-[#374151] dark:text-[hsl(200,25%,88%)] placeholder:text-[#9AA2AF] outline-none"
                />
                {typeSearch && (
                  <button type="button" onClick={() => setTypeSearch('')} className="text-[#9AA2AF] hover:text-[#374151]">
                    <X size={12} />
                  </button>
                )}
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                {GROUPS.map((group) => {
                  const items = FIELD_TYPE_OPTIONS.filter((o) =>
                    o.group === group && (!typeSearch || o.label.toLowerCase().includes(typeSearch.toLowerCase())),
                  );
                  if (items.length === 0) return null;
                  return (
                    <div key={group}>
                      <div className="px-3 py-1 text-[10px] font-semibold text-[#9AA2AF] uppercase tracking-wider bg-[#F9F9FA] dark:bg-[hsl(200,25%,13%)] sticky top-0">
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
                                : 'text-[#374151] dark:text-[hsl(200,25%,88%)] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,14%)]',
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
                {FIELD_TYPE_OPTIONS.filter((o) => o.label.toLowerCase().includes(typeSearch.toLowerCase())).length === 0 && typeSearch && (
                  <div className="px-3 py-3 text-xs text-[#9AA2AF] text-center">No matching field types</div>
                )}
              </div>
            </div>
          </div>

          {isSelectType && (
            <div className="space-y-2">
              <Label className="text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Options</Label>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={choices.map((c) => c.title)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1.5">
                    {choices.map((choice) => (
                      <SortableOption
                        key={choice.title}
                        choice={choice}
                        onRemove={removeChoice}
                        onColorChange={updateChoiceColor}
                        isEditing={editingChoiceTitle === choice.title}
                        editValue={editingChoiceValue}
                        onEditChange={setEditingChoiceValue}
                        onEditStart={(title) => {
                          setEditingChoiceTitle(title);
                          setEditingChoiceValue(title);
                        }}
                        onEditCommit={commitChoiceRename}
                        onEditCancel={() => setEditingChoiceTitle(null)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
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

          {isLinksType && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Target Table</Label>
                <select
                  value={targetTableId}
                  onChange={(e) => setTargetTableId(e.target.value)}
                  className="w-full h-9 px-2 border border-[#E7E7E9] rounded-lg text-[13px] bg-white dark:bg-[hsl(200,30%,10%)] dark:border-[hsl(200,25%,18%)] dark:text-[hsl(200,25%,88%)] focus:outline-none focus:ring-2 focus:ring-[#3366FF]/30 focus:border-[#3366FF]"
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
                <Label className="text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Relation Type</Label>
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
                          : 'text-[#6A7184] dark:text-[hsl(200,20%,55%)] border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,14%)]',
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
              <Label className="text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Formula</Label>
              <FormulaEditor
                value={formulaExpression}
                onChange={handleFormulaChange}
                fields={currentTableFields}
                error={formulaError}
              />
            </div>
          )}

          {(isLookup || isRollup) && (
            <div className="space-y-3">
              {linkFields.length === 0 ? (
                <div className="bg-blue-50 dark:bg-blue-950/30 border-l-4 border-[#3366FF] rounded-r-md p-3 flex items-start gap-2.5">
                  <Info size={16} className="text-[#3366FF] shrink-0 mt-0.5" />
                  <div className="space-y-2 min-w-0">
                    <p className="text-xs text-[#374151] dark:text-[hsl(200,25%,88%)] leading-relaxed">
                      This table has no Link fields yet. Create a Link to Another Record field first, then set up your {isLookup ? 'Lookup' : 'Rollup'}.
                    </p>
                    <button
                      type="button"
                      className="text-xs font-medium text-[#3366FF] hover:text-[#2952CC] transition-colors"
                      onClick={() => handleTypeChange('Links')}
                    >
                      Switch to Link field
                    </button>
                  </div>
                </div>
              ) : (
              <div className="space-y-1.5">
                <Label className="text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Link Field</Label>
                <select
                  value={linkFieldId}
                  onChange={(e) => { setLinkFieldId(e.target.value); setLookupFieldId(''); setRollupFieldId(''); }}
                  className="w-full h-9 px-2 border border-[#E7E7E9] rounded-lg text-[13px] bg-white dark:bg-[hsl(200,30%,10%)] dark:border-[hsl(200,25%,18%)] dark:text-[hsl(200,25%,88%)] focus:outline-none focus:ring-2 focus:ring-[#3366FF]/30 focus:border-[#3366FF]"
                >
                  <option value="">Select a link field...</option>
                  {linkFields.map((f: FieldMeta) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
              )}
              {isLookup && linkFieldId && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Lookup Field</Label>
                  <select
                    value={lookupFieldId}
                    onChange={(e) => setLookupFieldId(e.target.value)}
                    className="w-full h-9 px-2 border border-[#E7E7E9] rounded-lg text-[13px] bg-white dark:bg-[hsl(200,30%,10%)] dark:border-[hsl(200,25%,18%)] dark:text-[hsl(200,25%,88%)] focus:outline-none focus:ring-2 focus:ring-[#3366FF]/30 focus:border-[#3366FF]"
                  >
                    <option value="">Select a field...</option>
                    {targetFields.map((f: FieldMeta) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {isRollup && linkFieldId && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Rollup Field</Label>
                    <select
                      value={rollupFieldId}
                      onChange={(e) => setRollupFieldId(e.target.value)}
                      className="w-full h-9 px-2 border border-[#E7E7E9] rounded-lg text-[13px] bg-white dark:bg-[hsl(200,30%,10%)] dark:border-[hsl(200,25%,18%)] dark:text-[hsl(200,25%,88%)] focus:outline-none focus:ring-2 focus:ring-[#3366FF]/30 focus:border-[#3366FF]"
                    >
                      <option value="">Select a numeric field...</option>
                      {numericTargetFields.map((f: FieldMeta) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Function</Label>
                    <select
                      value={rollupFn}
                      onChange={(e) => setRollupFn(e.target.value)}
                      className="w-full h-9 px-2 border border-[#E7E7E9] rounded-lg text-[13px] bg-white dark:bg-[hsl(200,30%,10%)] dark:border-[hsl(200,25%,18%)] dark:text-[hsl(200,25%,88%)] focus:outline-none focus:ring-2 focus:ring-[#3366FF]/30 focus:border-[#3366FF]"
                    >
                      {['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COUNTA', 'COUNTALL'].map((fn) => (
                        <option key={fn} value={fn}>{fn}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
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
            disabled={
              createField.isPending || createLink.isPending ||
              (isFormula && (!!formulaError || !formulaExpression.trim())) ||
              (isLookup && (!linkFieldId || !lookupFieldId)) ||
              (isRollup && (!linkFieldId || !rollupFieldId))
            }
            title={
              isFormula && formulaError ? 'Fix formula errors before saving' :
              isFormula && !formulaExpression.trim() ? 'Enter a formula expression' :
              (isLookup && (!linkFieldId || !lookupFieldId)) ? 'Select link and target fields' :
              (isRollup && (!linkFieldId || !rollupFieldId)) ? 'Select link and target fields' :
              undefined
            }
          >
            {createField.isPending ? 'Adding...' : 'Add Field'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
