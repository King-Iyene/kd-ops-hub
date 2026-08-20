import { useState } from 'react';
import { Loader2, Bookmark } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface SaveFilterViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module: string;
  currentFilters: {
    heyreachFilter: string;
    emailFilter: string;
    linkFilter: string;
    advMatch: 'all' | 'any';
    advRules: { field: string; op: string; value: string }[];
  };
  onSaved: () => void;
}

export function SaveFilterViewDialog({ open, onOpenChange, module, currentFilters, onSaved }: SaveFilterViewDialogProps) {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const [saveViewName, setSaveViewName] = useState('');
  const [saveViewShared, setSaveViewShared] = useState(false);
  const [savingView, setSavingView] = useState(false);

  const handleClose = () => {
    onOpenChange(false);
    setSaveViewName('');
    setSaveViewShared(false);
  };

  const saveCurrentView = async () => {
    const name = saveViewName.trim();
    if (!name || !profile?.id) return;
    setSavingView(true);
    const payload = {
      user_id: profile.id,
      module,
      name,
      shared: saveViewShared,
      filters: currentFilters,
    };
    const { error } = await supabase.from('saved_filters').insert(payload as never);
    setSavingView(false);
    if (error) {
      toast({
        title: 'Could not save view',
        description: /duplicate|unique/i.test(error.message)
          ? 'You already have a view with that name.'
          : error.message,
        variant: 'destructive',
      });
      return;
    }
    toast({ title: 'View saved', description: saveViewShared ? 'Shared with your team.' : undefined });
    handleClose();
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Save filter view</DialogTitle>
          <DialogDescription>
            Save the current filters as a reusable view you can re-apply in one click.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>View name</Label>
            <Input
              value={saveViewName}
              onChange={(e) => setSaveViewName(e.target.value)}
              placeholder="e.g. No LinkedIn email"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') saveCurrentView(); }}
            />
          </div>
          <label className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 cursor-pointer">
            <Checkbox checked={saveViewShared} onCheckedChange={(v) => setSaveViewShared(Boolean(v))} className="mt-0.5" />
            <span className="text-sm leading-snug">
              Share with team
              <span className="block text-[11px] text-muted-foreground">
                Everyone can apply it; only you can edit or delete it.
              </span>
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={savingView}>Cancel</Button>
          <Button onClick={saveCurrentView} disabled={savingView || !saveViewName.trim()}>
            {savingView ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bookmark className="mr-2 h-4 w-4" />}
            Save view
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
