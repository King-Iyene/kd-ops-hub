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
import { Plus, X, AlertTriangle, GripVertical, Info, Trash2 } from 'lucide-react';
import { useUpdateField, useChangeFieldType, useDeleteField } from '../hooks';
import { useFields } from '../hooks/useFields';
import type { FieldMeta, SelectChoice, UIType } from '../types';
import { SELECT_COLORS, SELECT_COLOR_NAMES, VIRTUAL_TYPES, getConvertibleTypes } from '../types';
import { getFieldTypeIcon } from './grid/field-icons';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { validateFormula } from '../lib/formula';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FormulaEditor } from './FormulaEditor';
import { ROLLUP_FUNCTIONS, type RollupFunction } from '../lib/computations';


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
          className="flex-1 min-w-0 px-2.5 py-0.5 rounded-full text-[12px] font-medium border border-[#166EE1] outline-none bg-white dark:bg-[hsl(200,30%,10%)] text-[#374151] dark:text-[hsl(200,25%,88%)]"
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
  const [editingChoiceTitle, setEditingChoiceTitle] = useState<string | null>(null);
  const [editingChoiceValue, setEditingChoiceValue] = useState('');
  const [error, setError] = useState('');
  const [selectedNewType, setSelectedNewType] = useState<UIType | null>(null);
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [typeChangeConfirmed, setTypeChangeConfirmed] = useState(false);
  const [formulaExpression, setFormulaExpression] = useState('');
  const [formulaError, setFormulaError] = useState('');
  const [linkFieldId, setLinkFieldId] = useState('');
  const [lookupFieldId, setLookupFieldId] = useState('');
  const [rollupFieldId, setRollupFieldId] = useState('');
  const [rollupFunction, setRollupFunction] = useState<RollupFunction>('COUNT');
  const [richText, setRichText] = useState(false);
  const [durationFormat, setDurationFormat] = useState('h:mm');
  const updateField = useUpdateField();
  const changeFieldType = useChangeFieldType();
  const deleteField = useDeleteField();

  // Fetch fields for lookup configuration
  const { data: currentTableFields = [] } = useFields(field?.table_id ?? null);
  const linkFields = currentTableFields.filter((f: FieldMeta) => f.ui_type === 'Links');
  const selectedLinkField = linkFields.find((f: FieldMeta) => f.id === linkFieldId);
  const targetTableIdFromLink = selectedLinkField?.options?.relatedTableId ?? null;
  const { data: targetFields = [] } = useFields(targetTableIdFromLink);

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
      // Populate formula/lookup state from field options
      setFormulaExpression((field.options as any)?.expression ?? '');
      setFormulaError('');
      setLinkFieldId((field.options as any)?.linkFieldId ?? '');
      setLookupFieldId((field.options as any)?.lookupFieldId ?? '');
      setRollupFieldId((field.options as any)?.rollupFieldId ?? '');
      setRollupFunction((field.options as any)?.fn ?? 'COUNT');
      setRichText((field.options as any)?.richText ?? false);
      setDurationFormat((field.options as any)?.format ?? 'h:mm');
    }
  }, [field]);

  const isSelectType = field?.ui_type === 'SingleSelect' || field?.ui_type === 'MultiSelect';
  const isLongText = field?.ui_type === 'LongText';
  const isFormula = field?.ui_type === 'Formula';
  const isLookup = field?.ui_type === 'Lookup';
  const isRollup = field?.ui_type === 'Rollup';

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

  const handleSave = async () => {
    if (!field) return;
    if (!name.trim()) {
      setError('Field name is required');
      return;
    }
    if (isFormula && !formulaExpression.trim()) {
      setError('Formula expression is required');
      return;
    }
    if (isFormula && formulaExpression.trim()) {
      const validation = validateFormula(formulaExpression);
      if (!validation.valid) {
        setError(validation.error ?? 'Invalid formula');
        return;
      }
    }
    if (isLookup && linkFields.length > 0) {
      if (!linkFieldId) { setError('Please select a link field'); return; }
      if (!lookupFieldId) { setError('Please select a lookup field'); return; }
    }
    setError('');
    const previousType = field.ui_type;
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
      if (isFormula) {
        updates.options = { ...(field.options as any), expression: formulaExpression };
      }
      if (isLookup) {
        updates.options = { ...(field.options as any), linkFieldId, lookupFieldId };
      }
      if (isLongText) {
        updates.options = { ...(field.options as any), richText };
      }
      if (isRollup) {
        updates.options = { ...(field.options as any), linkFieldId, rollupFieldId, fn: rollupFunction };
      }
      if (field.ui_type === 'Duration') {
        updates.options = { ...(field.options as any), format: durationFormat };
      }
      if (Object.keys(updates).length > 0) {
        try {
          await updateField.mutateAsync({
            id: field.id,
            table_id: field.table_id,
            updates,
          });
        } catch (updateErr: any) {
          // If we already changed the type, attempt to revert it
          if (selectedNewType && selectedNewType !== previousType) {
            try {
              await changeFieldType.mutateAsync({
                id: field.id,
                table_id: field.table_id,
                newUiType: previousType,
              });
            } catch {
              // Revert failed — surface the original error with context
              setError(`Field update failed and type revert also failed. The field type was changed to ${selectedNewType} but other updates were not applied: ${updateErr?.message ?? 'Unknown error'}`);
              return;
            }
          }
          throw updateErr;
        }
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
              className="w-full rounded-md border border-[#E5E5E5] bg-white dark:bg-[hsl(200,30%,10%)] px-3 py-2 text-xs text-[#374151] dark:text-[hsl(200,25%,88%)] placeholder:text-[#9AA2AF] focus:outline-none focus:ring-2 focus:ring-[#166EE1] focus:border-transparent resize-none"
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
                        ? 'border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] bg-white dark:bg-[hsl(200,30%,10%)] hover:border-[#166EE1] cursor-pointer'
                        : 'border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] bg-[#F9F9FA] dark:bg-[hsl(200,25%,13%)] cursor-default',
                    )}
                    onClick={() => canConvert && setShowTypeSelector(!showTypeSelector)}
                    disabled={!canConvert}
                  >
                    <ActiveIcon size={14} className="text-[#9AA2AF]" />
                    <span className="text-[13px] text-[#374151] dark:text-[hsl(200,25%,88%)]">
                      {FIELD_TYPE_LABELS[activeType] ?? activeType}
                    </span>
                    {selectedNewType && selectedNewType !== field.ui_type && (
                      <span className="text-[11px] text-[#166EE1] ml-1">(changing)</span>
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
                    <div className="border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded-lg bg-white dark:bg-[hsl(200,30%,10%)] p-2 space-y-0.5 max-h-48 overflow-y-auto">
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
                              className="w-3.5 h-3.5 accent-[#166EE1]"
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

          {isLongText && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-3.5 h-3.5 accent-[#166EE1]"
                checked={richText}
                onChange={(e) => setRichText(e.target.checked)}
              />
              <span className="text-xs text-[#374151] dark:text-[hsl(200,25%,88%)]">Rich text formatting</span>
            </label>
          )}

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
                  className="h-8 px-2 text-xs text-[#166EE1] hover:text-[#2952CC] gap-1"
                  onClick={addChoice}
                  disabled={!newChoiceText.trim()}
                >
                  <Plus size={13} /> Add
                </Button>
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

          {isLookup && (
            <div className="space-y-3">
              {linkFields.length === 0 ? (
                <div className="bg-blue-50 dark:bg-blue-950/30 border-l-4 border-[#166EE1] rounded-r-md p-3 flex items-start gap-2.5">
                  <Info size={16} className="text-[#166EE1] shrink-0 mt-0.5" />
                  <p className="text-xs text-[#374151] dark:text-[hsl(200,25%,88%)] leading-relaxed">
                    This table has no Link fields yet. Create a Link to Another Record field first, then set up your Lookup.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Link Field</Label>
                    <select
                      value={linkFieldId}
                      onChange={(e) => { setLinkFieldId(e.target.value); setLookupFieldId(''); }}
                      className="w-full h-9 px-2 border border-[#E5E5E5] rounded-lg text-[13px] bg-white dark:bg-[hsl(200,30%,10%)] dark:border-[hsl(200,25%,18%)] dark:text-[hsl(200,25%,88%)] focus:outline-none focus:ring-2 focus:ring-[#166EE1]/30 focus:border-[#166EE1]"
                    >
                      <option value="">Select a link field...</option>
                      {linkFields.map((f: FieldMeta) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                  {linkFieldId && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Lookup Field</Label>
                      <select
                        value={lookupFieldId}
                        onChange={(e) => setLookupFieldId(e.target.value)}
                        className="w-full h-9 px-2 border border-[#E5E5E5] rounded-lg text-[13px] bg-white dark:bg-[hsl(200,30%,10%)] dark:border-[hsl(200,25%,18%)] dark:text-[hsl(200,25%,88%)] focus:outline-none focus:ring-2 focus:ring-[#166EE1]/30 focus:border-[#166EE1]"
                      >
                        <option value="">Select a field...</option>
                        {targetFields.map((f: FieldMeta) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {isRollup && (
            <div className="space-y-3">
              {linkFields.length === 0 ? (
                <div className="bg-blue-50 dark:bg-blue-950/30 border-l-4 border-[#166EE1] rounded-r-md p-3 flex items-start gap-2.5">
                  <Info size={16} className="text-[#166EE1] shrink-0 mt-0.5" />
                  <p className="text-xs text-[#374151] dark:text-[hsl(200,25%,88%)] leading-relaxed">
                    This table has no Link fields yet. Create a Link to Another Record field first, then set up your Rollup.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Link Field</Label>
                    <select
                      value={linkFieldId}
                      onChange={(e) => { setLinkFieldId(e.target.value); setRollupFieldId(''); }}
                      className="w-full h-9 px-2 border border-[#E5E5E5] rounded-lg text-[13px] bg-white dark:bg-[hsl(200,30%,10%)] dark:border-[hsl(200,25%,18%)] dark:text-[hsl(200,25%,88%)] focus:outline-none focus:ring-2 focus:ring-[#166EE1]/30 focus:border-[#166EE1]"
                    >
                      <option value="">Select a link field...</option>
                      {linkFields.map((f: FieldMeta) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                  {linkFieldId && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Rollup Field</Label>
                      <select
                        value={rollupFieldId}
                        onChange={(e) => setRollupFieldId(e.target.value)}
                        className="w-full h-9 px-2 border border-[#E5E5E5] rounded-lg text-[13px] bg-white dark:bg-[hsl(200,30%,10%)] dark:border-[hsl(200,25%,18%)] dark:text-[hsl(200,25%,88%)] focus:outline-none focus:ring-2 focus:ring-[#166EE1]/30 focus:border-[#166EE1]"
                      >
                        <option value="">Select a field...</option>
                        {targetFields.map((f: FieldMeta) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Rollup Function</Label>
                    <select
                      value={rollupFunction}
                      onChange={(e) => setRollupFunction(e.target.value as RollupFunction)}
                      className="w-full h-9 px-2 border border-[#E5E5E5] rounded-lg text-[13px] bg-white dark:bg-[hsl(200,30%,10%)] dark:border-[hsl(200,25%,18%)] dark:text-[hsl(200,25%,88%)] focus:outline-none focus:ring-2 focus:ring-[#166EE1]/30 focus:border-[#166EE1]"
                    >
                      {ROLLUP_FUNCTIONS.map((fn) => (
                        <option key={fn} value={fn}>{fn}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          )}

          {field?.ui_type === 'Duration' && (
            <div className="space-y-1.5">
              <Label className="text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Duration Format</Label>
              <select
                value={durationFormat}
                onChange={(e) => setDurationFormat(e.target.value)}
                className="w-full h-9 px-2 border border-[#E5E5E5] rounded-lg text-[13px] bg-white dark:bg-[hsl(200,30%,10%)] dark:border-[hsl(200,25%,18%)] dark:text-[hsl(200,25%,88%)] focus:outline-none focus:ring-2 focus:ring-[#166EE1]/30 focus:border-[#166EE1]"
              >
                <option value="h:mm">h:mm (e.g., 1:30)</option>
                <option value="h:mm:ss">h:mm:ss (e.g., 1:30:00)</option>
                <option value="h:mm:ss.s">h:mm:ss.s (e.g., 1:30:00.0)</option>
                <option value="h:mm:ss.ss">h:mm:ss.ss (e.g., 1:30:00.00)</option>
                <option value="h:mm:ss.sss">h:mm:ss.sss (e.g., 1:30:00.000)</option>
              </select>
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        {/* Delete field button — hidden for primary fields */}
        {field && !field.is_primary && !field.is_system && (
          <div className="border-t border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] pt-3 mt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 gap-1.5 w-full justify-start text-xs"
              onClick={() => {
                if (window.confirm(`Delete field "${field.name}"? This cannot be undone.`)) {
                  deleteField.mutate(
                    { id: field.id, table_id: field.table_id },
                    {
                      onSuccess: () => onOpenChange(false),
                      onError: (err) => setError(`Failed to delete field: ${err instanceof Error ? err.message : 'Unknown error'}`),
                    },
                  );
                }
              }}
              disabled={deleteField.isPending}
            >
              <Trash2 size={13} />
              {deleteField.isPending ? 'Deleting...' : 'Delete field'}
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            style={{ backgroundColor: '#166EE1' }}
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
