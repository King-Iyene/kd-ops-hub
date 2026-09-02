import { useState } from 'react';
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
import { Link2 } from 'lucide-react';
import { useCreateField } from '../hooks';
import { useDatabaseUI } from '../lib/store';
import type { UIType } from '../types';
import { UI_TYPE_TO_PG_TYPE } from '../types';
import { CreateLinkDialog } from './CreateLinkDialog';

interface CreateFieldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FIELD_TYPE_OPTIONS: { value: UIType | '_link'; label: string }[] = [
  { value: 'SingleLineText', label: 'Single Line Text' },
  { value: 'LongText', label: 'Long Text' },
  { value: 'Number', label: 'Number' },
  { value: 'Decimal', label: 'Decimal' },
  { value: 'Currency', label: 'Currency' },
  { value: 'Percent', label: 'Percent' },
  { value: 'Date', label: 'Date' },
  { value: 'DateTime', label: 'Date & Time' },
  { value: 'Checkbox', label: 'Checkbox' },
  { value: 'SingleSelect', label: 'Single Select' },
  { value: 'MultiSelect', label: 'Multi Select' },
  { value: 'Email', label: 'Email' },
  { value: 'PhoneNumber', label: 'Phone Number' },
  { value: 'URL', label: 'URL' },
  { value: 'Rating', label: 'Rating' },
  { value: 'JSON', label: 'JSON' },
  { value: '_link', label: 'Link to Another Table' },
];

export function CreateFieldDialog({ open, onOpenChange }: CreateFieldDialogProps) {
  const [name, setName] = useState('');
  const [uiType, setUiType] = useState<UIType | '_link'>('SingleLineText');
  const [error, setError] = useState('');
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const { activeTableId } = useDatabaseUI();
  const createField = useCreateField();

  const handleTypeChange = (v: string) => {
    if (v === '_link') {
      // Close this dialog and open the link dialog
      onOpenChange(false);
      setLinkDialogOpen(true);
      return;
    }
    setUiType(v as UIType);
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
      });
      setName('');
      setUiType('SingleLineText');
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create field');
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Add Field</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="field-name" className="text-xs">Field Name</Label>
              <Input
                id="field-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Amount, Status"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Field Type</Label>
              <Select value={uiType} onValueChange={handleTypeChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.value === '_link' ? (
                        <span className="flex items-center gap-1.5">
                          <Link2 size={12} className="text-[#006994]" />
                          {opt.label}
                        </span>
                      ) : (
                        opt.label
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-[#006994] hover:bg-[#005a7d]"
              onClick={handleCreate}
              disabled={createField.isPending}
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
