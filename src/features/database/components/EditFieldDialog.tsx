import { useState, useCallback, useEffect } from 'react';
import { confirm } from '@/hooks/use-confirm';
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
import { Plus, X, AlertTriangle, GripVertical, Trash2 } from 'lucide-react';
import { useUpdateField, useChangeFieldType, useDeleteField } from '../hooks';
import { useFields } from '../hooks/useFields';
import type { FieldMeta, SelectChoice, UIType } from '../types';
import { SELECT_COLORS, SELECT_COLOR_NAMES, VIRTUAL_TYPES, getConvertibleTypes } from '../types';
import { addChoicesFromText, nextUnusedColor, sortChoicesAZ, splitSelectTokens } from '../lib/selectOptions';
import { getFieldTypeIcon } from './grid/field-icons';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { validateFormula } from '../lib/formula';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FormulaEditor } from './FormulaEditor';
import { RollupSetup } from './RollupSetup';
import { useTables } from '../hooks/useTables';
import { useDatabaseUI } from '../lib/store';
import { keepDialogOpenWhileSuggesting } from './formula/escape';
import type { RollupFunction } from '../lib/computations';
import { NumberFormatPanel } from './NumberFormatPanel';
import { FieldDefaultPanel } from './FieldDefaultPanel';
import { FieldValidationPanel } from './FieldValidationPanel';
import { AttachmentOptionsPanel } from './AttachmentOptionsPanel';
import {
  DEFAULT_ATTACHMENT_SETTINGS,
  applyAttachmentSettings,
  attachmentSettingsFromOptions,
  type AttachmentSettings,
} from '../lib/attachmentRules';
import { DEFAULT_VALIDATION_SETTINGS, allowedRules, rulesFromSettings, settingsFromRules, type ValidationRule, type ValidationSettings } from '../lib/validation';
import { normalizeDefault, supportsDefault } from '../lib/fieldDefaults';
import { RatingOptionsPanel } from './RatingOptionsPanel';
import { ratingIconOf, ratingMaxOf, type RatingIcon } from '../lib/ratingStyle';
import { DEFAULT_NUMBER_SETTINGS, applyNumberSettings, settingsFromOptions, type NumberFormatSettings } from '../lib/numberFormat';


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
        className="text-[#9AA2AF] dark:text-[hsl(220,20%,55%)] cursor-grab shrink-0 opacity-0 group-hover:opacity-100 transition-opacity touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>
      {isEditing ? (
        <input
          autoFocus
          className="flex-1 min-w-0 px-2.5 py-0.5 rounded-full text-xs font-medium border border-primary outline-none bg-white dark:bg-[hsl(220,30%,10%)] text-[#374151] dark:text-[hsl(220,25%,88%)]"
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
          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium flex-1 min-w-0 truncate select-pill cursor-default"
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
            className="w-5 h-5 rounded-full border-2 border-border hover:scale-110 transition-transform shrink-0"
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
        className="p-0.5 rounded hover:bg-destructive/5 text-[#9AA2AF] dark:text-[hsl(220,20%,55%)] hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
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
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [precision, setPrecision] = useState(2);
  const [ratingMax, setRatingMax] = useState(5);
  const [ratingIcon, setRatingIcon] = useState<RatingIcon>('star');
  const [ratingColor, setRatingColor] = useState('amber');
  const [use12h, setUse12h] = useState(true);
  const [linkAllowMultiple, setLinkAllowMultiple] = useState(true);
  const [defaultValue, setDefaultValue] = useState('');
  const [validation, setValidation] = useState<ValidationSettings>(DEFAULT_VALIDATION_SETTINGS);
  const [attachment, setAttachment] = useState<AttachmentSettings>(DEFAULT_ATTACHMENT_SETTINGS);
  const [allowNewOptions, setAllowNewOptions] = useState(true);
  const [numFmt, setNumFmt] = useState<NumberFormatSettings>(DEFAULT_NUMBER_SETTINGS);
  const [durationFormat, setDurationFormat] = useState('h:mm');
  const [buttonLabel, setButtonLabel] = useState('Click');
  const [buttonUrl, setButtonUrl] = useState('');
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [dateFormat, setDateFormat] = useState<string>('friendly');
  const [includeTime, setIncludeTime] = useState(false);
  const [displayTimezone, setDisplayTimezone] = useState(false);
  const [defaultToCurrentDate, setDefaultToCurrentDate] = useState(false);
  const updateField = useUpdateField();
  const changeFieldType = useChangeFieldType();
  const deleteField = useDeleteField();

  // Fetch fields for lookup configuration
  const { data: currentTableFields = [] } = useFields(field?.table_id ?? null);
  const linkFields = currentTableFields.filter((f: FieldMeta) => f.ui_type === 'Links');
  const selectedLinkField = linkFields.find((f: FieldMeta) => f.id === linkFieldId);
  const targetTableIdFromLink = selectedLinkField?.options?.relatedTableId ?? null;
  const { data: targetFields = [] } = useFields(targetTableIdFromLink);
  const { activeBaseId } = useDatabaseUI();
  const { data: tables = [] } = useTables(activeBaseId);

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
      setFormulaExpression((field.options as any)?.expression ?? (field.options as any)?.formula ?? '');
      setFormulaError('');
      setLinkFieldId((field.options as any)?.linkFieldId ?? '');
      setLookupFieldId((field.options as any)?.lookupFieldId ?? '');
      setRollupFieldId((field.options as any)?.rollupFieldId ?? '');
      setRollupFunction((field.options as any)?.fn ?? 'COUNT');
      setRichText((field.options as any)?.richText ?? false);
      setCurrencyCode((field.options as any)?.currencyCode ?? (field.options as any)?.symbol ?? 'USD');
      setPrecision((field.options as any)?.precision ?? 2);
      setNumFmt(settingsFromOptions(field.options as any));
      setRatingMax(ratingMaxOf((field.options as any)?.max));
      setRatingIcon(ratingIconOf((field.options as any)?.icon));
      setRatingColor((field.options as any)?.color ?? 'amber');
      setUse12h((field.options as any)?.use12h !== false);
      setLinkAllowMultiple((field.options as any)?.allowMultiple !== false);
      setDefaultValue(field.default_value ?? '');
      setValidation(settingsFromRules((field.options as any)?.validations));
      setAttachment(attachmentSettingsFromOptions(field.options as any));
      setAllowNewOptions((field.options as any)?.allowNewOptions !== false);
      setDurationFormat((field.options as any)?.format ?? 'h:mm');
      setButtonLabel((field.options as any)?.label ?? 'Click');
      setButtonUrl((field.options as any)?.url ?? '');
      setAllowMultiple((field.options as any)?.allowMultiple ?? false);
      setDateFormat((field.options as any)?.dateFormat ?? 'friendly');
      setIncludeTime((field.options as any)?.includeTime ?? field.ui_type === 'DateTime');
      setDisplayTimezone((field.options as any)?.displayTimezone ?? false);
      setDefaultToCurrentDate((field.options as any)?.defaultToCurrentDate ?? false);
    }
  }, [field]);

  const isNumberLike = field?.ui_type === 'Number' || field?.ui_type === 'Decimal' || field?.ui_type === 'Percent';
  const isSelectType = field?.ui_type === 'SingleSelect' || field?.ui_type === 'MultiSelect';
  const isLongText = field?.ui_type === 'LongText';
  const isFormula = field?.ui_type === 'Formula';
  const isLookup = field?.ui_type === 'Lookup';
  const isRollup = field?.ui_type === 'Rollup';
  const isCount = field?.ui_type === 'Count';
  const isCurrency = field?.ui_type === 'Currency';
  const isDateType = field?.ui_type === 'Date' || field?.ui_type === 'DateTime';
  const isButton = field?.ui_type === 'Button';
  const isUser = field?.ui_type === 'User';

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
    setChoices([...choices, { title, color: nextUnusedColor(choices, SELECT_COLOR_NAMES) }]);
    setNewChoiceText('');
  }, [newChoiceText, choices]);

  // Pasting a list (commas, semicolons or one per line) adds every option at once.
  const pasteChoices = useCallback((e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    if (splitSelectTokens(text).length < 2) return;
    e.preventDefault();
    setChoices(addChoicesFromText(choices, text, SELECT_COLOR_NAMES));
    setNewChoiceText('');
  }, [choices]);

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
    // Only check the formula when it was changed, so an imported formula that uses a function this app does not
    // have can still be renamed or reformatted without having to be rewritten first.
    const savedFormula = String((field?.options as any)?.expression ?? (field?.options as any)?.formula ?? '');
    if (isFormula && formulaExpression.trim() && formulaExpression !== savedFormula) {
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
        const next: Record<string, unknown> = { ...(field.options as any), choices };
        if (allowNewOptions) delete next.allowNewOptions; else next.allowNewOptions = false;
        updates.options = next;
      }
      if (supportsDefault(field.ui_type)) {
        const nextDefault = normalizeDefault(field.ui_type, defaultValue);
        if (nextDefault !== (field.default_value ?? null)) updates.default_value = nextDefault;
      }
      if (isFormula) {
        updates.options = { ...(field.options as any), expression: formulaExpression };
      }
      if (isLookup) {
        updates.options = { ...(field.options as any), linkFieldId, lookupFieldId };
      }
      if (isCurrency) {
        updates.options = applyNumberSettings({ ...(field.options as any), currencyCode, precision }, numFmt, { precision: false, affixes: false });
      }
      if (isNumberLike) {
        updates.options = applyNumberSettings(field.options as any, numFmt, {
          precision: true,
          affixes: field.ui_type === 'Number' || field.ui_type === 'Decimal',
          percent: field.ui_type === 'Percent',
        });
      }
      if (isLongText) {
        updates.options = { ...(field.options as any), richText };
      }
      if (isDateType) {
        const next: Record<string, unknown> = { ...(field.options as any), dateFormat, includeTime, displayTimezone, defaultToCurrentDate };
        if (includeTime && !use12h) next.use12h = false; else delete next.use12h;
        updates.options = next;
      }
      if (field.ui_type === 'Attachment') {
        updates.options = applyAttachmentSettings(field.options as any, attachment);
      }
      if (field.ui_type === 'Links') {
        const next: Record<string, unknown> = { ...(field.options as any) };
        if (linkAllowMultiple) delete next.allowMultiple; else next.allowMultiple = false;
        updates.options = next;
      }
      if (field.ui_type === 'Rating') {
        const next: Record<string, unknown> = { ...(field.options as any), max: ratingMax };
        if (ratingIcon === 'star') delete next.icon; else next.icon = ratingIcon;
        if (ratingColor === 'amber') delete next.color; else next.color = ratingColor;
        updates.options = next;
      }
      if (isRollup) {
        updates.options = { ...(field.options as any), linkFieldId, rollupFieldId, fn: rollupFunction };
      }
      if (isCount) {
        updates.options = { ...(field.options as any), linkFieldId, fn: 'COUNTALL' };
      }
      if (field.ui_type === 'Duration') {
        updates.options = { ...(field.options as any), format: durationFormat };
      }
      if (isButton) {
        updates.options = { ...(field.options as any), label: buttonLabel || 'Click', url: buttonUrl };
      }
      if (isUser) {
        updates.options = { ...(field.options as any), allowMultiple };
      }
      if (allowedRules(field.ui_type).length > 0) {
        const baseOptions: Record<string, unknown> = { ...((updates.options ?? field.options) as any) };
        const nextRules = rulesFromSettings(validation, field.ui_type, (baseOptions.validations as ValidationRule[] | undefined) ?? []);
        const before = JSON.stringify((baseOptions.validations as unknown[] | undefined) ?? []);
        if (before !== JSON.stringify(nextRules)) {
          if (nextRules.length > 0) baseOptions.validations = nextRules; else delete baseOptions.validations;
          updates.options = baseOptions;
        }
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
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" onEscapeKeyDown={keepDialogOpenWhileSuggesting}>
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-[#374151] dark:text-[hsl(220,25%,88%)]">Edit Field</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="edit-field-name" className="text-xs text-[#6A7184] dark:text-[hsl(220,20%,55%)]">Field Name</Label>
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
            <Label htmlFor="edit-field-desc" className="text-xs text-[#6A7184] dark:text-[hsl(220,20%,55%)]">Description <span className="text-[#9AA2AF] dark:text-[hsl(220,20%,55%)]">(optional)</span></Label>
            <textarea
              id="edit-field-desc"
              value={description}
              onChange={(e) => {
                if (e.target.value.length <= 500) setDescription(e.target.value);
              }}
              placeholder="Add a description for this field..."
              className="w-full rounded-md border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] bg-white dark:bg-[hsl(220,30%,10%)] px-3 py-2 text-xs text-[#374151] dark:text-[hsl(220,25%,88%)] placeholder:text-[#9AA2AF] dark:placeholder:text-[hsl(220,20%,45%)] focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
              rows={3}
              maxLength={500}
            />
            <div className="text-2xs text-[#9AA2AF] dark:text-[hsl(220,20%,55%)] text-right">{description.length}/500</div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-[#6A7184] dark:text-[hsl(220,20%,55%)]">Field Type</Label>
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
                        ? 'border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] bg-white dark:bg-[hsl(220,30%,10%)] hover:border-primary cursor-pointer'
                        : 'border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] bg-[#F9F9FA] dark:bg-[hsl(220,25%,13%)] cursor-default',
                    )}
                    onClick={() => canConvert && setShowTypeSelector(!showTypeSelector)}
                    disabled={!canConvert}
                  >
                    <ActiveIcon size={14} className="text-[#9AA2AF] dark:text-[hsl(220,20%,55%)]" />
                    <span className="text-xs-plus text-[#374151] dark:text-[hsl(220,25%,88%)]">
                      {FIELD_TYPE_LABELS[activeType] ?? activeType}
                    </span>
                    {selectedNewType && selectedNewType !== field.ui_type && (
                      <span className="text-2xs text-primary ml-1">(changing)</span>
                    )}
                    {!canConvert && (
                      <span className="text-2xs text-[#9AA2AF] dark:text-[hsl(220,20%,55%)] ml-auto">
                        {isVirtual ? 'Virtual type' : field.is_primary ? 'Primary field' : 'No conversions available'}
                      </span>
                    )}
                    {canConvert && (
                      <span className="text-2xs text-[#9AA2AF] dark:text-[hsl(220,20%,55%)] ml-auto">Click to change</span>
                    )}
                  </button>

                  {showTypeSelector && canConvert && (
                    <div className="border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] rounded-lg bg-white dark:bg-[hsl(220,30%,10%)] p-2 space-y-0.5 max-h-48 overflow-y-auto">
                      {/* Option to revert to original */}
                      {selectedNewType && (
                        <button
                          type="button"
                          className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-left hover:bg-[#F3F4F6] dark:hover:bg-[hsl(220,25%,15%)] transition-colors"
                          onClick={() => {
                            setSelectedNewType(null);
                            setTypeChangeConfirmed(false);
                            setShowTypeSelector(false);
                          }}
                        >
                          <Icon size={13} className="text-[#9AA2AF] dark:text-[hsl(220,20%,55%)]" />
                          <span className="text-xs text-[#374151] dark:text-[hsl(220,25%,88%)]">
                            {FIELD_TYPE_LABELS[field.ui_type] ?? field.ui_type}
                          </span>
                          <span className="text-3xs text-[#9AA2AF] dark:text-[hsl(220,20%,55%)] ml-auto">current</span>
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
                                : 'hover:bg-[#F3F4F6] dark:hover:bg-[hsl(220,25%,15%)]',
                            )}
                            onClick={() => {
                              setSelectedNewType(type);
                              setTypeChangeConfirmed(rule.safety === 'safe');
                              setShowTypeSelector(false);
                            }}
                          >
                            <TypeIcon size={13} className="text-[#9AA2AF] dark:text-[hsl(220,20%,55%)]" />
                            <span className="text-xs text-[#374151] dark:text-[hsl(220,25%,88%)]">
                              {FIELD_TYPE_LABELS[type] ?? type}
                            </span>
                            <span className={cn(
                              'text-3xs ml-auto',
                              rule.safety === 'safe' ? 'text-success' : 'text-warning',
                            )}>
                              {rule.safety === 'safe' ? 'safe' : 'lossy'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {selectedRule && selectedRule.warning && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-warning/10 border border-warning/20">
                      <AlertTriangle size={14} className="text-warning mt-0.5 shrink-0" />
                      <div className="space-y-1.5">
                        <p className="text-xs text-warning">{selectedRule.warning}</p>
                        {selectedRule.safety === 'lossy' && (
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              className="w-3.5 h-3.5 accent-primary"
                              checked={typeChangeConfirmed}
                              onChange={(e) => setTypeChangeConfirmed(e.target.checked)}
                            />
                            <span className="text-xs text-warning font-medium">
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
                className="w-3.5 h-3.5 accent-primary"
                checked={richText}
                onChange={(e) => setRichText(e.target.checked)}
              />
              <span className="text-xs text-[#374151] dark:text-[hsl(220,25%,88%)]">Rich text formatting</span>
            </label>
          )}

          {isSelectType && (
            <div className="space-y-2">
              <Label className="text-xs text-[#6A7184] dark:text-[hsl(220,20%,55%)]">Options</Label>
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
              {choices.length > 2 && (
                <button
                  type="button"
                  className="text-2xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                  onClick={() => setChoices(sortChoicesAZ(choices))}
                >
                  Sort A to Z
                </button>
              )}
              <div className="flex gap-2">
                <Input
                  value={newChoiceText}
                  onChange={(e) => setNewChoiceText(e.target.value)}
                  placeholder="Add an option, or paste a list"
                  onPaste={pasteChoices}
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
                  className="h-8 px-2 text-xs text-primary hover:text-primary/80 gap-1"
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
              <Label className="text-xs text-[#6A7184] dark:text-[hsl(220,20%,55%)]">Formula</Label>
              <FormulaEditor
                value={formulaExpression}
                onChange={handleFormulaChange}
                fields={currentTableFields}
                error={formulaError}
              />
            </div>
          )}

          {(isLookup || isRollup || isCount) && (
            <RollupSetup
              kind={isLookup ? 'Lookup' : isCount ? 'Count' : 'Rollup'}
              linkFields={linkFields}
              tables={tables}
              linkFieldId={linkFieldId}
              onLinkField={(id) => { setLinkFieldId(id); setLookupFieldId(''); setRollupFieldId(''); if (isRollup) setRollupFunction('COUNT'); }}
              targetFields={targetFields}
              targetFieldId={isLookup ? lookupFieldId : rollupFieldId}
              onTargetField={isLookup ? setLookupFieldId : setRollupFieldId}
              fn={rollupFunction}
              onFn={(f) => setRollupFunction(f as RollupFunction)}
            />
          )}

          {isCurrency && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-[#6A7184] dark:text-[hsl(220,20%,55%)]">Currency</Label>
                <select
                  value={currencyCode}
                  onChange={(e) => setCurrencyCode(e.target.value)}
                  className="w-full h-9 px-2 border border-[#E5E5E5] rounded-lg text-xs-plus bg-white dark:bg-[hsl(220,30%,10%)] dark:border-[hsl(220,25%,18%)] dark:text-[hsl(220,25%,88%)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                >
                  {[
                    { code: 'USD', label: 'US Dollar ($)' },
                    { code: 'EUR', label: 'Euro (€)' },
                    { code: 'GBP', label: 'British Pound (£)' },
                    { code: 'NGN', label: 'Nigerian Naira (₦)' },
                    { code: 'JPY', label: 'Japanese Yen (¥)' },
                    { code: 'CAD', label: 'Canadian Dollar (CA$)' },
                    { code: 'AUD', label: 'Australian Dollar (A$)' },
                    { code: 'CHF', label: 'Swiss Franc (CHF)' },
                    { code: 'CNY', label: 'Chinese Yuan (¥)' },
                    { code: 'INR', label: 'Indian Rupee (₹)' },
                    { code: 'KRW', label: 'South Korean Won (₩)' },
                    { code: 'BRL', label: 'Brazilian Real (R$)' },
                    { code: 'ZAR', label: 'South African Rand (R)' },
                    { code: 'GHS', label: 'Ghanaian Cedi (₵)' },
                    { code: 'KES', label: 'Kenyan Shilling (KSh)' },
                    { code: 'SEK', label: 'Swedish Krona (kr)' },
                    { code: 'PLN', label: 'Polish Złoty (zł)' },
                    { code: 'TRY', label: 'Turkish Lira (₺)' },
                    { code: 'RUB', label: 'Russian Ruble (₽)' },
                    { code: 'MXN', label: 'Mexican Peso (MX$)' },
                  ].map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-[#6A7184] dark:text-[hsl(220,20%,55%)]">Decimal Places</Label>
                <select
                  value={precision}
                  onChange={(e) => setPrecision(Number(e.target.value))}
                  className="w-full h-9 px-2 border border-[#E5E5E5] rounded-lg text-xs-plus bg-white dark:bg-[hsl(220,30%,10%)] dark:border-[hsl(220,25%,18%)] dark:text-[hsl(220,25%,88%)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                >
                  <option value={0}>0 (1,000)</option>
                  <option value={1}>1 (1,000.0)</option>
                  <option value={2}>2 (1,000.00)</option>
                  <option value={3}>3 (1,000.000)</option>
                  <option value={4}>4 (1,000.0000)</option>
                </select>
              </div>
            </div>
          )}

          {(isCurrency || isNumberLike) && field && (
            <NumberFormatPanel
              uiType={field.ui_type as 'Number' | 'Decimal' | 'Currency' | 'Percent'}
              currencyCode={currencyCode}
              value={numFmt}
              onChange={setNumFmt}
              showPrecision={!isCurrency}
            />
          )}

          {field?.ui_type === 'Links' && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 accent-primary"
                  checked={linkAllowMultiple}
                  onChange={(e) => setLinkAllowMultiple(e.target.checked)}
                />
                <span className="text-xs text-[#374151] dark:text-[hsl(220,25%,88%)]">Allow linking more than one record in a cell</span>
              </label>
              <p className="text-xs text-[#9AA2AF]">Turning this off does not remove links that already exist; it limits new ones.</p>
            </div>
          )}

          {field?.ui_type === 'Rating' && (
            <RatingOptionsPanel
              max={ratingMax}
              icon={ratingIcon}
              color={ratingColor}
              onChange={(n) => { setRatingMax(n.max); setRatingIcon(n.icon); setRatingColor(n.color); }}
            />
          )}

          {field?.ui_type === 'Duration' && (
            <div className="space-y-1.5">
              <Label className="text-xs text-[#6A7184] dark:text-[hsl(220,20%,55%)]">Duration Format</Label>
              <select
                value={durationFormat}
                onChange={(e) => setDurationFormat(e.target.value)}
                className="w-full h-9 px-2 border border-[#E5E5E5] rounded-lg text-xs-plus bg-white dark:bg-[hsl(220,30%,10%)] dark:border-[hsl(220,25%,18%)] dark:text-[hsl(220,25%,88%)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              >
                <option value="h:mm">h:mm (e.g., 1:30)</option>
                <option value="h:mm:ss">h:mm:ss (e.g., 1:30:00)</option>
                <option value="h:mm:ss.s">h:mm:ss.s (e.g., 1:30:00.0)</option>
                <option value="h:mm:ss.ss">h:mm:ss.ss (e.g., 1:30:00.00)</option>
                <option value="h:mm:ss.sss">h:mm:ss.sss (e.g., 1:30:00.000)</option>
              </select>
            </div>
          )}

          {isUser && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowMultiple}
                  onChange={(e) => setAllowMultiple(e.target.checked)}
                  className="rounded border-border"
                />
                <span className="text-xs text-[#6A7184] dark:text-[hsl(220,20%,55%)]">Allow multiple users</span>
              </label>
            </div>
          )}

          {isDateType && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-[#6A7184] dark:text-[hsl(220,20%,55%)]">Date format</Label>
                <select
                  value={dateFormat}
                  onChange={(e) => setDateFormat(e.target.value)}
                  className="w-full h-9 px-2 border border-[#E5E5E5] rounded-lg text-xs-plus bg-white dark:bg-[hsl(220,30%,10%)] dark:border-[hsl(220,25%,18%)] dark:text-[hsl(220,25%,88%)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                >
                  <option value="friendly">Friendly (September 20, 2026)</option>
                  <option value="local">Local (20/09/2026)</option>
                  <option value="us">US (09/20/2026)</option>
                  <option value="european">European (20/9/2026)</option>
                  <option value="iso">ISO (2026-09-20)</option>
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 accent-primary"
                  checked={includeTime}
                  onChange={(e) => {
                    setIncludeTime(e.target.checked);
                    if (!e.target.checked) setDisplayTimezone(false);
                  }}
                />
                <span className="text-xs text-[#374151] dark:text-[hsl(220,25%,88%)]">Include time</span>
              </label>
              {includeTime && (
                <label className="flex items-center gap-2 cursor-pointer ml-5">
                  <input
                    type="checkbox"
                    className="w-3.5 h-3.5 accent-primary"
                    checked={displayTimezone}
                    onChange={(e) => setDisplayTimezone(e.target.checked)}
                  />
                  <span className="text-xs text-[#374151] dark:text-[hsl(220,25%,88%)]">Display time zone</span>
                </label>
              )}
              {includeTime && (
                <label className="flex items-center gap-2 cursor-pointer ml-5">
                  <input
                    type="checkbox"
                    className="w-3.5 h-3.5 accent-primary"
                    checked={!use12h}
                    onChange={(e) => setUse12h(!e.target.checked)}
                  />
                  <span className="text-xs text-[#374151] dark:text-[hsl(220,25%,88%)]">Use a 24 hour clock</span>
                </label>
              )}
              <div className="border-t border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] pt-2.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-3.5 h-3.5 accent-primary"
                    checked={defaultToCurrentDate}
                    onChange={(e) => setDefaultToCurrentDate(e.target.checked)}
                  />
                  <span className="text-xs text-[#374151] dark:text-[hsl(220,25%,88%)]">Default to current date</span>
                </label>
                {defaultToCurrentDate && (
                  <p className="text-2xs text-[#9AA2AF] dark:text-[hsl(220,20%,55%)] mt-1 ml-5">
                    New rows will automatically use today's date for this field.
                  </p>
                )}
              </div>
            </div>
          )}

          {isButton && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-[#6A7184] dark:text-[hsl(220,20%,55%)]">Button Label</Label>
                <Input
                  value={buttonLabel}
                  onChange={(e) => setButtonLabel(e.target.value)}
                  placeholder="Click"
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-[#6A7184] dark:text-[hsl(220,20%,55%)]">URL Template</Label>
                <Input
                  value={buttonUrl}
                  onChange={(e) => setButtonUrl(e.target.value)}
                  placeholder="https://example.com/{Name}"
                  className="h-9"
                />
                <p className="text-2xs text-[#9AA2AF] dark:text-[hsl(220,20%,55%)]">
                  Use {'{fieldName}'} to insert field values from the record.
                </p>
              </div>
            </div>
          )}

          {field?.ui_type === 'Attachment' && <AttachmentOptionsPanel value={attachment} onChange={setAttachment} />}

          {field && <FieldValidationPanel uiType={field.ui_type} value={validation} onChange={setValidation} />}

          {field && (
            <FieldDefaultPanel
              uiType={field.ui_type}
              choices={choices}
              value={defaultValue}
              onChange={setDefaultValue}
              allowNewOptions={allowNewOptions}
              onAllowNewOptionsChange={setAllowNewOptions}
            />
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        {/* Delete field button — hidden for primary fields */}
        {field && !field.is_primary && !field.is_system && (
          <div className="border-t border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] pt-3 mt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/5 dark:hover:bg-destructive/10 gap-1.5 w-full justify-start text-xs"
              onClick={async () => {
                const confirmed = await confirm({ description: `Delete field "${field.name}"? This cannot be undone.`, variant: 'destructive' });
                if (confirmed) {
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
            style={{ backgroundColor: 'hsl(var(--primary))' }}
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
