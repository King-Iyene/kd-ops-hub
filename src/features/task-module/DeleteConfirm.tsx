import { useState, type ReactNode } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * The one "are you sure?" every delete in the Task module goes through, so nothing is removed by one stray click.
 * It says what is about to be deleted and what goes with it, and the red button names the thing ("Delete checklist").
 * The dialog is rendered by the component that asks (put `{dialog}` in its output), which keeps it inside any open
 * task window instead of fighting it for focus.
 *
 *   const { ask, dialog } = useDeleteConfirm();
 *   ask({ what: 'comment', consequence: 'It is removed for everyone.', onConfirm: () => remove.mutate(id) });
 *   return <>...{dialog}</>;
 */
export interface DeleteRequest {
  /** What it is, in lower case: "checklist", "field", "file". */
  what: string;
  /** Its name, when it has one. Shown in quotes. */
  name?: string;
  /** What else goes with it, as a sentence: "Its 4 items are deleted too." */
  consequence: string;
  /** Say "This cannot be undone." (default). Turn off only where it really can be undone. */
  permanent?: boolean;
  onConfirm: () => void;
}

export function deleteTitle(r: Pick<DeleteRequest, 'what' | 'name'>): string {
  return `Delete ${r.what}${r.name ? ` "${r.name}"` : ''}?`;
}

export function useDeleteConfirm(): { ask: (r: DeleteRequest) => void; dialog: ReactNode } {
  const [req, setReq] = useState<DeleteRequest | null>(null);
  const dialog = (
    <AlertDialog open={!!req} onOpenChange={(open) => { if (!open) setReq(null); }}>
      {req && (
        <AlertDialogContent data-testid="delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTitle(req)}</AlertDialogTitle>
            <AlertDialogDescription>
              {req.consequence}{req.permanent === false ? '' : ' This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { const r = req; setReq(null); r.onConfirm(); }}
            >
              Delete {req.what}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
  return { ask: setReq, dialog };
}
