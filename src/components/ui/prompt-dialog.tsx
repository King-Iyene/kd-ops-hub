import { useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePromptState } from '@/hooks/use-prompt';

export function PromptDialogHost() {
  const { request } = usePromptState();
  const [value, setValue] = useState('');

  const handleOpen = (open: boolean) => {
    if (!open) {
      request?.resolve(null);
      setValue('');
    }
  };

  const handleSubmit = () => {
    if (request?.minLength && value.trim().length < request.minLength) return;
    request?.resolve(value.trim());
    setValue('');
  };

  const isValid = !request?.minLength || value.trim().length >= (request.minLength ?? 0);

  return (
    <AlertDialog open={!!request} onOpenChange={handleOpen}>
      {request && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{request.title || 'Enter a value'}</AlertDialogTitle>
            <AlertDialogDescription>{request.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            autoFocus
            placeholder={request.placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isValid) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { request.resolve(null); setValue(''); }}>
              {request.cancelLabel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSubmit}
              disabled={!isValid}
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
