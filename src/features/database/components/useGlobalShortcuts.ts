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

      // A cell being edited commits when it loses focus, so opening a panel from inside it would save a
      // half-typed value. Leave Ctrl+K and Ctrl+J alone there. Another dialog that is already open also
      // keeps them (the palette itself may still close with Ctrl+K).
      const inCellEditor = typeof target.closest === 'function' && !!target.closest('[data-cell-id]');
      const inOtherDialog =
        typeof target.closest === 'function' &&
        !!target.closest('[role="dialog"]') &&
        !target.closest('[data-command-palette]');

      // Ctrl/Cmd+K opens (or closes) the command palette.
      if (isModShortcut(e, 'k')) {
        if (inCellEditor || inOtherDialog) return;
        e.preventDefault();
        onTogglePalette?.();
        return;
      }

      // Ctrl/Cmd+J opens (or closes) the table switcher.
      if (isModShortcut(e, 'j')) {
        if (inCellEditor || inOtherDialog) return;
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
