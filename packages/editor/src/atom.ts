/**
 * Minimal observable value — the editor's UI state container.
 * Framework-agnostic; React binds to it with useSyncExternalStore.
 */
export type Listener = () => void;

export class Atom<T extends object> {
  private value: T;
  private readonly listeners = new Set<Listener>();

  constructor(initial: T) {
    this.value = initial;
  }

  get(): T {
    return this.value;
  }

  /** Shallow-merges a patch (or the result of an updater). No-op patches do not notify. */
  set(patch: Partial<T> | ((current: T) => Partial<T>)): void {
    const p = typeof patch === 'function' ? patch(this.value) : patch;
    let changed = false;
    for (const key of Object.keys(p) as (keyof T)[]) {
      if (!Object.is(this.value[key], p[key])) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.value = { ...this.value, ...p };
    for (const listener of [...this.listeners]) listener();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
