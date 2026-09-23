import { useCallback, useState } from 'react';

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

  const clearAll = useCallback(
    () => setErrors(prev => (Object.keys(prev).length === 0 ? prev : {})),
    [],
  );

  const hasErrors = Object.keys(errors).length > 0;

  return { errors, setError, clearError, clearAll, hasErrors, setErrors };
}
