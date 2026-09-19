import { useEffect, useState } from 'react';

export interface PromptOptions {
  title?: string;
  description: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  minLength?: number;
  variant?: 'default' | 'destructive';
}

interface PromptRequest extends PromptOptions {
  id: string;
  resolve: (value: string | null) => void;
}

interface State {
  request: PromptRequest | null;
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

function prompt(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const id = genId();
    dispatch({
      request: {
        id,
        confirmLabel: 'Submit',
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

function usePromptState() {
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

function usePrompt() {
  return prompt;
}

export { usePrompt, usePromptState, prompt };
