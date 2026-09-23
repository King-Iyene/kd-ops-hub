import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';

export function FieldError({ message, className }: { message?: string; className?: string }) {
  if (!message) return null;
  return (
    <p className={cn('text-2xs font-medium text-destructive mt-1', className)} role="alert">
      {message}
    </p>
  );
}

type Errors<T extends string> = Partial<Record<T, string>>;

// eslint-disable-next-line react-refresh/only-export-components
export function useFieldErrors<T extends string>() {
  const [errors, setErrors] = useState<Errors<T>>({});

  const setError = (field: T, message: string) =>
    setErrors(prev => ({ ...prev, [field]: message }));

  const clearError = (field: T) =>
    setErrors(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });

  const clearAll = useCallback(
    () => setErrors(prev => (Object.keys(prev).length === 0 ? prev : {})),
    [],
  );

  const hasErrors = Object.keys(errors).length > 0;

  return { errors, setError, clearError, clearAll, hasErrors, setErrors };
}
