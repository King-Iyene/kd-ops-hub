import { useState, useCallback } from 'react';
import { Copy, Check, Link2, Eye, EyeOff, Download, ToggleLeft, ToggleRight, Trash2, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSharedView, useCreateSharedView, useUpdateSharedView, useDeleteSharedView } from '../hooks/useSharedViews';

interface ShareViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewId: string | null | undefined;
  tableId: string | null | undefined;
}

export function ShareViewDialog({ open, onOpenChange, viewId, tableId }: ShareViewDialogProps) {
  const { data: sharedView, isLoading } = useSharedView(viewId);
  const createShared = useCreateSharedView();
  const updateShared = useUpdateSharedView();
  const deleteShared = useDeleteSharedView();

  const [copied, setCopied] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const shareUrl = sharedView
    ? `${window.location.origin}/shared/${sharedView.share_token}`
    : '';

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareUrl]);

  const handleEnableSharing = () => {
    if (!viewId || !tableId) return;
    if (sharedView) {
      updateShared.mutate({
        id: sharedView.id,
        view_id: sharedView.view_id,
        updates: { is_enabled: true },
      });
    } else {
      createShared.mutate({ view_id: viewId, table_id: tableId });
    }
  };

  const handleDisableSharing = () => {
    if (!sharedView) return;
    updateShared.mutate({
      id: sharedView.id,
      view_id: sharedView.view_id,
      updates: { is_enabled: false },
    });
  };

  const handleSetPassword = () => {
    if (!sharedView) return;
    updateShared.mutate({
      id: sharedView.id,
      view_id: sharedView.view_id,
      updates: { password: password || null },
    });
  };

  const handleToggleCsv = () => {
    if (!sharedView) return;
    updateShared.mutate({
      id: sharedView.id,
      view_id: sharedView.view_id,
      updates: { allow_csv_download: !sharedView.allow_csv_download },
    });
  };

  const handleDelete = () => {
    if (!sharedView) return;
    deleteShared.mutate({ id: sharedView.id, view_id: sharedView.view_id }, {
      onSuccess: () => onOpenChange(false),
    });
  };

  const isEnabled = sharedView?.is_enabled ?? false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold flex items-center gap-2">
            <Share2 size={16} className="text-[#166EE1]" />
            Share View
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Enable / disable toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-[#F9F9FA] dark:bg-[hsl(200,25%,12%)] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]">
            <div>
              <p className="text-[13px] font-medium text-[#374151] dark:text-[hsl(200,25%,88%)]">
                Enable shared view
              </p>
              <p className="text-[11px] text-[#6A7184] dark:text-[hsl(200,20%,55%)]">
                Anyone with the link can view this data
              </p>
            </div>
            <button
              onClick={isEnabled ? handleDisableSharing : handleEnableSharing}
              disabled={isLoading || createShared.isPending || updateShared.isPending}
              className="text-[#166EE1]"
            >
              {isEnabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} className="text-[#6A7184] dark:text-[hsl(200,20%,55%)]" />}
            </button>
          </div>

          {isEnabled && sharedView && (
            <>
              {/* Shareable link */}
              <div>
                <label className="text-[12px] font-medium text-[#4A5268] dark:text-[hsl(200,25%,70%)] mb-1.5 block">
                  Shareable link
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] bg-white dark:bg-[hsl(200,30%,8%)] text-[12px] text-[#6A7184] dark:text-[hsl(200,20%,55%)] truncate">
                    <Link2 size={12} className="shrink-0" />
                    <span className="truncate">{shareUrl}</span>
                  </div>
                  <Button
                    size="sm"
                    className="h-8 px-3 text-[12px] gap-1.5"
                    style={{ backgroundColor: '#166EE1' }}
                    onClick={handleCopy}
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>

              {/* Password protection */}
              <div>
                <label className="text-[12px] font-medium text-[#4A5268] dark:text-[hsl(200,25%,70%)] mb-1.5 block">
                  Password protection (optional)
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={sharedView.password ? '(password set)' : 'Set a password'}
                      className="w-full px-3 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] bg-white dark:bg-[hsl(200,30%,8%)] text-[12px] text-[#374151] dark:text-[hsl(200,25%,88%)] placeholder:text-[#6A7184] dark:placeholder:text-[hsl(200,20%,40%)] pr-8"
                    />
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6A7184] dark:text-[hsl(200,20%,55%)]"
                    >
                      {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-3 text-[12px]"
                    onClick={handleSetPassword}
                    disabled={updateShared.isPending}
                  >
                    Save
                  </Button>
                </div>
              </div>

              {/* CSV download toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#F9F9FA] dark:bg-[hsl(200,25%,12%)] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]">
                <div className="flex items-center gap-2">
                  <Download size={14} className="text-[#6A7184] dark:text-[hsl(200,20%,55%)]" />
                  <div>
                    <p className="text-[13px] font-medium text-[#374151] dark:text-[hsl(200,25%,88%)]">
                      Allow CSV download
                    </p>
                    <p className="text-[11px] text-[#6A7184] dark:text-[hsl(200,20%,55%)]">
                      Viewers can export data as CSV
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleToggleCsv}
                  disabled={updateShared.isPending}
                  className="text-[#166EE1]"
                >
                  {sharedView.allow_csv_download
                    ? <ToggleRight size={28} />
                    : <ToggleLeft size={28} className="text-[#6A7184] dark:text-[hsl(200,20%,55%)]" />}
                </button>
              </div>

              {/* Delete sharing */}
              <div className="border-t border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3 text-[12px] text-red-600 hover:text-red-700 hover:bg-red-50 gap-1.5"
                  onClick={handleDelete}
                  disabled={deleteShared.isPending}
                >
                  <Trash2 size={13} />
                  Remove shared link
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
