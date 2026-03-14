/**
 * Safe persistence utilities for Verani actors.
 *
 * Provides a safer wrapper around Cloudflare's @Persist decorator,
 * addressing deep proxy complexity, silent error swallowing,
 * and race conditions during storage initialization.
 */

export const STORAGE_INITIALIZED = Symbol('STORAGE_INITIALIZED');
export const PERSIST_ERROR_HANDLER = Symbol('PERSIST_ERROR_HANDLER');
export const PERSISTED_STATE = Symbol('PERSISTED_STATE');
export const STATE_READY = Symbol('STATE_READY');

export class PersistNotReadyError extends Error {
  constructor(key: string) {
    super(`Cannot access persisted state key "${key}" before storage is initialized. ` +
          `Wait for onInit to complete or check actor.isStateReady().`);
    this.name = 'PersistNotReadyError';
  }
}

export class PersistError extends Error {
  readonly originalCause: Error;

  constructor(key: string, cause: Error) {
    super(`Failed to persist key "${key}": ${cause.message}`);
    this.name = 'PersistError';
    this.originalCause = cause;
  }
}

export interface SafePersistOptions {
  /** If true, only track top-level property changes. Default: true */
  shallow?: boolean;
  /** If true, throw errors instead of swallowing them. Default: true */
  throwOnError?: boolean;
}

export function safeSerialize(value: unknown): string {
  const seen = new WeakSet();

  return JSON.stringify(value, (key, val) => {
    if (val instanceof Date) {
      return { __type: 'Date', value: val.toISOString() };
    }
    if (val instanceof RegExp) {
      return { __type: 'RegExp', source: val.source, flags: val.flags };
    }
    if (val instanceof Map) {
      return { __type: 'Map', entries: Array.from(val.entries()) };
    }
    if (val instanceof Set) {
      return { __type: 'Set', values: Array.from(val.values()) };
    }
    if (val instanceof Error) {
      return { __type: 'Error', name: val.name, message: val.message };
    }

    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) return undefined;
      seen.add(val);
    }

    if (typeof val === 'function' || typeof val === 'symbol') {
      return undefined;
    }

    return val;
  });
}

export function safeDeserialize(json: string): unknown {
  return JSON.parse(json, (_key, val) => {
    if (val && typeof val === 'object' && val.__type) {
      switch (val.__type) {
        case 'Date':
          return new Date(val.value);
        case 'RegExp':
          return new RegExp(val.source, val.flags);
        case 'Map':
          return new Map(val.entries);
        case 'Set':
          return new Set(val.values);
        case 'Error': {
          const err = new Error(val.message);
          err.name = val.name;
          return err;
        }
      }
    }
    return val;
  });
}

export function createShallowProxy<T extends object>(
  target: T,
  onSet: (key: string | symbol, value: unknown) => void,
  onDelete: (key: string | symbol) => void
): T {
  return new Proxy(target, {
    set(obj, key, value) {
      const result = Reflect.set(obj, key, value);
      if (result && typeof key === 'string') {
        onSet(key, value);
      }
      return result;
    },
    deleteProperty(obj, key) {
      const result = Reflect.deleteProperty(obj, key);
      if (result && typeof key === 'string') {
        onDelete(key);
      }
      return result;
    }
  });
}

export interface PersistableActor {
  ctx: { storage: DurableObjectStorage };
  [STATE_READY]?: boolean;
  [PERSISTED_STATE]?: Record<string, unknown>;
  [PERSIST_ERROR_HANDLER]?: (key: string, error: Error) => void;
}

export async function initializePersistedState<T extends Record<string, unknown>>(
  actor: PersistableActor,
  initialState: T,
  persistedKeys: (keyof T)[] = [],
  options: SafePersistOptions = {}
): Promise<T> {
  const { shallow = true, throwOnError = true } = options;
  const storage = actor.ctx.storage;
  const keysToTrack = persistedKeys.length > 0
    ? persistedKeys.map(String)
    : Object.keys(initialState);

  const state = { ...initialState };

  for (const key of keysToTrack) {
    try {
      const stored = await storage.get<string>(`_verani_persist:${key}`);
      if (stored !== undefined) {
        try {
          (state as Record<string, unknown>)[key] = safeDeserialize(stored);
        } catch (parseErr) {
          if (throwOnError) {
            throw new PersistError(key, parseErr as Error);
          }
        }
      }
    } catch (err) {
      if (throwOnError && !(err instanceof PersistError)) {
        throw new PersistError(key, err as Error);
      }
    }
  }

  const persistKeyFn = async (key: string, value: unknown) => {
    if (!keysToTrack.includes(key)) return;

    try {
      const serialized = safeSerialize(value);
      await storage.put(`_verani_persist:${key}`, serialized);
    } catch (err) {
      const errorHandler = actor[PERSIST_ERROR_HANDLER];
      if (errorHandler) {
        errorHandler(key, err as Error);
      }

      if (throwOnError) {
        throw new PersistError(key, err as Error);
      }
    }
  };

  const deleteKeyFn = async (key: string) => {
    if (!keysToTrack.includes(key)) return;

    try {
      await storage.delete(`_verani_persist:${key}`);
    } catch (err) {
      const errorHandler = actor[PERSIST_ERROR_HANDLER];
      if (errorHandler) {
        errorHandler(key, err as Error);
      }

      if (throwOnError) {
        throw new PersistError(key, err as Error);
      }
    }
  };

  let proxiedState: T;

  if (shallow) {
    proxiedState = createShallowProxy(
      state,
      (key, value) => { persistKeyFn(String(key), value); },
      (key) => { deleteKeyFn(String(key)); }
    );
  } else {
    proxiedState = createDeepProxy(
      state,
      (key, value) => { persistKeyFn(key, value); },
      (key) => { deleteKeyFn(key); },
      keysToTrack
    );
  }

  actor[STATE_READY] = true;
  actor[PERSISTED_STATE] = proxiedState;

  return proxiedState;
}

function createDeepProxy<T extends object>(
  target: T,
  onSet: (rootKey: string, value: unknown) => void,
  onDelete: (rootKey: string) => void,
  trackedKeys: string[],
  rootKey?: string
): T {
  return new Proxy(target, {
    get(obj, key) {
      const value = Reflect.get(obj, key);

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const keyToTrack = rootKey ?? String(key);
        if (trackedKeys.includes(keyToTrack) || rootKey !== undefined) {
          return createDeepProxy(
            value as object,
            onSet,
            onDelete,
            trackedKeys,
            keyToTrack
          );
        }
      }

      return value;
    },

    set(obj, key, value) {
      const result = Reflect.set(obj, key, value);

      if (result) {
        const keyToTrack = rootKey ?? String(key);
        if (trackedKeys.includes(keyToTrack)) {
          if (rootKey) {
            onSet(rootKey, undefined);
          } else {
            onSet(String(key), value);
          }
        }
      }

      return result;
    },

    deleteProperty(obj, key) {
      const result = Reflect.deleteProperty(obj, key);

      if (result) {
        const keyToTrack = rootKey ?? String(key);
        if (trackedKeys.includes(keyToTrack)) {
          if (rootKey) {
            onSet(rootKey, undefined);
          } else {
            onDelete(String(key));
          }
        }
      }

      return result;
    }
  });
}

export function isStateReady(actor: PersistableActor): boolean {
  return actor[STATE_READY] === true;
}

export function getPersistedState<T extends Record<string, unknown>>(
  actor: PersistableActor
): T {
  if (!isStateReady(actor)) {
    throw new PersistNotReadyError('state');
  }
  return actor[PERSISTED_STATE] as T;
}

export function setPeristErrorHandler(
  actor: PersistableActor,
  handler: (key: string, error: Error) => void
): void {
  actor[PERSIST_ERROR_HANDLER] = handler;
}

export async function persistKey(
  actor: PersistableActor,
  key: string,
  value: unknown
): Promise<void> {
  const serialized = safeSerialize(value);
  await actor.ctx.storage.put(`_verani_persist:${key}`, serialized);
}

export async function deletePersistedKey(
  actor: PersistableActor,
  key: string
): Promise<void> {
  await actor.ctx.storage.delete(`_verani_persist:${key}`);
}

export async function getPersistedKeys(
  actor: PersistableActor
): Promise<string[]> {
  const map = await actor.ctx.storage.list({ prefix: '_verani_persist:' });
  return Array.from(map.keys()).map(k => k.replace('_verani_persist:', ''));
}

export async function clearPersistedState(
  actor: PersistableActor
): Promise<void> {
  const map = await actor.ctx.storage.list({ prefix: '_verani_persist:' });
  const keys = Array.from(map.keys());
  await actor.ctx.storage.delete(keys);
}
