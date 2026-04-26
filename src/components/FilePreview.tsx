import { useState } from 'react';
import { ExternalLink, Download, FileText, X, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResponsiveDialog } from '@/components/ui-kit/ResponsiveDialog';
import { cn } from '@/lib/utils';

interface FilePreviewTriggerProps {
  url: string;
  /** Visible label inside the trigger button */
  label?: string;
  /** Filename used for the dialog title and download */
  fileName?: string;
  className?: string;
  variant?: 'button' | 'link';
}

/**
 * Inline file preview — opens images in a modal and PDFs in an iframe.
 * Anything else falls back to a download link instead of letting the browser
 * dump JSON / raw bytes onto a black page.
 */
export function FilePreviewTrigger({
  url,
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
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
        >
          <FileText className="h-3.5 w-3.5 mr-1.5" />
          {label}
        </Button>
      ) : (
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1 text-xs text-primary hover:underline',
            className,
          )}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
        >
          <FileText className="h-3.5 w-3.5" /> {label}
        </button>
      )}

      <FilePreviewDialog
        open={open}
        onOpenChange={setOpen}
        url={url}
        fileName={fileName}
      />
    </>
  );
}

interface FilePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  fileName?: string;
}

export function FilePreviewDialog({
  open,
  onOpenChange,
  url,
  fileName,
}: FilePreviewDialogProps) {
  const [imgError, setImgError] = useState(false);
  const [loading, setLoading] = useState(true);

  // Best-effort type detection from the URL extension
  const lower = (url || '').toLowerCase();
  const isImage = /\.(png|jpg|jpeg|gif|webp|avif|bmp|svg)(\?|$)/.test(lower);
  const isPdf = /\.pdf(\?|$)/.test(lower);
  const isOffice = /\.(doc|docx|xls|xlsx|ppt|pptx)(\?|$)/.test(lower);

  const displayName = fileName || (() => {
    try {
      const u = new URL(url);
      return decodeURIComponent(u.pathname.split('/').pop() || 'file');
    } catch {
      return 'file';
    }
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
          <Button
            asChild
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-initial"
          >
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-1.5" /> Open in new tab
            </a>
          </Button>
          <Button
            asChild
            size="sm"
            className="flex-1 sm:flex-initial"
          >
            <a href={url} download={displayName}>
              <Download className="h-4 w-4 mr-1.5" /> Download
            </a>
          </Button>
        </div>
      }
    >
      <div className="flex items-center justify-center min-h-[300px] bg-muted/30 rounded-md overflow-hidden relative">
        {isImage && !imgError ? (
          <>
            {loading && (
              <Loader2 className="absolute h-6 w-6 animate-spin text-muted-foreground" />
            )}
            <img
              src={url}
              alt={displayName}
              className="max-h-[70vh] max-w-full object-contain"
              onLoad={() => setLoading(false)}
              onError={() => {
                setImgError(true);
                setLoading(false);
              }}
            />
          </>
        ) : isPdf ? (
          <iframe
            src={url}
            title={displayName}
            className="w-full h-[70vh] border-0"
          />
        ) : (
          <div className="text-center py-12 px-6 max-w-md">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              {imgError ? (
                <AlertCircle className="h-6 w-6 text-warning" />
              ) : (
                <FileText className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <p className="font-semibold mb-1">
              {imgError
                ? 'Preview unavailable'
                : isOffice
                ? 'Office document'
                : 'No inline preview'}
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
