import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Menu, HelpCircle, Share2, Copy, Check, Lock, Zap, Link2, Key } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuthStore } from '@/store/authStore';
import { useDatabaseUI } from '../lib/store';
import { useBases } from '../hooks';
import { AutomationsDialog } from './AutomationsDialog';
import { ShareViewDialog } from './ShareViewDialog';
import { ApiTokensDialog } from './ApiTokensDialog';
import { PresenceIndicator } from './PresenceIndicator';
import { NotificationsPanel } from './NotificationsPanel';

export function DatabaseTopBar() {
  const { toggleSidebar, activeBaseId, activeTableId } = useDatabaseUI();
  const profile = useAuthStore((s) => s.profile);
  const { data: bases } = useBases();
  const [shareOpen, setShareOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [automationsOpen, setAutomationsOpen] = useState(false);
  const [shareViewOpen, setShareViewOpen] = useState(false);
  const [apiTokensOpen, setApiTokensOpen] = useState(false);
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
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <>
      <header className="flex items-center justify-between h-11 px-3 bg-white dark:bg-[hsl(200,30%,8%)] border-b border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] shrink-0">
        <div className="flex items-center gap-1.5">
          <Link
            to="/"
            className="p-1.5 rounded-md hover:bg-[#F4F4F5] text-[#6A7184] transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-[#6A7184] hover:bg-[#F4F4F5]"
            onClick={toggleSidebar}
          >
            <Menu size={16} />
          </Button>
          <div className="flex items-center gap-1.5 ml-1">
            {activeBase ? (
              <>
                <span
                  className="w-5 h-5 rounded flex items-center justify-center text-[10px] shrink-0"
                  style={{ backgroundColor: activeBase.color || '#3366FF' }}
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
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[12px] text-[#6A7184] hover:bg-[#F4F4F5] gap-1"
            onClick={() => setApiTokensOpen(true)}
          >
            <Key size={13} /> API
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[12px] text-[#6A7184] hover:bg-[#F4F4F5] gap-1"
            onClick={() => setShareViewOpen(true)}
          >
            <Link2 size={13} /> Share
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[12px] text-[#6A7184] hover:bg-[#F4F4F5] gap-1"
            onClick={() => setAutomationsOpen(true)}
          >
            <Zap size={13} /> Automations
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[12px] text-[#6A7184] hover:bg-[#F4F4F5] gap-1"
            onClick={() => setShareOpen(true)}
          >
            <Share2 size={13} /> Share Base
          </Button>
          <NotificationsPanel />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-[#6A7184] hover:bg-[#F4F4F5]"
            onClick={() => setHelpOpen(true)}
          >
            <HelpCircle size={15} />
          </Button>
          <PresenceIndicator />
          <div
            className="h-7 w-7 rounded-full bg-[#3366FF] text-white flex items-center justify-center text-[10px] font-semibold select-none ml-1"
            title={profile?.full_name ?? ''}
          >
            {initials}
          </div>
        </div>
      </header>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold flex items-center gap-2">
              <Share2 size={16} className="text-[#3366FF]" />
              Share {activeBase?.name ? `"${activeBase.name}"` : 'base'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-[#F9F9FA] border border-[#E7E7E9]">
              <Lock size={14} className="text-[#6A7184] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#374151]">Private to workspace</p>
                <p className="text-[11px] text-[#6A7184]">Only workspace members can access</p>
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-[#4A5268] mb-1.5 block">Copy link</label>
              <div className="flex gap-2">
                <div className="flex-1 px-3 py-1.5 rounded-md border border-[#E7E7E9] bg-white text-[12px] text-[#6A7184] truncate">
                  {typeof window !== 'undefined' ? window.location.href : ''}
                </div>
                <Button
                  size="sm"
                  className="h-8 px-3 text-[12px] gap-1.5"
                  style={{ backgroundColor: '#3366FF' }}
                  onClick={handleCopyLink}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
            <div className="border-t border-[#E7E7E9] pt-3">
              <p className="text-[12px] font-medium text-[#4A5268] mb-2">People with access</p>
              <div className="flex items-center gap-2 py-1.5">
                <div className="h-7 w-7 rounded-full bg-[#3366FF] text-white flex items-center justify-center text-[10px] font-semibold">
                  {initials}
                </div>
                <div className="flex-1">
                  <p className="text-[13px] text-[#374151] font-medium">{profile?.full_name ?? 'You'}</p>
                  <p className="text-[11px] text-[#6A7184]">Owner</p>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ShareViewDialog open={shareViewOpen} onOpenChange={setShareViewOpen} viewId={activeViewId} tableId={activeTableId} />
      <ApiTokensDialog open={apiTokensOpen} onOpenChange={setApiTokensOpen} baseId={activeBaseId} />
      <AutomationsDialog open={automationsOpen} onOpenChange={setAutomationsOpen} tableId={activeTableId} baseId={activeBaseId} />

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold flex items-center gap-2">
              <HelpCircle size={16} className="text-[#3366FF]" />
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
              ['Ctrl+Z', 'Undo last change'],
              ['Ctrl+Shift+Z', 'Redo last change'],
              ['Right-click row', 'Row context menu'],
              ['Right-click column', 'Column context menu'],
              ['Drag column header', 'Reorder columns'],
            ].map(([shortcut, desc]) => (
              <div key={shortcut} className="flex items-center justify-between py-1.5 px-1">
                <span className="text-[13px] text-[#374151]">{desc}</span>
                <kbd className="px-2 py-0.5 rounded bg-[#F4F4F5] border border-[#E7E7E9] text-[11px] text-[#6A7184] font-mono">
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
