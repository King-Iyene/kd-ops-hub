import { useState } from 'react';
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

  const clearAll = () => setErrors({});

  const hasErrors = Object.keys(errors).length > 0;

  return { errors, setError, clearError, clearAll, hasErrors, setErrors };
}
