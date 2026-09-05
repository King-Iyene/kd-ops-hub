import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Menu, HelpCircle, Share2, Copy, Check, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuthStore } from '@/store/authStore';
import { useDatabaseUI } from '../lib/store';
import { useBases } from '../hooks';
import { ProfileDropdown } from '@/components/ProfileDropdown';
import { AvatarBubble } from '@/components/AvatarBubble';

export function DatabaseTopBar() {
  const { toggleSidebar, activeBaseId } = useDatabaseUI();
  const profile = useAuthStore((s) => s.profile);
  const { data: bases } = useBases();
  const [shareOpen, setShareOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [copied, setCopied] = useState(false);

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
                  style={{ backgroundColor: activeBase.color || '#2D7FF9' }}
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
                Bases
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeBaseId && (
            <Button
              size="sm"
              className="h-7 px-3 text-[12px] font-medium gap-1.5 rounded-full bg-white dark:bg-[hsl(200,25%,18%)] text-[#374151] dark:text-[hsl(200,25%,88%)] border border-[#D1D5DB] dark:border-[hsl(200,25%,25%)] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,22%)] shadow-sm"
              onClick={() => setShareOpen(true)}
            >
              <Share2 size={13} /> Share
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-[#6A7184] dark:text-[hsl(200,20%,55%)] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,15%)]"
            onClick={() => setHelpOpen(true)}
          >
            <HelpCircle size={15} />
          </Button>
          <ProfileDropdown />
        </div>
      </header>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold flex items-center gap-2">
              <Share2 size={16} className="text-[#2D7FF9]" />
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
                  style={{ backgroundColor: '#2D7FF9' }}
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
                <AvatarBubble
                  photoUrl={profile?.photo_url ?? null}
                  initials={initials}
                  size={28}
                />
                <div className="flex-1">
                  <p className="text-[13px] text-[#374151] dark:text-[hsl(200,25%,88%)] font-medium">{profile?.full_name ?? 'You'}</p>
                  <p className="text-[11px] text-[#6A7184] dark:text-[hsl(200,20%,55%)]">Owner</p>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold flex items-center gap-2">
              <HelpCircle size={16} className="text-[#2D7FF9]" />
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
