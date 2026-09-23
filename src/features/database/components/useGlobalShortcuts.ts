import { useEffect, useCallback } from 'react';

/**
 * Hook to register global keyboard shortcuts at the shell level.
 * Returns callbacks and state for the shortcuts dialog.
 */
export function useGlobalShortcuts({
  onOpenShortcuts,
  onAddRow,
  onOpenSearch,
  onOpenReplace,
}: {
  onOpenShortcuts: () => void;
  onAddRow?: () => void;
  onOpenSearch?: () => void;
  onOpenReplace?: () => void;
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

      // Ctrl+H or Ctrl+Shift+F to open search & replace
      if ((e.ctrlKey || e.metaKey) && (e.key === 'h' || (e.key === 'f' && e.shiftKey)) && !e.altKey) {
        e.preventDefault();
        onOpenReplace?.();
        return;
      }
    },
    [onOpenShortcuts, onAddRow, onOpenSearch, onOpenReplace],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleGlobalKeyDown]);
}
