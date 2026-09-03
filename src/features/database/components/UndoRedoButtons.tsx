import { Undo2, Redo2 } from 'lucide-react';
import { useUndoStore } from '../lib/undo';
import { useGridColors } from '../hooks/useGridColors';

export function UndoRedoButtons() {
  const undo = useUndoStore((s) => s.undo);
  const redo = useUndoStore((s) => s.redo);
  const canUndo = useUndoStore((s) => s.stack.length > 0 && !s._busy);
  const canRedo = useUndoStore((s) => s.redoStack.length > 0 && !s._busy);
  const colors = useGridColors();

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => undo()}
        disabled={!canUndo}
        className="inline-flex items-center justify-center h-7 w-7 rounded-md disabled:opacity-40 disabled:pointer-events-none"
        style={{ color: colors.muted }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.headerBg)}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        title="Undo (Ctrl+Z)"
      >
        <Undo2 size={14} />
      </button>
      <button
        type="button"
        onClick={() => redo()}
        disabled={!canRedo}
        className="inline-flex items-center justify-center h-7 w-7 rounded-md disabled:opacity-40 disabled:pointer-events-none"
        style={{ color: colors.muted }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.headerBg)}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        title="Redo (Ctrl+Shift+Z)"
      >
        <Redo2 size={14} />
      </button>
    </div>
  );
}
