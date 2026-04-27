// Centralised file-size guard for any <input type="file"> handler.
// Default cap is 10 MB which mirrors the Documents page and matches the
// Supabase Storage tier we're paying for; bump per call if a specific
// flow truly needs more (e.g. annual financial PDFs).
//
// Usage:
//   if (!validateFileSize(file, toast)) return;

import type { useToast } from '@/hooks/use-toast';

export const DEFAULT_MAX_MB = 10;

type ToastFn = ReturnType<typeof useToast>['toast'];

export function validateFileSize(
  file: File | null | undefined,
  toast: ToastFn,
  maxMB: number = DEFAULT_MAX_MB,
): boolean {
  if (!file) return true;
  const maxBytes = maxMB * 1024 * 1024;
  if (file.size > maxBytes) {
    toast({
      title: 'File too large',
      description: `Max ${maxMB} MB per file. Your file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`,
      variant: 'destructive',
    });
    return false;
  }
  return true;
}
