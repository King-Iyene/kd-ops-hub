import { useEffect, useState } from 'react';
import { ExternalLink, Download, FileText, X, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResponsiveDialog } from '@/components/ui-kit/ResponsiveDialog';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface FilePreviewSource {
  /** Pre-built URL (used as-is if not a Supabase storage URL). */
  url?: string;
  /** Private-bucket source — preferred. A signed URL is generated at open time. */
  bucket?: string;
  path?: string;
}

interface FilePreviewTriggerProps extends FilePreviewSource {
  label?: string;
  fileName?: string;
  className?: string;
  variant?: 'button' | 'link';
}

/**
 * Inline file preview — opens images in a modal and PDFs in an iframe.
 *
 * Pass either:
 *   • `url`           — for fully-public URLs (e.g. external links).
 *   • `bucket`+`path` — for files stored in Supabase storage. Best option
 *                      for private buckets; a fresh signed URL is created
 *                      every time the preview is opened.
 *
 * If you pass a `url` that is itself a Supabase storage URL pointing at a
 * private bucket (e.g. an old `getPublicUrl()` result stored in the DB),
 * the component auto-detects the bucket + path from the URL and re-signs
 * it. This means existing rows don't need to be migrated.
 */
export function FilePreviewTrigger({
  url, bucket, path,
  label = 'View',
  fileName,
  className,
  variant = 'button',
}: FilePreviewTriggerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === 'button' ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn('text-xs h-8', className)}
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        >
          <FileText className="h-3.5 w-3.5 mr-1.5" />
          {label}
        </Button>
      ) : (
        <button
          type="button"
          className={cn('inline-flex items-center gap-1 text-xs text-primary hover:underline', className)}
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        >
          <FileText className="h-3.5 w-3.5" /> {label}
        </button>
      )}

      <FilePreviewDialog
        open={open}
        onOpenChange={setOpen}
        url={url}
        bucket={bucket}
        path={path}
        fileName={fileName}
      />
    </>
  );
}

interface FilePreviewDialogProps extends FilePreviewSource {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName?: string;
}

/**
 * Detects a Supabase storage URL and returns its bucket + decoded path.
 * Matches both /object/public/<bucket>/<path> and /object/sign/<bucket>/<path>.
 * Returns null if the URL is not a Supabase storage URL (e.g. external).
 */
function parseSupabaseStorageUrl(u: string): { bucket: string; path: string } | null {
  try {
    const m = u.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+?)(?:\?|$)/);
    if (!m) return null;
    return { bucket: m[1], path: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

export function FilePreviewDialog({
  open, onOpenChange,
  url, bucket, path,
  fileName,
}: FilePreviewDialogProps) {
  const [imgError, setImgError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setImgError(false);
    setLoading(true);
    setResolveError(null);
    setResolvedUrl(null);

    let cancelled = false;
    const run = async () => {
      // Priority 1: explicit bucket + path → always create a signed URL.
      // Priority 2: a stored Supabase storage URL → re-sign via parsed bucket/path.
      // Priority 3: external URL → use as-is.
      let target: { bucket: string; path: string } | null = null;
      if (bucket && path) {
        target = { bucket, path };
      } else if (url) {
        target = parseSupabaseStorageUrl(url);
      }

      if (target) {
        const { data, error } = await supabase.storage
          .from(target.bucket)
          .createSignedUrl(target.path, 60 * 5); // 5-minute window
        if (cancelled) return;
        if (error || !data?.signedUrl) {
          setResolveError(error?.message || 'Could not create preview link');
          setResolvedUrl(null);
        } else {
          setResolvedUrl(data.signedUrl);
        }
        return;
      }

      if (url) {
        setResolvedUrl(url);
      } else {
        setResolveError('No file source provided');
      }
    };
    run();
    return () => { cancelled = true; };
  }, [open, url, bucket, path]);

  // Best-effort type detection from whichever URL we have.
  const sourceForExt = (resolvedUrl || url || path || '').toLowerCase();
  const isImage = /\.(png|jpg|jpeg|gif|webp|avif|bmp|svg)(\?|$)/.test(sourceForExt);
  const isPdf = /\.pdf(\?|$)/.test(sourceForExt);
  const isOffice = /\.(doc|docx|xls|xlsx|ppt|pptx)(\?|$)/.test(sourceForExt);

  const displayName = fileName || (() => {
    const src = path || url || '';
    if (path) return path.split('/').pop() || 'file';
    try { return decodeURIComponent(new URL(src).pathname.split('/').pop() || 'file'); } catch { return 'file'; }
  })();

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setImgError(false);
          setLoading(true);
        }
      }}
      size="xl"
      title={
        <span className="flex items-center gap-2 truncate">
          <FileText className="h-5 w-5 text-primary shrink-0" />
          <span className="truncate">{displayName}</span>
        </span>
      }
      footer={
        <div className="flex gap-2 w-full sm:w-auto sm:ml-auto">
          <Button asChild variant="outline" size="sm" className="flex-1 sm:flex-initial" disabled={!resolvedUrl}>
            <a href={resolvedUrl || '#'} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-1.5" /> Open in new tab
            </a>
          </Button>
          <Button asChild size="sm" className="flex-1 sm:flex-initial" disabled={!resolvedUrl}>
            <a href={resolvedUrl || '#'} download={displayName}>
              <Download className="h-4 w-4 mr-1.5" /> Download
            </a>
          </Button>
        </div>
      }
    >
      <div className="flex items-center justify-center min-h-[300px] bg-muted/30 rounded-md overflow-hidden relative">
        {!resolvedUrl && !resolveError ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : resolveError ? (
          <div className="text-center py-12 px-6 max-w-md">
            <AlertCircle className="h-10 w-10 text-warning mx-auto mb-3" />
            <p className="font-semibold mb-1">Preview unavailable</p>
            <p className="text-sm text-muted-foreground">{resolveError}</p>
          </div>
        ) : isImage && !imgError ? (
          <>
            {loading && <Loader2 className="absolute h-6 w-6 animate-spin text-muted-foreground" />}
            <img
              src={resolvedUrl!}
              alt={displayName}
              className="max-h-[70vh] max-w-full object-contain"
              onLoad={() => setLoading(false)}
              onError={() => { setImgError(true); setLoading(false); }}
            />
          </>
        ) : isPdf ? (
          <iframe src={resolvedUrl!} title={displayName} className="w-full h-[70vh] border-0" />
        ) : (
          <div className="text-center py-12 px-6 max-w-md">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              {imgError ? <AlertCircle className="h-6 w-6 text-warning" /> : <FileText className="h-6 w-6 text-muted-foreground" />}
            </div>
            <p className="font-semibold mb-1">
              {imgError ? 'Preview unavailable' : isOffice ? 'Office document' : 'No inline preview'}
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              {imgError
                ? 'The file may have been moved or the link is no longer valid.'
                : 'This file type cannot be previewed in the browser. Use the buttons below to open or download it.'}
            </p>
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}
