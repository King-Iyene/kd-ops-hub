import { create } from 'zustand';

interface UndoEntry {
  type: string;
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
}

export const useUndoStore = create<UndoState>((set, get) => ({
  stack: [],
  redoStack: [],
  push: (entry) =>
    set((s) => ({
      stack: [...s.stack.slice(-49), entry],
      redoStack: [],
    })),
  undo: () => {
    const { stack } = get();
    if (stack.length === 0) return;
    const entry = stack[stack.length - 1];
    entry.undo();
    set((s) => ({
      stack: s.stack.slice(0, -1),
      redoStack: [...s.redoStack, entry],
    }));
  },
  redo: () => {
    const { redoStack } = get();
    if (redoStack.length === 0) return;
    const entry = redoStack[redoStack.length - 1];
    entry.redo();
    set((s) => ({
      redoStack: s.redoStack.slice(0, -1),
      stack: [...s.stack, entry],
    }));
  },
}));
