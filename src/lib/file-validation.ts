// Centralised file-size guard for any <input type="file"> handler.
// Default cap is 10 MB which mirrors the Documents page and matches the
// Supabase Storage tier we're paying for; bump per call if a specific
// flow truly needs more (e.g. annual financial PDFs).
//
// Usage:
//   if (!validateFile(file, toast)) return;

import type { useToast } from '@/hooks/use-toast';

export const DEFAULT_MAX_MB = 10;

type ToastFn = ReturnType<typeof useToast>['toast'];

const BLOCKED_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'pif',
  'vbs', 'vbe', 'js',  'jse', 'ws',  'wsf', 'wsc', 'wsh',
  'ps1', 'ps2', 'psc1','psc2',
  'sh',  'bash','csh', 'ksh',
  'app', 'action', 'command',
  'dll', 'sys', 'drv',
  'inf', 'reg', 'rgs',
  'hta', 'cpl', 'msp', 'mst',
  'jar', 'war',
  'lnk', 'url', 'desktop',
]);

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

export function validateFileType(
  file: File | null | undefined,
  toast: ToastFn,
): boolean {
  if (!file) return true;
  const ext = getExtension(file.name);
  if (ext && BLOCKED_EXTENSIONS.has(ext)) {
    toast({
      title: 'File type not allowed',
      description: `".${ext}" files are blocked for security reasons.`,
      variant: 'destructive',
    });
    return false;
  }
  return true;
}

export function validateFile(
  file: File | null | undefined,
  toast: ToastFn,
  maxMB: number = DEFAULT_MAX_MB,
): boolean {
  return validateFileType(file, toast) && validateFileSize(file, toast, maxMB);
}

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
