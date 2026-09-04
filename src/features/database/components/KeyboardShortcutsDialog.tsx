import { useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Keyboard } from 'lucide-react';

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ShortcutEntry {
  keys: string[];
  description: string;
}

interface ShortcutSection {
  title: string;
  shortcuts: ShortcutEntry[];
}

const SECTIONS: ShortcutSection[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['←', '↑', '→', '↓'], description: 'Move between cells' },
      { keys: ['Tab'], description: 'Move to next column' },
      { keys: ['Shift', 'Tab'], description: 'Move to previous column' },
      { keys: ['Page Up'], description: 'Scroll up one page' },
      { keys: ['Page Down'], description: 'Scroll down one page' },
      { keys: ['Home'], description: 'Go to first column in row' },
      { keys: ['End'], description: 'Go to last column in row' },
      { keys: ['Ctrl', 'Home'], description: 'Go to first cell' },
    ],
  },
  {
    title: 'Editing',
    shortcuts: [
      { keys: ['Enter'], description: 'Edit selected cell' },
      { keys: ['Escape'], description: 'Cancel editing / deselect' },
      { keys: ['Delete'], description: 'Clear cell value' },
      { keys: ['Backspace'], description: 'Clear cell value' },
      { keys: ['Ctrl', 'C'], description: 'Copy cell value' },
      { keys: ['Ctrl', 'V'], description: 'Paste into cell' },
      { keys: ['Ctrl', 'Z'], description: 'Undo last change' },
      { keys: ['Ctrl', 'Shift', 'Z'], description: 'Redo last change' },
      { keys: ['Space'], description: 'Toggle checkbox field' },
    ],
  },
  {
    title: 'Selection',
    shortcuts: [
      { keys: ['Shift', 'Click'], description: 'Select range of rows' },
      { keys: ['Ctrl', 'Click'], description: 'Toggle row selection' },
      { keys: ['Ctrl', 'A'], description: 'Select all rows' },
    ],
  },
  {
    title: 'Views',
    shortcuts: [
      { keys: ['Ctrl', '1'], description: 'Switch to Grid view' },
      { keys: ['Ctrl', '2'], description: 'Switch to Kanban view' },
      { keys: ['Ctrl', '3'], description: 'Switch to Gallery view' },
      { keys: ['Ctrl', '4'], description: 'Switch to Calendar view' },
      { keys: ['Ctrl', '5'], description: 'Switch to Form view' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: ['Ctrl', 'N'], description: 'Add new record' },
      { keys: ['Ctrl', 'F'], description: 'Find / search' },
      { keys: ['Ctrl', 'Shift', 'F'], description: 'Search & replace' },
      { keys: ['?'], description: 'Show keyboard shortcuts' },
    ],
  },
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd
      className="inline-flex items-center justify-center min-w-[24px] h-[22px] px-1.5 rounded
        bg-[#F4F4F5] dark:bg-[hsl(200,25%,18%)]
        border border-[#E5E5E5] dark:border-[hsl(200,25%,25%)]
        text-[11px] font-mono font-medium
        text-[#6A7184] dark:text-[hsl(200,25%,70%)]
        shadow-[0_1px_0_0_rgba(0,0,0,0.05)]"
    >
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold flex items-center gap-2">
            <Keyboard size={16} className="text-[#166EE1]" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-1">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#6A7184] dark:text-[hsl(200,25%,60%)] mb-2 px-1">
                {section.title}
              </h3>
              <div className="space-y-0.5">
                {section.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between py-1.5 px-2 rounded
                      hover:bg-[#F9F9FA] dark:hover:bg-[hsl(200,25%,14%)]"
                  >
                    <span className="text-[13px] text-[#374151] dark:text-[hsl(200,25%,88%)]">
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1 ml-4 shrink-0">
                      {shortcut.keys.map((key, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && (
                            <span className="text-[10px] text-[#9AA2AF] dark:text-[hsl(200,25%,45%)]">+</span>
                          )}
                          <Kbd>{key}</Kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="pt-3 border-t border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]">
          <p className="text-[11px] text-[#9AA2AF] dark:text-[hsl(200,25%,50%)] text-center">
            Press <Kbd>?</Kbd> anytime to open this dialog
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook to register global keyboard shortcuts at the shell level.
 * Returns callbacks and state for the shortcuts dialog.
 */
export function useGlobalShortcuts({
  onOpenShortcuts,
  onAddRow,
  onOpenSearch,
}: {
  onOpenShortcuts: () => void;
  onAddRow?: () => void;
  onOpenSearch?: () => void;
}) {
  const handleGlobalKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      // ? to open shortcuts (only when not typing in an input)
      if (e.key === '?' && !isInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        onOpenShortcuts();
        return;
      }

      // Ctrl+N to add new record
      if ((e.ctrlKey || e.metaKey) && e.key === 'n' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        onAddRow?.();
        return;
      }

      // Ctrl+F to open search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        onOpenSearch?.();
        return;
      }
    },
    [onOpenShortcuts, onAddRow, onOpenSearch],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleGlobalKeyDown]);
}
