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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateLink } from '../hooks';
import { useTables } from '../hooks';
import { useDatabaseUI } from '../lib/store';

interface CreateLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const RELATIONSHIP_OPTIONS = [
  { value: 'one_to_many', label: 'Has Many' },
  { value: 'many_to_many', label: 'Many to Many' },
  { value: 'one_to_one', label: 'Belongs To' },
] as const;

type RelationType = 'one_to_one' | 'one_to_many' | 'many_to_many';

export function CreateLinkDialog({ open, onOpenChange }: CreateLinkDialogProps) {
  const [linkName, setLinkName] = useState('');
  const [relatedTableId, setRelatedTableId] = useState('');
  const [relType, setRelType] = useState<RelationType>('one_to_many');
  const [error, setError] = useState('');

  const { activeTableId, activeBaseId } = useDatabaseUI();
  const { data: tables = [] } = useTables(activeBaseId);
  const createLink = useCreateLink();

  // Filter out the current table and any junction tables
  const availableTables = tables.filter(
    (t) => t.id !== activeTableId && !t.name.endsWith('_mm'),
  );

  const handleCreate = async () => {
    if (!linkName.trim()) {
      setError('Link name is required');
      return;
    }
    if (!relatedTableId) {
      setError('Please select a related table');
      return;
    }
    if (!activeTableId || !activeBaseId) {
      setError('No table selected');
      return;
    }
    setError('');
    try {
      await createLink.mutateAsync({
        base_id: activeBaseId,
        table_id: activeTableId,
        field_name: linkName.trim(),
        target_table_id: relatedTableId,
        relation_type: relType,
      });
      setLinkName('');
      setRelatedTableId('');
      setRelType('one_to_many');
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create link');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">Link to Another Table</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="link-name" className="text-xs">
              Link Name
            </Label>
            <Input
              id="link-name"
              value={linkName}
              onChange={(e) => setLinkName(e.target.value)}
              placeholder="e.g. Projects, Assigned Tasks"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Related Table</Label>
            <Select value={relatedTableId} onValueChange={setRelatedTableId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a table..." />
              </SelectTrigger>
              <SelectContent>
                {availableTables.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.icon ? `${t.icon} ` : ''}
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Relationship Type</Label>
            <Select
              value={relType}
              onValueChange={(v) => setRelType(v as RelationType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RELATIONSHIP_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-[#9AA2AF]">
              {relType === 'one_to_many' && 'One record here links to many records in the related table.'}
              {relType === 'one_to_one' && 'Each record here belongs to one record in the related table.'}
              {relType === 'many_to_many' && 'Records on both sides can link to many records. A junction table is created.'}
            </p>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="hover:opacity-90 text-white"
            style={{ backgroundColor: '#3366FF' }}
            onClick={handleCreate}
            disabled={createLink.isPending}
          >
            {createLink.isPending ? 'Creating...' : 'Create Link'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
