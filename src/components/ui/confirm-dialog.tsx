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
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useConfirmState } from '@/hooks/use-confirm';

// Single host, mounted once at the app root (next to <Toaster />), backing
// the imperative confirm() from use-confirm.ts.
export function ConfirmDialogHost() {
  const { request } = useConfirmState();

  return (
    <AlertDialog open={!!request} onOpenChange={(open) => { if (!open) request?.resolve(false); }}>
      {request && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{request.title || 'Are you sure?'}</AlertDialogTitle>
            <AlertDialogDescription>{request.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => request.resolve(false)}>
              {request.cancelLabel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => request.resolve(true)}
              className={cn(request.variant === 'destructive' && buttonVariants({ variant: 'destructive' }))}
            >
              {request.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
