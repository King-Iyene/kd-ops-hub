import { create } from 'zustand';

const MAX_UNDO_STACK = 50;

export interface UndoAction {
  type: string;
  payload: any;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

interface UndoState {
  undoStack: UndoAction[];
  redoStack: UndoAction[];
  canUndo: boolean;
  canRedo: boolean;
  push: (action: UndoAction) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

export const useUndoStore = create<UndoState>((set, get) => ({
  undoStack: [],
  redoStack: [],
  canUndo: false,
  canRedo: false,

  push: (action: UndoAction) => {
    set((state) => {
      const newStack = [...state.undoStack, action];
      if (newStack.length > MAX_UNDO_STACK) {
        newStack.shift();
      }
      return {
        undoStack: newStack,
        redoStack: [],
        canUndo: true,
        canRedo: false,
      };
    });
  },

  undo: async () => {
    const { undoStack } = get();
    if (undoStack.length === 0) return;

    const action = undoStack[undoStack.length - 1];
    await action.undo();

    set((state) => {
      const newUndoStack = state.undoStack.slice(0, -1);
      const newRedoStack = [...state.redoStack, action];
      return {
        undoStack: newUndoStack,
        redoStack: newRedoStack,
        canUndo: newUndoStack.length > 0,
        canRedo: true,
      };
    });
  },

  redo: async () => {
    const { redoStack } = get();
    if (redoStack.length === 0) return;

    const action = redoStack[redoStack.length - 1];
    await action.redo();

    set((state) => {
      const newRedoStack = state.redoStack.slice(0, -1);
      const newUndoStack = [...state.undoStack, action];
      return {
        undoStack: newUndoStack,
        redoStack: newRedoStack,
        canUndo: true,
        canRedo: newRedoStack.length > 0,
      };
    });
  },
}));
