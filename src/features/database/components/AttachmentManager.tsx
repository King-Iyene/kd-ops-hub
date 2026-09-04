import React, { useState, useRef, useCallback } from 'react';
import { X, Upload, Trash2, FileText, File, Image as ImageIcon, Paperclip } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export interface AttachmentMeta {
  name: string;
  url: string;
  size: number;
  type: string;
  uploaded_at: string;
}

interface AttachmentManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: AttachmentMeta[];
  onCommit: (attachments: AttachmentMeta[]) => void;
  storagePath: string; // e.g. "base_id/table_id/record_id/field_id"
}

const ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.pptx,.ppt,.zip,.json';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type: string) {
  if (type.startsWith('image/')) return ImageIcon;
  if (type === 'application/pdf') return FileText;
  return File;
}

export function AttachmentManager({
  open,
  onOpenChange,
  value,
  onCommit,
  storagePath,
}: AttachmentManagerProps) {
  const [attachments, setAttachments] = useState<AttachmentMeta[]>(value ?? []);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      setUploading(true);
      const newAttachments: AttachmentMeta[] = [];
      for (const file of Array.from(files)) {
        const ts = Date.now();
        const path = `${storagePath}/${ts}_${file.name}`;
        const { error } = await supabase.storage
          .from('attachments')
          .upload(path, file, { upsert: false });
        if (error) {
          console.error('Upload failed:', error.message);
          continue;
        }
        const { data: urlData } = supabase.storage
          .from('attachments')
          .getPublicUrl(path);
        newAttachments.push({
          name: file.name,
          url: urlData.publicUrl,
          size: file.size,
          type: file.type,
          uploaded_at: new Date().toISOString(),
        });
      }
      const updated = [...attachments, ...newAttachments];
      setAttachments(updated);
      onCommit(updated);
      setUploading(false);
    },
    [attachments, onCommit, storagePath],
  );

  const handleDelete = useCallback(
    async (index: number) => {
      const att = attachments[index];
      // Try to extract storage path from URL
      try {
        const urlObj = new URL(att.url);
        const prefix = '/storage/v1/object/public/attachments/';
        const idx = urlObj.pathname.indexOf(prefix);
        if (idx !== -1) {
          const filePath = decodeURIComponent(urlObj.pathname.slice(idx + prefix.length));
          await supabase.storage.from('attachments').remove([filePath]);
        }
      } catch {
        // best-effort delete
      }
      const updated = attachments.filter((_, i) => i !== index);
      setAttachments(updated);
      onCommit(updated);
    },
    [attachments, onCommit],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        uploadFiles(e.dataTransfer.files);
      }
    },
    [uploadFiles],
  );

  if (!open) return null;

  return (
    <>
      {/* Modal backdrop */}
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="absolute inset-0 bg-black/30"
          onClick={() => onOpenChange(false)}
        />
        <div className="relative bg-white dark:bg-[hsl(200,30%,10%)] rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]">
            <div className="flex items-center gap-2">
              <Paperclip size={14} className="text-[#6A7184]" />
              <h2 className="text-sm font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">
                Attachments
              </h2>
              {attachments.length > 0 && (
                <span className="text-xs text-[#9AA2AF]">({attachments.length})</span>
              )}
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-white/5"
            >
              <X size={16} className="text-[#6A7184]" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Drop zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 py-8 rounded-lg cursor-pointer transition-colors"
              style={{
                border: `2px dashed ${dragOver ? '#166EE1' : '#E5E5E5'}`,
                backgroundColor: dragOver ? 'rgba(51,102,255,0.04)' : 'transparent',
              }}
            >
              <Upload size={24} className={dragOver ? 'text-[#166EE1]' : 'text-[#9AA2AF]'} />
              <span className="text-sm text-[#6A7184]">
                {uploading ? 'Uploading...' : 'Drop files here or click to upload'}
              </span>
            </div>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  uploadFiles(e.target.files);
                  e.target.value = '';
                }
              }}
            />

            {/* Attachment grid */}
            {attachments.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {attachments.map((att, i) => {
                  const isImage = att.type?.startsWith('image/');
                  const Icon = fileIcon(att.type);
                  return (
                    <div
                      key={i}
                      className="relative group rounded-lg border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] overflow-hidden bg-[#FAFAFA] dark:bg-[hsl(200,30%,12%)]"
                    >
                      {/* Preview area */}
                      <div
                        className="h-28 flex items-center justify-center cursor-pointer"
                        onClick={() => isImage ? setLightbox(att.url) : window.open(att.url, '_blank')}
                      >
                        {isImage ? (
                          <img
                            src={att.url}
                            alt={att.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Icon size={32} className="text-[#9AA2AF]" />
                        )}
                      </div>
                      {/* Info */}
                      <div className="px-2 py-1.5 border-t border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]">
                        <p className="text-xs text-[#374151] dark:text-[hsl(200,25%,88%)] truncate">
                          {att.name}
                        </p>
                        <p className="text-[10px] text-[#9AA2AF]">{formatSize(att.size)}</p>
                      </div>
                      {/* Delete button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(i);
                        }}
                        className="absolute top-1.5 right-1.5 p-1 rounded bg-white/80 dark:bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 dark:hover:bg-red-900/30"
                      >
                        <Trash2 size={12} className="text-red-500" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20"
            onClick={() => setLightbox(null)}
          >
            <X size={20} className="text-white" />
          </button>
          <img
            src={lightbox}
            alt="Preview"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
