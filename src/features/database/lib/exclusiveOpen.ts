// Only one list can be open at a time: opening a new one closes the one that was open.
export function createExclusiveOpen() {
  let active: (() => void) | null = null;
  return {
    claim(close: () => void) {
      if (active && active !== close) active();
      active = close;
    },
    release(close: () => void) {
      if (active === close) active = null;
    },
  };
}
