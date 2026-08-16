import { useEffect, useState } from 'react';

// Imperative confirm() replacement for window.confirm(), following the same
// module-level-state + listeners pattern as use-toast.ts. window.confirm()
// bypasses Radix focus management (no trap/restore), can't be styled, and on
// mobile shows a stripped native prompt with no context — this renders a real
// AlertDialog instead while keeping the call-site ergonomics close to the
// original `if (!confirm(...)) return;` (now `if (!(await confirm(...)))
// return;`).
export interface ConfirmOptions {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
}

interface ConfirmRequest extends ConfirmOptions {
  id: string;
  resolve: (value: boolean) => void;
}

interface State {
  request: ConfirmRequest | null;
}

let count = 0;
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

const listeners: Array<(state: State) => void> = [];
let memoryState: State = { request: null };

function dispatch(state: State) {
  memoryState = state;
  listeners.forEach((listener) => listener(memoryState));
}

function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const id = genId();
    dispatch({
      request: {
        id,
        confirmLabel: 'Confirm',
        cancelLabel: 'Cancel',
        variant: 'default',
        ...options,
        resolve: (value) => {
          resolve(value);
          dispatch({ request: null });
        },
      },
    });
  });
}

function useConfirmState() {
  const [state, setState] = useState(memoryState);
  useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) listeners.splice(index, 1);
    };
  }, []);
  return state;
}

function useConfirm() {
  return confirm;
}

// `confirm` can be imported and called directly outside components too
// (it's a plain module-level function, not a hook) — most call sites will
// just do `import { confirm } from '@/hooks/use-confirm'`.
export { useConfirm, useConfirmState, confirm };
