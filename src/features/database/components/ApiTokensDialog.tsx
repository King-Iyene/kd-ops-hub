import { useState, useCallback } from 'react';
import { Copy, Check, Key, Trash2, Plus, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useApiTokens, useCreateApiToken, useDeleteApiToken } from '../hooks/useApiTokens';

interface ApiTokensDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  baseId: string | null | undefined;
}

const PERMISSION_OPTIONS = ['read', 'write', 'delete'] as const;

export function ApiTokensDialog({ open, onOpenChange, baseId }: ApiTokensDialogProps) {
  const { data: tokens } = useApiTokens(baseId);
  const createToken = useCreateApiToken();
  const deleteToken = useDeleteApiToken();

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState<Set<string>>(new Set(['read']));
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleCopy = useCallback((token: string) => {
    navigator.clipboard.writeText(token).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const togglePermission = (p: string) => {
    setPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const handleCreate = () => {
    if (!baseId || !name.trim()) return;
    createToken.mutate(
      { base_id: baseId, name: name.trim(), permissions: Array.from(permissions) },
      {
        onSuccess: (data) => {
          setNewlyCreatedToken(data.token);
          setShowCreate(false);
          setName('');
          setPermissions(new Set(['read']));
        },
      },
    );
  };

  const handleDelete = (id: string) => {
    if (!baseId) return;
    deleteToken.mutate({ id, base_id: baseId });
    setConfirmDeleteId(null);
  };

  const truncateToken = (token: string) =>
    `${token.slice(0, 8)}...${token.slice(-4)}`;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setNewlyCreatedToken(null); setShowCreate(false); } }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold flex items-center gap-2">
            <Key size={16} className="text-[#2D7FF9]" />
            API Tokens
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Newly created token banner */}
          {newlyCreatedToken && (
            <div className="p-3 rounded-lg bg-[#DBEAFE] border border-[#93C5FD] space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="text-[#1E40AF] mt-0.5 shrink-0" />
                <p className="text-[12px] text-[#1E40AF] font-medium">
                  Copy this token now. It will not be shown again.
                </p>
              </div>
              <div className="flex gap-2">
                <code className="flex-1 px-3 py-1.5 rounded-md bg-white dark:bg-[hsl(200,30%,10%)] border border-[#93C5FD] dark:border-[hsl(213,60%,35%)] text-[11px] text-[#1E40AF] dark:text-[#93C5FD] font-mono break-all">
                  {newlyCreatedToken}
                </code>
                <Button
                  size="sm"
                  className="h-8 px-3 text-[12px] gap-1.5 shrink-0"
                  style={{ backgroundColor: '#2D7FF9' }}
                  onClick={() => handleCopy(newlyCreatedToken)}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
          )}

          {/* Token list */}
          <div className="space-y-1">
            {(tokens ?? []).length === 0 && !showCreate && (
              <p className="text-[12px] text-[#6A7184] dark:text-[hsl(200,20%,55%)] text-center py-4">
                No API tokens yet. Create one to get started.
              </p>
            )}
            {(tokens ?? []).map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 p-2.5 rounded-lg border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] bg-[#F9F9FA] dark:bg-[hsl(200,25%,12%)]"
              >
                <Key size={14} className="text-[#6A7184] dark:text-[hsl(200,20%,55%)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[#374151] dark:text-[hsl(200,25%,88%)]">
                    {t.name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <code className="text-[11px] text-[#6A7184] dark:text-[hsl(200,20%,55%)] font-mono">
                      {t.token}
                    </code>
                    <span className="text-[10px] text-[#6A7184] dark:text-[hsl(200,20%,55%)]">
                      {new Date(t.created_at).toLocaleDateString()}
                    </span>
                    <span className="text-[10px] text-[#6A7184] dark:text-[hsl(200,20%,55%)]">
                      {(t.permissions ?? []).join(', ')}
                    </span>
                  </div>
                </div>
                {confirmDeleteId === t.id ? (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px] text-red-600 hover:bg-red-50"
                      onClick={() => handleDelete(t.id)}
                    >
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(t.id)}
                    className="text-[#6A7184] dark:text-[hsl(200,20%,55%)] hover:text-red-600 dark:hover:text-red-400 transition-colors p-1"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Create form */}
          {showCreate ? (
            <div className="space-y-3 p-3 rounded-lg border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]">
              <div>
                <label className="text-[12px] font-medium text-[#4A5268] dark:text-[hsl(200,25%,70%)] mb-1 block">
                  Token name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. CI/CD pipeline"
                  className="w-full px-3 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] bg-white dark:bg-[hsl(200,30%,8%)] text-[12px] text-[#374151] dark:text-[hsl(200,25%,88%)] placeholder:text-[#6A7184] dark:placeholder:text-[hsl(200,20%,40%)]"
                />
              </div>
              <div>
                <label className="text-[12px] font-medium text-[#4A5268] dark:text-[hsl(200,25%,70%)] mb-1.5 block">
                  Permissions
                </label>
                <div className="flex gap-3">
                  {PERMISSION_OPTIONS.map((p) => (
                    <label key={p} className="flex items-center gap-1.5 text-[12px] text-[#374151] dark:text-[hsl(200,25%,88%)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={permissions.has(p)}
                        onChange={() => togglePermission(p)}
                        className="rounded border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] text-[#2D7FF9]"
                      />
                      {p}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3 text-[12px]"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-8 px-3 text-[12px]"
                  style={{ backgroundColor: '#2D7FF9' }}
                  onClick={handleCreate}
                  disabled={!name.trim() || permissions.size === 0 || createToken.isPending}
                >
                  Create token
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-[12px] gap-1.5 w-full"
              onClick={() => setShowCreate(true)}
            >
              <Plus size={13} />
              Create token
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
