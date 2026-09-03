import { create } from 'zustand';

const MAX_STACK_SIZE = 50;

export type UndoActionType =
  | 'cell_update'
  | 'row_create'
  | 'row_delete'
  | 'field_create'
  | 'field_update'
  | 'field_delete'
  | 'bulk_update'
  | (string & {});

export interface UndoEntry {
  type: UndoActionType;
  description?: string;
  payload: any;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

interface UndoState {
  stack: UndoEntry[];
  redoStack: UndoEntry[];
  push: (entry: UndoEntry) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const useUndoStore = create<UndoState>((set, get) => ({
  stack: [],
  redoStack: [],
  push: (entry) =>
    set((s) => ({
      stack: [...s.stack.slice(-(MAX_STACK_SIZE - 1)), entry],
      redoStack: [],
    })),
  undo: () => {
    const { stack } = get();
    if (stack.length === 0) return;
    const entry = stack[stack.length - 1];
    entry.undo();
    set((s) => ({
      stack: s.stack.slice(0, -1),
      redoStack: [...s.redoStack.slice(-(MAX_STACK_SIZE - 1)), entry],
    }));
  },
  redo: () => {
    const { redoStack } = get();
    if (redoStack.length === 0) return;
    const entry = redoStack[redoStack.length - 1];
    entry.redo();
    set((s) => ({
      redoStack: s.redoStack.slice(0, -1),
      stack: [...s.stack.slice(-(MAX_STACK_SIZE - 1)), entry],
    }));
  },
  clear: () => set({ stack: [], redoStack: [] }),
  canUndo: () => get().stack.length > 0,
  canRedo: () => get().redoStack.length > 0,
}));
