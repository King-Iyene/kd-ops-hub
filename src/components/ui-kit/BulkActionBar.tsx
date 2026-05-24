/**
 * BulkActionBar — sticky toolbar for batch operations on tables.
 *
 * Pattern: select rows via checkboxes, the bar slides up from the
 * bottom of the visible viewport with a count + actions. The
 * primary action is usually "Delete selected", with optional
 * secondary actions (Export, Tag, Move, Archive…).
 *
 * Typical usage:
 *
 *   const [selected, setSelected] = useState<Set<string>>(new Set());
 *
 *   <BulkActionBar
 *     count={selected.size}
 *     onClear={() => setSelected(new Set())}
 *     onDelete={async () => {
 *       await supabase.from('contractors').delete().in('id', [...selected]);
 *       setSelected(new Set());
 *       toast({ title: `${selected.size} deleted` });
 *     }}
 *     deleteLabel="Delete contractors"
 *     deleteConfirmTitle="Delete selected contractors?"
 *     deleteConfirmDescription="This cannot be undone."
 *   />
 *
 * Renders nothing when count === 0 so callers don't need to wrap.
 * Built-in confirmation dialog on delete so each consumer doesn't
 * have to wire its own AlertDialog. Optional `extraActions` slot
 * lets pages add module-specific bulk operations.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

interface Props {
  count: number;
  onClear: () => void;
  onDelete?: () => Promise<void> | void;
  deleteLabel?: string;
  deleteConfirmTitle?: string;
  deleteConfirmDescription?: string;
  /** Additional actions rendered to the LEFT of Delete. */
  extraActions?: React.ReactNode;
  className?: string;
}

export function BulkActionBar({
  count,
  onClear,
  onDelete,
  deleteLabel = 'Delete selected',
  deleteConfirmTitle = 'Delete selected items?',
  deleteConfirmDescription = 'This cannot be undone.',
  extraActions,
  className,
}: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (count === 0) return null;

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete();
      setConfirmOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {createPortal(
        <div
          className={cn(
            // Pinned to the bottom of the viewport on every breakpoint
            // since this is a contextual selection toolbar — operators
            // expect it to follow them as they scroll the list. Above
            // the mobile bottom nav (h-14) so it doesn't get covered.
            // Portaled to <body> so an ancestor `transform` (the
            // page-transition wrapper keeps a non-`none` transform) can't
            // capture this `fixed` element and strand it off-screen.
            'fixed inset-x-0 bottom-14 md:bottom-4 z-40 flex justify-center px-4 pointer-events-none',
            className,
          )}
        >
          <div className="pointer-events-auto bg-card border border-border shadow-2xl rounded-full pl-4 pr-2 py-2 flex items-center gap-3 max-w-full kd-animate-slide-up">
            <span className="text-sm font-semibold tabular-nums">
              {count}
            </span>
            <span className="text-sm text-muted-foreground">
              selected
            </span>
            <button
              type="button"
              onClick={onClear}
              className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground kd-transition"
              aria-label="Clear selection"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <span className="h-5 w-px bg-border mx-1" aria-hidden />
            {extraActions}
            {onDelete && (
              <Button
                variant="destructive"
                size="sm"
                className="h-8 rounded-full"
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete
              </Button>
            )}
          </div>
        </div>,
        document.body,
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirmDescription}{' '}
              <span className="font-semibold text-foreground">{count} item{count === 1 ? '' : 's'}</span>{' '}
              will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {deleteLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
