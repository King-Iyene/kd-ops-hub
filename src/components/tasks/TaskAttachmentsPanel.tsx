import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Download, Eye, FileText, Loader2, Paperclip, Plus, Trash2, Upload,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { confirm } from '@/hooks/use-confirm';

const BUCKET = 'task-attachments';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

interface TaskAttachmentsPanelProps {
  taskId: string;
  onUpdate: () => void;
}

interface StorageFile {
  name: string;
  id: string | null;
  created_at: string;
  metadata: { size?: number; mimetype?: string } | null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageMime(mime: string | undefined): boolean {
  return !!mime && mime.startsWith('image/');
}

export function TaskAttachmentsPanel({ taskId, onUpdate }: TaskAttachmentsPanelProps) {
  const profile = useAuthStore((s) => s.profile);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // ── Load attachments ────────────────────────────────────────────────
  const loadFiles = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(taskId, { sortBy: { column: 'created_at', order: 'desc' } });

    if (error) {
      toast({ title: 'Failed to load attachments', description: error.message, variant: 'destructive' });
      setFiles([]);
    } else {
      setFiles((data as StorageFile[]) || []);
    }
    setLoading(false);
  }, [taskId, toast]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  // ── Upload ──────────────────────────────────────────────────────────
  const uploadFiles = async (incoming: FileList | File[]) => {
    const fileArray = Array.from(incoming);
    if (fileArray.length === 0) return;

    for (const file of fileArray) {
      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: 'File too large',
          description: `"${file.name}" exceeds the 10 MB limit.`,
          variant: 'destructive',
        });
        return;
      }
    }

    setUploading(true);
    let uploadedCount = 0;

    for (const file of fileArray) {
      const path = `${taskId}/${file.name}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: true,
      });

      if (error) {
        toast({
          title: 'Upload failed',
          description: `${file.name}: ${error.message}`,
          variant: 'destructive',
        });
      } else {
        uploadedCount++;
      }
    }

    if (uploadedCount > 0) {
      toast({ title: `${uploadedCount} file${uploadedCount > 1 ? 's' : ''} uploaded` });
      await logAudit('task_attachment_uploaded', `Uploaded ${uploadedCount} attachment(s) to task`, profile, { taskId });
      loadFiles();
      onUpdate();
    }

    setUploading(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      uploadFiles(e.target.files);
      e.target.value = '';
    }
  };

  // ── Drag-and-drop ──────────────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  };

  // ── Preview / Download ─────────────────────────────────────────────
  const getPublicUrl = (fileName: string): string => {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(`${taskId}/${fileName}`);
    return data.publicUrl;
  };

  const handlePreview = (fileName: string) => {
    window.open(getPublicUrl(fileName), '_blank');
  };

  const handleDownload = (fileName: string) => {
    const url = getPublicUrl(fileName);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ── Delete ─────────────────────────────────────────────────────────
  const handleDelete = async (fileName: string) => {
    if (!(await confirm({ title: 'Delete attachment?', description: `Delete "${fileName}"?`, variant: 'destructive' }))) return;

    setDeletingId(fileName);
    const { error } = await supabase.storage.from(BUCKET).remove([`${taskId}/${fileName}`]);

    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Attachment deleted' });
      await logAudit('task_attachment_deleted', `Deleted attachment "${fileName}" from task`, profile, { taskId, fileName });
      loadFiles();
      onUpdate();
    }
    setDeletingId(null);
  };

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Attachments
          </p>
          {files.length > 0 && (
            <span className="text-[10px] text-muted-foreground">({files.length})</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={handleFileChange}
        />
      </div>

      {/* Drop zone */}
      <div
        className={cn(
          'border border-dashed rounded-md p-3 text-center transition-colors cursor-pointer',
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-muted-foreground/40',
        )}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Uploading...</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1.5">
            <Upload className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">
              Drop files here or click to upload
            </span>
          </div>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* File list */}
      {!loading && files.length === 0 && (
        <p className="text-[10px] text-muted-foreground">No attachments</p>
      )}

      {!loading && files.length > 0 && (
        <div className="space-y-1">
          {files.map((file) => {
            const size = file.metadata?.size;
            const mime = file.metadata?.mimetype;
            const isImage = isImageMime(mime);
            const isDeleting = deletingId === file.name;

            return (
              <div
                key={file.name}
                className="group flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-muted/50"
              >
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs truncate">{file.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {size != null && formatFileSize(size)}
                    {size != null && file.created_at && ' · '}
                    {file.created_at && new Date(file.created_at).toLocaleDateString()}
                  </p>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isImage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      title="Preview"
                      onClick={() => handlePreview(file.name)}
                    >
                      <Eye className="h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    title="Download"
                    onClick={() => handleDownload(file.name)}
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    title="Delete"
                    disabled={isDeleting}
                    onClick={() => handleDelete(file.name)}
                  >
                    {isDeleting
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Trash2 className="h-3 w-3 text-destructive" />}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
