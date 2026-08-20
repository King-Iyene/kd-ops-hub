import { useCallback, useEffect, useState } from 'react';
import {
  Plus, Trash2, GripVertical, Eye, Copy, Check,
  ArrowUp, ArrowDown, FileText,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import type { Space } from '@/components/tasks/TaskSidebar';
import type { TaskList, ProfileRow } from '@/lib/task-types';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface FormField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'date' | 'email' | 'number';
  required: boolean;
  options?: string[];
  placeholder?: string;
  maps_to?: 'title' | 'description' | 'due_date' | 'priority' | 'tags';
}

export interface TaskForm {
  id: string;
  name: string;
  description: string | null;
  space_id: string | null;
  list_id: string | null;
  created_by: string | null;
  is_active: boolean;
  fields: FormField[];
  default_status: string;
  default_priority: string;
  default_assignee_id: string | null;
  submit_message: string | null;
  submission_count: number;
  created_at: string;
  updated_at: string;
}

interface TaskFormBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaces: Space[];
  lists: TaskList[];
  profiles: Map<string, ProfileRow>;
  editingForm?: TaskForm | null;
  onSaved: () => void;
}

/* ------------------------------------------------------------------ */
/*  Field type metadata                                                */
/* ------------------------------------------------------------------ */

const FIELD_TYPES: { value: FormField['type']; label: string }[] = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'select', label: 'Dropdown' },
  { value: 'date', label: 'Date' },
  { value: 'email', label: 'Email' },
  { value: 'number', label: 'Number' },
];

const MAPS_TO_OPTIONS: { value: FormField['maps_to']; label: string }[] = [
  { value: undefined, label: 'None' },
  { value: 'title', label: 'Task title' },
  { value: 'description', label: 'Task description' },
  { value: 'due_date', label: 'Due date' },
  { value: 'priority', label: 'Priority' },
  { value: 'tags', label: 'Tags' },
];

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'complete', label: 'Complete' },
];

const PRIORITY_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

function makeId(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
}

function defaultField(): FormField {
  return { id: makeId(), label: '', type: 'text', required: false };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TaskFormBuilder({
  open, onOpenChange, spaces, lists, profiles, editingForm, onSaved,
}: TaskFormBuilderProps) {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [listId, setListId] = useState<string | null>(null);
  const [defaultStatus, setDefaultStatus] = useState('open');
  const [defaultPriority, setDefaultPriority] = useState('normal');
  const [defaultAssigneeId, setDefaultAssigneeId] = useState<string | null>(null);
  const [fields, setFields] = useState<FormField[]>([defaultField()]);
  const [submitMessage, setSubmitMessage] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [optionInput, setOptionInput] = useState<Record<string, string>>({});

  // Populate when editing
  useEffect(() => {
    if (!open) return;
    if (editingForm) {
      setName(editingForm.name);
      setDescription(editingForm.description ?? '');
      setSpaceId(editingForm.space_id);
      setListId(editingForm.list_id);
      setDefaultStatus(editingForm.default_status);
      setDefaultPriority(editingForm.default_priority);
      setDefaultAssigneeId(editingForm.default_assignee_id);
      setFields(editingForm.fields.length > 0 ? editingForm.fields : [defaultField()]);
      setSubmitMessage(editingForm.submit_message ?? '');
      setIsActive(editingForm.is_active);
    } else {
      setName('');
      setDescription('');
      setSpaceId(null);
      setListId(null);
      setDefaultStatus('open');
      setDefaultPriority('normal');
      setDefaultAssigneeId(null);
      setFields([defaultField()]);
      setSubmitMessage('');
      setIsActive(true);
    }
    setPreview(false);
    setOptionInput({});
  }, [open, editingForm]);

  const filteredLists = spaceId
    ? lists.filter((l) => l.space_id === spaceId)
    : lists;

  /* ---------- Field mutations ---------- */

  const updateField = useCallback((id: string, patch: Partial<FormField>) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }, []);

  const removeField = useCallback((id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const moveField = useCallback((idx: number, dir: -1 | 1) => {
    setFields((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }, []);

  const addOption = useCallback((fieldId: string) => {
    const val = (optionInput[fieldId] ?? '').trim();
    if (!val) return;
    setFields((prev) =>
      prev.map((f) =>
        f.id === fieldId
          ? { ...f, options: [...(f.options ?? []), val] }
          : f,
      ),
    );
    setOptionInput((prev) => ({ ...prev, [fieldId]: '' }));
  }, [optionInput]);

  const removeOption = useCallback((fieldId: string, idx: number) => {
    setFields((prev) =>
      prev.map((f) =>
        f.id === fieldId
          ? { ...f, options: (f.options ?? []).filter((_, i) => i !== idx) }
          : f,
      ),
    );
  }, []);

  /* ---------- Save ---------- */

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: 'Validation', description: 'Form name is required.', variant: 'destructive' });
      return;
    }
    const validFields = fields.filter((f) => f.label.trim());
    if (validFields.length === 0) {
      toast({ title: 'Validation', description: 'Add at least one field with a label.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      space_id: spaceId,
      list_id: listId,
      created_by: profile?.id ?? null,
      is_active: isActive,
      fields: validFields,
      default_status: defaultStatus,
      default_priority: defaultPriority,
      default_assignee_id: defaultAssigneeId,
      submit_message: submitMessage.trim() || null,
    };

    let error: any;
    if (editingForm) {
      ({ error } = await supabase
        .from('task_forms')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingForm.id));
    } else {
      ({ error } = await supabase.from('task_forms').insert(payload));
    }

    if (error) {
      toast({ title: 'Failed to save form', description: error.message, variant: 'destructive' });
      setSaving(false);
      return;
    }

    await logAudit(
      editingForm ? 'task_updated' : 'task_created',
      `${editingForm ? 'Updated' : 'Created'} task intake form "${name.trim()}"`,
      null,
      { form_name: name.trim() },
    );
    toast({ title: editingForm ? 'Form updated' : 'Form created' });
    setSaving(false);
    onSaved();
    onOpenChange(false);
  };

  /* ---------- Copy link ---------- */

  const copyLink = useCallback(() => {
    if (!editingForm) return;
    const url = `${window.location.origin}/forms/${editingForm.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [editingForm]);

  /* ---------- Preview ---------- */

  const renderPreview = () => (
    <Card className="p-6 space-y-4 border-dashed">
      <h3 className="text-lg font-semibold">{name || 'Untitled Form'}</h3>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {fields.filter((f) => f.label.trim()).map((field) => (
        <div key={field.id} className="space-y-1">
          <Label>
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          {field.type === 'textarea' ? (
            <Textarea placeholder={field.placeholder} disabled />
          ) : field.type === 'select' ? (
            <Select disabled>
              <SelectTrigger><SelectValue placeholder={field.placeholder || 'Select...'} /></SelectTrigger>
              <SelectContent>
                {(field.options ?? []).map((o) => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input type={field.type} placeholder={field.placeholder} disabled />
          )}
        </div>
      ))}
      <Button disabled className="w-full">Submit</Button>
    </Card>
  );

  /* ---------- Render ---------- */

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {editingForm ? 'Edit Intake Form' : 'Create Intake Form'}
          </DialogTitle>
        </DialogHeader>

        {preview ? (
          <>
            {renderPreview()}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setPreview(false)}>Back to editor</Button>
            </DialogFooter>
          </>
        ) : (
          <div className="space-y-6">
            {/* --- Form name & description --- */}
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Form name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Bug Report, Client Request"
                />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Instructions shown at the top of the form"
                  rows={2}
                />
              </div>
            </div>

            {/* --- Target space & list --- */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Space</Label>
                <Select
                  value={spaceId ?? '__none'}
                  onValueChange={(v) => {
                    setSpaceId(v === '__none' ? null : v);
                    setListId(null);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select space" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No space</SelectItem>
                    {spaces.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Target list</Label>
                <Select
                  value={listId ?? '__none'}
                  onValueChange={(v) => setListId(v === '__none' ? null : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Select list" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No list</SelectItem>
                    {filteredLists.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* --- Defaults --- */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Default status</Label>
                <Select value={defaultStatus} onValueChange={setDefaultStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Default priority</Label>
                <Select value={defaultPriority} onValueChange={setDefaultPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Default assignee</Label>
                <Select
                  value={defaultAssigneeId ?? '__none'}
                  onValueChange={(v) => setDefaultAssigneeId(v === '__none' ? null : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Unassigned</SelectItem>
                    {[...profiles.entries()].map(([id, p]) => (
                      <SelectItem key={id} value={id}>{p.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* --- Fields editor --- */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Form fields</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setFields((prev) => [...prev, defaultField()])}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add field
                </Button>
              </div>
              <div className="space-y-3">
                {fields.map((field, idx) => (
                  <Card key={field.id} className="p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      {/* Reorder */}
                      <div className="flex flex-col gap-0.5 pt-1">
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                          onClick={() => moveField(idx, -1)}
                          disabled={idx === 0}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" />
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                          onClick={() => moveField(idx, 1)}
                          disabled={idx === fields.length - 1}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Main field settings */}
                      <div className="flex-1 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            value={field.label}
                            onChange={(e) => updateField(field.id, { label: e.target.value })}
                            placeholder="Field label"
                          />
                          <Select
                            value={field.type}
                            onValueChange={(v) =>
                              updateField(field.id, { type: v as FormField['type'] })
                            }
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {FIELD_TYPES.map((t) => (
                                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            value={field.placeholder ?? ''}
                            onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                            placeholder="Placeholder text"
                          />
                          <Select
                            value={field.maps_to ?? '__none'}
                            onValueChange={(v) =>
                              updateField(field.id, {
                                maps_to: v === '__none' ? undefined : (v as FormField['maps_to']),
                              })
                            }
                          >
                            <SelectTrigger><SelectValue placeholder="Maps to..." /></SelectTrigger>
                            <SelectContent>
                              {MAPS_TO_OPTIONS.map((m) => (
                                <SelectItem key={m.value ?? '__none'} value={m.value ?? '__none'}>
                                  {m.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Options for select type */}
                        {field.type === 'select' && (
                          <div className="space-y-1">
                            <div className="flex flex-wrap gap-1">
                              {(field.options ?? []).map((opt, oi) => (
                                <Badge
                                  key={oi}
                                  variant="secondary"
                                  className="cursor-pointer"
                                  onClick={() => removeOption(field.id, oi)}
                                >
                                  {opt} &times;
                                </Badge>
                              ))}
                            </div>
                            <div className="flex gap-1">
                              <Input
                                value={optionInput[field.id] ?? ''}
                                onChange={(e) =>
                                  setOptionInput((prev) => ({ ...prev, [field.id]: e.target.value }))
                                }
                                placeholder="Add option..."
                                className="h-7 text-xs"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    addOption(field.id);
                                  }
                                }}
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                onClick={() => addOption(field.id)}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Required toggle */}
                        <div className="flex items-center gap-2">
                          <Switch
                            id={`req-${field.id}`}
                            checked={field.required}
                            onCheckedChange={(v) => updateField(field.id, { required: v })}
                          />
                          <Label htmlFor={`req-${field.id}`} className="text-xs text-muted-foreground">
                            Required
                          </Label>
                        </div>
                      </div>

                      {/* Delete */}
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Remove field"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => removeField(field.id)}
                        disabled={fields.length <= 1}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            {/* --- Submit message --- */}
            <div className="space-y-1">
              <Label>Custom submit message</Label>
              <Input
                value={submitMessage}
                onChange={(e) => setSubmitMessage(e.target.value)}
                placeholder="Thank you! Your request has been submitted."
              />
            </div>

            {/* --- Active toggle --- */}
            <div className="flex items-center gap-3">
              <Switch
                id="form-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
              <Label htmlFor="form-active">Form is active</Label>
              {!isActive && (
                <Badge variant="secondary" className="text-xs">Submissions disabled</Badge>
              )}
            </div>

            {/* --- Footer --- */}
            <DialogFooter className="gap-2 sm:gap-0">
              {editingForm && (
                <Button variant="outline" size="sm" onClick={copyLink} className="mr-auto">
                  {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                  {copied ? 'Copied!' : 'Copy link'}
                </Button>
              )}
              <Button variant="outline" onClick={() => setPreview(true)}>
                <Eye className="h-3.5 w-3.5 mr-1" /> Preview
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editingForm ? 'Update form' : 'Create form'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
