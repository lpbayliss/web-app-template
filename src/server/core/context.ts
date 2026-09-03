import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Well-known keys. Anything else is allowed (`Context.set("orderId", id)`), but declaring
 * a key here gives it a type at the call site.
 */
export interface ContextValues {
  requestId: string;
  userId: string;
  sessionId: string;
  method: string;
  path: string;
  transport: "http" | "ws" | "job";
  jobId: string;
  jobName: string;
}

type Store = Map<string, unknown>;
type Seed = Partial<ContextValues> & Record<string, unknown>;

interface ContextApi {
  /** Start a new context scope; `seed` values are visible for the duration of `fn`. */
  run<T>(seed: Seed, fn: () => T): T;
  /** True when called inside a `Context.run` scope. */
  active(): boolean;
  /** Set a value in the current scope. Returns false (and does nothing) outside a scope. */
  set<K extends keyof ContextValues>(key: K, value: ContextValues[K] | undefined): boolean;
  set(key: string, value: unknown): boolean;
  get<K extends keyof ContextValues>(key: K): ContextValues[K] | undefined;
  get<T = unknown>(key: string): T | undefined;
  /** Shallow copy of everything in the current scope (empty outside a scope). */
  snapshot(): Record<string, unknown>;
}

const storage = new AsyncLocalStorage<Store>();

/**
 * Request-scoped context backed by AsyncLocalStorage. Every value set inside a
 * `Context.run` boundary follows the async call chain (awaits, timers, DB calls)
 * and is attached to every log line emitted from within it.
 */
export const Context: ContextApi = {
  run(seed, fn) {
    return storage.run(new Map(Object.entries(seed)), fn);
  },
  active() {
    return storage.getStore() !== undefined;
  },
  set(key: string, value: unknown) {
    const store = storage.getStore();
    if (!store) return false;
    if (value === undefined) store.delete(key);
    else store.set(key, value);
    return true;
  },
  get(key: string) {
    return storage.getStore()?.get(key);
  },
  snapshot() {
    const store = storage.getStore();
    return store ? Object.fromEntries(store) : {};
  },
};
