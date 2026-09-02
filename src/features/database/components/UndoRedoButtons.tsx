import { useEffect } from 'react';
import { Undo2, Redo2 } from 'lucide-react';
import { useUndoStore } from '../lib/undo';

export function UndoRedoButtons() {
  const { undo, redo, canUndo, canRedo } = useUndoStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== 'z') return;

      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => undo()}
        disabled={!canUndo}
        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-[#475569] hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none"
        title="Undo (Ctrl+Z)"
      >
        <Undo2 size={14} />
      </button>
      <button
        type="button"
        onClick={() => redo()}
        disabled={!canRedo}
        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-[#475569] hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none"
        title="Redo (Ctrl+Shift+Z)"
      >
        <Redo2 size={14} />
      </button>
    </div>
  );
}
