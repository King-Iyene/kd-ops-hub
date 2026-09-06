import { useState, useCallback } from 'react';
import { Copy, Check, Key, Plus, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '../hooks/useApiKeys';

interface ApiTokensDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  baseId: string | null | undefined;
}

const SCOPE_OPTIONS = ['read', 'write', 'delete'] as const;

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

export function ApiTokensDialog({ open, onOpenChange, baseId }: ApiTokensDialogProps) {
  const { data: keys } = useApiKeys(baseId);
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Set<string>>(new Set(['read']));
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  const handleCopy = useCallback((key: string) => {
    navigator.clipboard.writeText(key).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const toggleScope = (s: string) => {
    setScopes((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const handleCreate = () => {
    if (!baseId || !name.trim()) return;
    createKey.mutate(
      { baseId, name: name.trim(), scopes: Array.from(scopes) },
      {
        onSuccess: (data) => {
          setRevealedKey(data.rawKey);
          setShowCreate(false);
          setName('');
          setScopes(new Set(['read']));
        },
      },
    );
  };

  const handleRevoke = (id: string) => {
    if (!baseId) return;
    revokeKey.mutate({ id, baseId });
    setConfirmRevokeId(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setRevealedKey(null); setShowCreate(false); } }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold flex items-center gap-2">
            <Key size={16} className="text-[#2D7FF9]" />
            API Keys
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {revealedKey && (
            <div className="p-3 rounded-lg bg-[#FEF3C7] dark:bg-[hsl(45,40%,12%)] border border-[#F59E0B]/40 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="text-[#92400E] dark:text-[#F59E0B] mt-0.5 shrink-0" />
                <p className="text-[12px] text-[#92400E] dark:text-[#F59E0B] font-medium">
                  Copy your API key now. You will not be able to see it again.
                </p>
              </div>
              <div className="flex gap-2">
                <code className="flex-1 px-3 py-1.5 rounded-md bg-white dark:bg-[hsl(200,30%,10%)] border border-[#F59E0B]/30 text-[11px] text-[#92400E] dark:text-[#FCD34D] font-mono break-all select-all">
                  {revealedKey}
                </code>
                <Button
                  size="sm"
                  className="h-8 px-3 text-[12px] gap-1.5 shrink-0"
                  style={{ backgroundColor: '#2D7FF9' }}
                  onClick={() => handleCopy(revealedKey)}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-1">
            {(keys ?? []).length === 0 && !showCreate && (
              <p className="text-[12px] text-[#6A7184] dark:text-[hsl(200,20%,55%)] text-center py-4">
                No API keys yet. Create one to get started.
              </p>
            )}
            {(keys ?? []).map((k) => (
              <div
                key={k.id}
                className="flex items-center gap-3 p-2.5 rounded-lg border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] bg-[#F9F9FA] dark:bg-[hsl(200,25%,12%)]"
              >
                <Key size={14} className="text-[#6A7184] dark:text-[hsl(200,20%,55%)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[#374151] dark:text-[hsl(200,25%,88%)]">
                    {k.name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <code className="text-[11px] text-[#6A7184] dark:text-[hsl(200,20%,55%)] font-mono">
                      {k.key_prefix}...
                    </code>
                    <span className="text-[10px] text-[#6A7184] dark:text-[hsl(200,20%,55%)]">
                      {k.scopes.join(', ')}
                    </span>
                    {k.last_used_at && (
                      <span className="text-[10px] text-[#6A7184] dark:text-[hsl(200,20%,55%)]">
                        Used {timeAgo(k.last_used_at)}
                      </span>
                    )}
                  </div>
                </div>
                {confirmRevokeId === k.id ? (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px] text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                      onClick={() => handleRevoke(k.id)}
                    >
                      Revoke
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => setConfirmRevokeId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                    onClick={() => setConfirmRevokeId(k.id)}
                  >
                    Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>

          {showCreate ? (
            <div className="space-y-3 p-3 rounded-lg border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]">
              <div>
                <label className="text-[12px] font-medium text-[#4A5268] dark:text-[hsl(200,25%,70%)] mb-1 block">
                  Key name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. n8n integration"
                  className="w-full px-3 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] bg-white dark:bg-[hsl(200,30%,8%)] text-[12px] text-[#374151] dark:text-[hsl(200,25%,88%)] placeholder:text-[#6A7184] dark:placeholder:text-[hsl(200,20%,40%)]"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <div>
                <label className="text-[12px] font-medium text-[#4A5268] dark:text-[hsl(200,25%,70%)] mb-1.5 block">
                  Scopes
                </label>
                <div className="flex gap-3">
                  {SCOPE_OPTIONS.map((s) => (
                    <label key={s} className="flex items-center gap-1.5 text-[12px] text-[#374151] dark:text-[hsl(200,25%,88%)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={scopes.has(s)}
                        onChange={() => toggleScope(s)}
                        className="rounded border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] text-[#2D7FF9]"
                      />
                      {s}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" className="h-8 px-3 text-[12px]" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-8 px-3 text-[12px]"
                  style={{ backgroundColor: '#2D7FF9' }}
                  onClick={handleCreate}
                  disabled={!name.trim() || scopes.size === 0 || createKey.isPending}
                >
                  {createKey.isPending ? 'Creating...' : 'Create key'}
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
              Create key
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
