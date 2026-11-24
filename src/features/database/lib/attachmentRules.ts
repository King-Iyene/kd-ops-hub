/**
 * Limits for an attachment field: how many files, how big, which kinds.
 * Pure, so the rules can be tested without uploading anything.
 */

export type AttachmentKind = 'images' | 'documents' | 'spreadsheets' | 'presentations' | 'archives' | 'video' | 'audio';

export const ATTACHMENT_KINDS: { value: AttachmentKind; label: string }[] = [
  { value: 'images', label: 'Images' },
  { value: 'documents', label: 'Documents (PDF, Word, text)' },
  { value: 'spreadsheets', label: 'Spreadsheets (Excel, CSV)' },
  { value: 'presentations', label: 'Presentations' },
  { value: 'archives', label: 'Zip and archives' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
];

/** Hard ceiling, whatever the field says (the storage bucket limit). */
export const MAX_FILE_MB = 50;

export interface AttachmentLimits {
  /** Most files one cell may hold. Empty means no limit. */
  maxCount?: number | null;
  /** Largest single file in megabytes (never above MAX_FILE_MB). */
  maxSizeMB?: number | null;
  /** Kinds that are allowed. Empty or missing means any kind. */
  allowedTypes?: string[] | null;
}

export interface FileLike {
  name: string;
  size: number;
  type: string;
}

const EXTENSIONS: Record<AttachmentKind, string[]> = {
  images: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic', 'avif'],
  documents: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'md', 'json'],
  spreadsheets: ['xls', 'xlsx', 'csv', 'ods'],
  presentations: ['ppt', 'pptx', 'odp', 'key'],
  archives: ['zip', 'rar', '7z', 'tar', 'gz'],
  video: ['mp4', 'mov', 'avi', 'mkv', 'webm'],
  audio: ['mp3', 'wav', 'm4a', 'ogg', 'flac'],
};

function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

export function kindOf(file: Pick<FileLike, 'name' | 'type'>): AttachmentKind | null {
  const type = (file.type || '').toLowerCase();
  const ext = extensionOf(file.name);
  if (type.startsWith('image/') || EXTENSIONS.images.includes(ext)) return 'images';
  if (type.startsWith('video/') || EXTENSIONS.video.includes(ext)) return 'video';
  if (type.startsWith('audio/') || EXTENSIONS.audio.includes(ext)) return 'audio';
  if (EXTENSIONS.spreadsheets.includes(ext) || type.includes('spreadsheet') || type.includes('excel') || type === 'text/csv') return 'spreadsheets';
  if (EXTENSIONS.presentations.includes(ext) || type.includes('presentation') || type.includes('powerpoint')) return 'presentations';
  if (EXTENSIONS.archives.includes(ext) || type.includes('zip') || type.includes('archive')) return 'archives';
  if (EXTENSIONS.documents.includes(ext) || type === 'application/pdf' || type.startsWith('text/') || type.includes('word') || type === 'application/json') return 'documents';
  return null;
}

export interface Rejection {
  name: string;
  reason: string;
}

/**
 * Splits dropped files into the ones to upload and the ones to refuse, with a plain reason for each.
 * `existingCount` is how many files the cell already holds.
 */
export function checkFiles<T extends FileLike>(
  files: readonly T[],
  existingCount: number,
  limits: AttachmentLimits | null | undefined,
): { accepted: T[]; rejected: Rejection[] } {
  const maxCount = limits?.maxCount && limits.maxCount > 0 ? Math.floor(limits.maxCount) : null;
  const maxMB = Math.min(MAX_FILE_MB, limits?.maxSizeMB && limits.maxSizeMB > 0 ? limits.maxSizeMB : MAX_FILE_MB);
  const allowed = (limits?.allowedTypes ?? []).filter(Boolean);

  const accepted: T[] = [];
  const rejected: Rejection[] = [];
  for (const file of files) {
    if (file.size > maxMB * 1024 * 1024) {
      rejected.push({ name: file.name, reason: `larger than ${maxMB} MB` });
      continue;
    }
    if (allowed.length > 0) {
      const kind = kindOf(file);
      if (!kind || !allowed.includes(kind)) {
        rejected.push({ name: file.name, reason: 'this kind of file is not allowed in this field' });
        continue;
      }
    }
    if (maxCount !== null && existingCount + accepted.length >= maxCount) {
      rejected.push({ name: file.name, reason: `this cell can hold at most ${maxCount} file${maxCount === 1 ? '' : 's'}` });
      continue;
    }
    accepted.push(file);
  }
  return { accepted, rejected };
}

/** The value for the file picker's `accept` attribute for these limits. */
export function acceptAttribute(limits: AttachmentLimits | null | undefined, fallback: string): string {
  const allowed = (limits?.allowedTypes ?? []).filter((k): k is AttachmentKind => k in EXTENSIONS);
  if (allowed.length === 0) return fallback;
  return allowed.flatMap((k) => (k === 'images' ? ['image/*'] : EXTENSIONS[k].map((e) => `.${e}`))).join(',');
}

// ---------------------------------------------------------------------------
// Field settings <-> options (used by the field dialogs)
// ---------------------------------------------------------------------------

export interface AttachmentSettings {
  maxCount: string;
  maxSizeMB: string;
  allowedTypes: AttachmentKind[];
}

export const DEFAULT_ATTACHMENT_SETTINGS: AttachmentSettings = { maxCount: '', maxSizeMB: '', allowedTypes: [] };

export function attachmentSettingsFromOptions(options: Record<string, unknown> | null | undefined): AttachmentSettings {
  const o = options ?? {};
  const kinds = Array.isArray(o.allowedTypes)
    ? (o.allowedTypes as string[]).filter((k): k is AttachmentKind => ATTACHMENT_KINDS.some((x) => x.value === k))
    : [];
  return {
    maxCount: typeof o.maxCount === 'number' && o.maxCount > 0 ? String(o.maxCount) : '',
    maxSizeMB: typeof o.maxSizeMB === 'number' && o.maxSizeMB > 0 ? String(o.maxSizeMB) : '',
    allowedTypes: kinds,
  };
}

/** Writes the limits into a copy of the options; empty limits remove their keys. */
export function applyAttachmentSettings(
  options: Record<string, unknown> | null | undefined,
  s: AttachmentSettings,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(options ?? {}) };
  delete next.maxCount;
  delete next.maxSizeMB;
  delete next.allowedTypes;
  const count = Math.floor(Number(s.maxCount));
  if (s.maxCount.trim() !== '' && Number.isFinite(count) && count > 0) next.maxCount = count;
  const size = Number(s.maxSizeMB);
  if (s.maxSizeMB.trim() !== '' && Number.isFinite(size) && size > 0) next.maxSizeMB = Math.min(MAX_FILE_MB, size);
  if (s.allowedTypes.length > 0) next.allowedTypes = s.allowedTypes;
  return next;
}
