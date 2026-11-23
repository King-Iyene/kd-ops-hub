import { useEffect, useCallback } from 'react';
import { isModShortcut } from '../lib/shortcuts';

/**
 * Hook to register global keyboard shortcuts at the shell level.
 * Returns callbacks and state for the shortcuts dialog.
 */
export function useGlobalShortcuts({
  onOpenShortcuts,
  onAddRow,
  onOpenSearch,
  onOpenReplace,
  onTogglePalette,
  onToggleTables,
}: {
  onOpenShortcuts: () => void;
  onAddRow?: () => void;
  onOpenSearch?: () => void;
  onOpenReplace?: () => void;
  /** Ctrl/Cmd+K: the one command palette. Nothing else in the database module listens for this key. */
  onTogglePalette?: () => void;
  /** Ctrl/Cmd+J: the table switcher in the tab strip. */
  onToggleTables?: () => void;
}) {
  const handleGlobalKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      // Ctrl/Cmd+K opens (or closes) the command palette, even while typing in a cell.
      if (isModShortcut(e, 'k')) {
        e.preventDefault();
        onTogglePalette?.();
        return;
      }

      // Ctrl/Cmd+J opens (or closes) the table switcher.
      if (isModShortcut(e, 'j')) {
        e.preventDefault();
        onToggleTables?.();
        return;
      }

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

      // Ctrl+H or Ctrl+Shift+F to open search & replace
      if ((e.ctrlKey || e.metaKey) && (e.key === 'h' || (e.key === 'f' && e.shiftKey)) && !e.altKey) {
        e.preventDefault();
        onOpenReplace?.();
        return;
      }

      // Ctrl+P to print
      if ((e.ctrlKey || e.metaKey) && e.key === 'p' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        window.print();
        return;
      }
    },
    [onOpenShortcuts, onAddRow, onOpenSearch, onOpenReplace, onTogglePalette, onToggleTables],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleGlobalKeyDown]);
}
