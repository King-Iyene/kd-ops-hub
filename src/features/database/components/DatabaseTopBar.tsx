import { useState, useCallback, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Menu, HelpCircle, Share2, Copy, Check, Lock, Zap, Link2, Key, Webhook, History, Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuthStore } from '@/store/authStore';
import { useDatabaseUI } from '../lib/store';
import { useBases } from '../hooks';
import { NotificationsPanel } from './NotificationsPanel';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ProfileDropdown } from '@/components/ProfileDropdown';

const AutomationsDialog = lazy(() => import('./AutomationsDialog').then(m => ({ default: m.AutomationsDialog })));
const ShareViewDialog = lazy(() => import('./ShareViewDialog').then(m => ({ default: m.ShareViewDialog })));
const ApiTokensDialog = lazy(() => import('./ApiTokensDialog').then(m => ({ default: m.ApiTokensDialog })));
const WebhooksDialog = lazy(() => import('./WebhooksDialog').then(m => ({ default: m.WebhooksDialog })));
const AuditLogDialog = lazy(() => import('./AuditLogDialog').then(m => ({ default: m.AuditLogDialog })));

export function DatabaseTopBar({ onOpenShortcuts }: { onOpenShortcuts?: () => void }) {
  const { toggleSidebar, activeBaseId, activeTableId } = useDatabaseUI();
  const profile = useAuthStore((s) => s.profile);
  const { data: bases } = useBases();
  const [shareOpen, setShareOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [automationsOpen, setAutomationsOpen] = useState(false);
  const [shareViewOpen, setShareViewOpen] = useState(false);
  const [apiTokensOpen, setApiTokensOpen] = useState(false);
  const [webhooksOpen, setWebhooksOpen] = useState(false);
  const [auditLogOpen, setAuditLogOpen] = useState(false);
  const activeViewId = useDatabaseUI((s) => s.activeViewId);

  const activeBase = bases?.find((b: any) => b.id === activeBaseId);

  const initials = profile?.full_name
    ? profile.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <>
      <header className="flex items-center justify-between h-11 px-3 bg-white dark:bg-[hsl(200,30%,8%)] border-b border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] shrink-0">
        <div className="flex items-center gap-1.5">
          <Link
            to="/"
            className="p-1.5 rounded-md hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,15%)] text-[#6A7184] dark:text-[hsl(200,20%,55%)] transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-[#6A7184] dark:text-[hsl(200,20%,55%)] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,15%)]"
            onClick={toggleSidebar}
          >
            <Menu size={16} />
          </Button>
          <div className="flex items-center gap-1.5 ml-1">
            {activeBase ? (
              <>
                <span
                  className="w-5 h-5 rounded flex items-center justify-center text-[10px] shrink-0"
                  style={{ backgroundColor: activeBase.color || '#166EE1' }}
                >
                  <span className="text-white font-bold">
                    {activeBase.name?.charAt(0)?.toUpperCase() || 'B'}
                  </span>
                </span>
                <span className="text-[14px] font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">
                  {activeBase.name}
                </span>
              </>
            ) : (
              <span className="text-[14px] font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">
                KDOps Data
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {activeBaseId && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[12px] text-[#6A7184] dark:text-[hsl(200,20%,55%)] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,15%)] gap-1"
                onClick={() => setApiTokensOpen(true)}
              >
                <Key size={13} /> API
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[12px] text-[#6A7184] dark:text-[hsl(200,20%,55%)] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,15%)] gap-1"
                onClick={() => setShareViewOpen(true)}
              >
                <Link2 size={13} /> Share
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[12px] text-[#6A7184] dark:text-[hsl(200,20%,55%)] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,15%)] gap-1"
                onClick={() => setAutomationsOpen(true)}
              >
                <Zap size={13} /> Automations
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[12px] text-[#6A7184] dark:text-[hsl(200,20%,55%)] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,15%)] gap-1"
                onClick={() => setWebhooksOpen(true)}
              >
                <Webhook size={13} /> Webhooks
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[12px] text-[#6A7184] dark:text-[hsl(200,20%,55%)] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,15%)] gap-1"
                onClick={() => setAuditLogOpen(true)}
              >
                <History size={13} /> Audit Log
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[12px] text-[#6A7184] dark:text-[hsl(200,20%,55%)] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,15%)] gap-1"
                onClick={() => setShareOpen(true)}
              >
                <Share2 size={13} /> Share Base
              </Button>
            </>
          )}
          <NotificationsPanel />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-[#6A7184] dark:text-[hsl(200,20%,55%)] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,15%)]"
            onClick={() => onOpenShortcuts?.()}
            title="Keyboard shortcuts (?)"
          >
            <Keyboard size={15} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-[#6A7184] dark:text-[hsl(200,20%,55%)] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,15%)]"
            onClick={() => setHelpOpen(true)}
          >
            <HelpCircle size={15} />
          </Button>
          <div className="w-px h-4 bg-[#E5E5E5] dark:bg-[hsl(200,25%,18%)] mx-0.5" />
          <ThemeToggle />
          <ProfileDropdown />
        </div>
      </header>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold flex items-center gap-2">
              <Share2 size={16} className="text-[#166EE1]" />
              Share {activeBase?.name ? `"${activeBase.name}"` : 'base'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-[#F9F9FA] dark:bg-[hsl(200,25%,13%)] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]">
              <Lock size={14} className="text-[#6A7184] dark:text-[hsl(200,20%,55%)] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#374151] dark:text-[hsl(200,25%,88%)]">Private to workspace</p>
                <p className="text-[11px] text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Only workspace members can access</p>
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-[#4A5268] dark:text-[hsl(200,20%,55%)] mb-1.5 block">Copy link</label>
              <div className="flex gap-2">
                <div className="flex-1 px-3 py-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] bg-white dark:bg-[hsl(200,30%,10%)] text-[12px] text-[#6A7184] dark:text-[hsl(200,20%,55%)] truncate">
                  {typeof window !== 'undefined' ? window.location.href : ''}
                </div>
                <Button
                  size="sm"
                  className="h-8 px-3 text-[12px] gap-1.5"
                  style={{ backgroundColor: '#166EE1' }}
                  onClick={handleCopyLink}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
            <div className="border-t border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] pt-3">
              <p className="text-[12px] font-medium text-[#4A5268] dark:text-[hsl(200,20%,55%)] mb-2">People with access</p>
              <div className="flex items-center gap-2 py-1.5">
                <div className="h-7 w-7 rounded-full bg-[#166EE1] text-white flex items-center justify-center text-[10px] font-semibold">
                  {initials}
                </div>
                <div className="flex-1">
                  <p className="text-[13px] text-[#374151] dark:text-[hsl(200,25%,88%)] font-medium">{profile?.full_name ?? 'You'}</p>
                  <p className="text-[11px] text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Owner</p>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Suspense fallback={null}>
        {shareViewOpen && <ShareViewDialog open={shareViewOpen} onOpenChange={setShareViewOpen} viewId={activeViewId} tableId={activeTableId} />}
        {apiTokensOpen && <ApiTokensDialog open={apiTokensOpen} onOpenChange={setApiTokensOpen} baseId={activeBaseId} />}
        {automationsOpen && <AutomationsDialog open={automationsOpen} onOpenChange={setAutomationsOpen} tableId={activeTableId} baseId={activeBaseId} />}
        {webhooksOpen && <WebhooksDialog open={webhooksOpen} onOpenChange={setWebhooksOpen} tableId={activeTableId} baseId={activeBaseId} />}
        {auditLogOpen && <AuditLogDialog open={auditLogOpen} onOpenChange={setAuditLogOpen} baseId={activeBaseId} />}
      </Suspense>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold flex items-center gap-2">
              <HelpCircle size={16} className="text-[#166EE1]" />
              Keyboard Shortcuts
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1 pt-2">
            {[
              ['Arrow keys', 'Navigate cells'],
              ['Enter', 'Edit selected cell'],
              ['Escape', 'Stop editing / deselect'],
              ['Tab / Shift+Tab', 'Move to next / previous cell'],
              ['Delete / Backspace', 'Clear cell value'],
              ['Ctrl+C', 'Copy cell value'],
              ['Ctrl+V', 'Paste into cell'],
              ['Space', 'Expand selected record'],
              ['Shift+Enter', 'Insert new row below'],
              ['Ctrl+D', 'Fill down (copy value from cell above)'],
              ['Home / End', 'Jump to first / last cell in row'],
              ['Ctrl+Home / Ctrl+End', 'Jump to first / last cell in table'],
              ['PgUp / PgDn', 'Scroll one page up / down'],
              ['Ctrl+Z', 'Undo last change'],
              ['Ctrl+Shift+Z', 'Redo last change'],
              ['Ctrl+C', 'Copy cell value'],
              ['Ctrl+V', 'Paste into cell'],
              ['Right-click row', 'Row context menu'],
              ['Right-click column', 'Column context menu'],
              ['Drag column header', 'Reorder columns'],
            ].map(([shortcut, desc]) => (
              <div key={shortcut} className="flex items-center justify-between py-1.5 px-1">
                <span className="text-[13px] text-[#374151] dark:text-[hsl(200,25%,88%)]">{desc}</span>
                <kbd className="px-2 py-0.5 rounded bg-[#F4F4F5] dark:bg-[hsl(200,25%,13%)] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] text-[11px] text-[#6A7184] dark:text-[hsl(200,20%,55%)] font-mono">
                  {shortcut}
                </kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
