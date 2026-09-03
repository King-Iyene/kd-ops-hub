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
  _busy: boolean;
  push: (entry: UndoEntry) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
}

export const useUndoStore = create<UndoState>((set, get) => ({
  stack: [],
  redoStack: [],
  _busy: false,
  push: (entry) => {
    if (get()._busy) return;
    set((s) => ({
      stack: [...s.stack.slice(-(MAX_STACK_SIZE - 1)), entry],
      redoStack: [],
    }));
  },
  undo: () => {
    const { stack, _busy } = get();
    if (_busy || stack.length === 0) return;
    const entry = stack[stack.length - 1];
    set((s) => ({
      _busy: true,
      stack: s.stack.slice(0, -1),
      redoStack: [...s.redoStack.slice(-(MAX_STACK_SIZE - 1)), entry],
    }));
    Promise.resolve(entry.undo()).finally(() => set({ _busy: false }));
  },
  redo: () => {
    const { redoStack, _busy } = get();
    if (_busy || redoStack.length === 0) return;
    const entry = redoStack[redoStack.length - 1];
    set((s) => ({
      _busy: true,
      redoStack: s.redoStack.slice(0, -1),
      stack: [...s.stack.slice(-(MAX_STACK_SIZE - 1)), entry],
    }));
    Promise.resolve(entry.redo()).finally(() => set({ _busy: false }));
  },
  clear: () => set({ stack: [], redoStack: [] }),
}));
