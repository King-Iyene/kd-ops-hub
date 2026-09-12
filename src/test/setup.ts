import "@testing-library/jest-dom";

// jsdom's built-in localStorage is broken under this Node version (26,
// experimental Web Storage support) — window.localStorage silently comes
// back `undefined` even with a real document origin configured, printing
// Node's own "--localstorage-file was not provided" warning instead of
// throwing anywhere useful. Polyfill a minimal, real Storage implementation
// so any test touching localStorage (org timezone cache, etc.) gets a
// working one rather than failing on "Cannot read properties of undefined".
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null; }
  key(index: number) { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string) { this.store.delete(key); }
  setItem(key: string, value: string) { this.store.set(key, String(value)); }
}
if (typeof window !== "undefined" && !window.localStorage) {
  Object.defineProperty(window, "localStorage", { value: new MemoryStorage(), writable: true });
}
if (typeof globalThis.localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", { value: window.localStorage, writable: true });
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
