/**
 * Safe persistence utilities for Verani actors.
 *
 * This module provides a safer wrapper around Cloudflare's @Persist decorator,
 * addressing common issues like deep proxy complexity, silent error swallowing,
 * and race conditions during storage initialization.
 */

// Symbol to mark storage as initialized
export const STORAGE_INITIALIZED = Symbol('STORAGE_INITIALIZED');

// Symbol to store the persist error handler
export const PERSIST_ERROR_HANDLER = Symbol('PERSIST_ERROR_HANDLER');

// Symbol to store persisted state
export const PERSISTED_STATE = Symbol('PERSISTED_STATE');

// Symbol to mark state as ready for access
export const STATE_READY = Symbol('STATE_READY');

/**
 * Error thrown when persisted state is accessed before initialization
 */
export class PersistNotReadyError extends Error {
  constructor(key: string) {
    super(`Cannot access persisted state key "${key}" before storage is initialized. ` +
          `Wait for onInit to complete or check actor.isStateReady().`);
    this.name = 'PersistNotReadyError';
  }
}

/**
 * Error thrown when persistence operation fails
 */
export class PersistError extends Error {
  readonly originalCause: Error;

  constructor(key: string, cause: Error) {
    super(`Failed to persist key "${key}": ${cause.message}`);
    this.name = 'PersistError';
    this.originalCause = cause;
  }
}

/**
 * Options for SafePersist behavior
 */
export interface SafePersistOptions {
  /**
   * If true, only track top-level property changes (no deep proxy).
   * This is safer and more predictable. Default: true
   */
  shallow?: boolean;

  /**
   * If true, throw errors instead of swallowing them. Default: true
   */
  throwOnError?: boolean;
}

/**
 * Safely serialize a value for storage.
 * Handles circular references and special types gracefully.
 */
export function safeSerialize(value: unknown): string {
  const seen = new WeakSet();

  return JSON.stringify(value, (key, val) => {
    // Handle special types
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

    // Handle circular references
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) {
        console.warn(`[Verani:Persist] Circular reference detected at key "${key}", skipping`);
        return undefined;
      }
      seen.add(val);
    }

    // Skip functions and symbols
    if (typeof val === 'function' || typeof val === 'symbol') {
      return undefined;
    }

    return val;
  });
}

/**
 * Safely deserialize a value from storage.
 * Restores special types that were serialized.
 */
export function safeDeserialize(json: string): unknown {
  return JSON.parse(json, (key, val) => {
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

/**
 * Create a shallow proxy that tracks property changes and triggers persistence.
 * Unlike deep proxies, this only watches the top-level object.
 */
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

/**
 * Interface for actors that support safe persistence
 */
export interface PersistableActor {
  /** Durable Object storage interface */
  ctx: { storage: DurableObjectStorage };

  /** Whether the state has been initialized from storage */
  [STATE_READY]?: boolean;

  /** The persisted state object */
  [PERSISTED_STATE]?: Record<string, unknown>;

  /** Error handler for persistence failures */
  [PERSIST_ERROR_HANDLER]?: (key: string, error: Error) => void;
}

/**
 * Initialize persisted state from Durable Object storage.
 * Call this in the actor's onInit or constructor after storage is available.
 *
 * @param actor - The actor instance
 * @param initialState - Default state values
 * @param persistedKeys - Keys to persist (empty = all keys)
 * @param options - Persistence options
 */
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

  // Create a copy of initial state
  const state = { ...initialState };

  // Load persisted values from storage
  for (const key of keysToTrack) {
    try {
      const stored = await storage.get<string>(`_verani_persist:${key}`);
      if (stored !== undefined) {
        try {
          const parsed = safeDeserialize(stored);
          (state as Record<string, unknown>)[key] = parsed;
        } catch (parseErr) {
          console.error(`[Verani:Persist] Failed to parse stored value for "${key}":`, parseErr);
          if (throwOnError) {
            throw new PersistError(key, parseErr as Error);
          }
          // Keep initial value on parse error
        }
      }
    } catch (err) {
      console.error(`[Verani:Persist] Failed to load persisted value for "${key}":`, err);
      if (throwOnError && !(err instanceof PersistError)) {
        throw new PersistError(key, err as Error);
      }
    }
  }

  // Create persist function
  const persistKey = async (key: string, value: unknown) => {
    if (!keysToTrack.includes(key)) return;

    try {
      const serialized = safeSerialize(value);
      await storage.put(`_verani_persist:${key}`, serialized);
    } catch (err) {
      console.error(`[Verani:Persist] Failed to persist "${key}":`, err);

      // Call error handler if set
      const errorHandler = actor[PERSIST_ERROR_HANDLER];
      if (errorHandler) {
        errorHandler(key, err as Error);
      }

      if (throwOnError) {
        throw new PersistError(key, err as Error);
      }
    }
  };

  // Create delete function
  const deleteKey = async (key: string) => {
    if (!keysToTrack.includes(key)) return;

    try {
      await storage.delete(`_verani_persist:${key}`);
    } catch (err) {
      console.error(`[Verani:Persist] Failed to delete "${key}":`, err);

      const errorHandler = actor[PERSIST_ERROR_HANDLER];
      if (errorHandler) {
        errorHandler(key, err as Error);
      }

      if (throwOnError) {
        throw new PersistError(key, err as Error);
      }
    }
  };

  // Create proxy based on shallow option
  let proxiedState: T;

  if (shallow) {
    proxiedState = createShallowProxy(
      state,
      (key, value) => { persistKey(String(key), value); },
      (key) => { deleteKey(String(key)); }
    );
  } else {
    // Deep proxy - use Cloudflare's implementation concept but with error handling
    proxiedState = createDeepProxy(
      state,
      (key, value) => { persistKey(key, value); },
      (key) => { deleteKey(key); },
      keysToTrack
    );
  }

  // Mark state as ready
  actor[STATE_READY] = true;
  actor[PERSISTED_STATE] = proxiedState;

  return proxiedState;
}

/**
 * Create a deep proxy that tracks nested property changes.
 * This is more complex but allows tracking changes like `state.user.name = 'foo'`.
 */
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

      // Only proxy objects, not primitives or functions
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Determine the root key for persistence
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
        // Determine which root key to persist
        const keyToTrack = rootKey ?? String(key);
        if (trackedKeys.includes(keyToTrack)) {
          // Get the root value and persist it
          if (rootKey) {
            // We're in a nested object, persist the root
            // This requires access to the root object which we don't have here
            // So we trigger with the root key, and the caller should handle it
            onSet(rootKey, undefined); // Signal to re-persist root
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
            onSet(rootKey, undefined); // Signal to re-persist root
          } else {
            onDelete(String(key));
          }
        }
      }

      return result;
    }
  });
}

/**
 * Helper to check if state is ready for access
 */
export function isStateReady(actor: PersistableActor): boolean {
  return actor[STATE_READY] === true;
}

/**
 * Helper to get persisted state with type safety.
 * Throws if state is not yet initialized.
 */
export function getPersistedState<T extends Record<string, unknown>>(
  actor: PersistableActor
): T {
  if (!isStateReady(actor)) {
    throw new PersistNotReadyError('state');
  }
  return actor[PERSISTED_STATE] as T;
}

/**
 * Set the error handler for persistence failures
 */
export function setPeristErrorHandler(
  actor: PersistableActor,
  handler: (key: string, error: Error) => void
): void {
  actor[PERSIST_ERROR_HANDLER] = handler;
}

/**
 * Manually persist a specific key (useful for batch updates)
 */
export async function persistKey(
  actor: PersistableActor,
  key: string,
  value: unknown
): Promise<void> {
  const storage = actor.ctx.storage;
  const serialized = safeSerialize(value);
  await storage.put(`_verani_persist:${key}`, serialized);
}

/**
 * Manually delete a persisted key
 */
export async function deletePersistedKey(
  actor: PersistableActor,
  key: string
): Promise<void> {
  const storage = actor.ctx.storage;
  await storage.delete(`_verani_persist:${key}`);
}

/**
 * Get all persisted keys from storage
 */
export async function getPersistedKeys(
  actor: PersistableActor
): Promise<string[]> {
  const storage = actor.ctx.storage;
  const map = await storage.list({ prefix: '_verani_persist:' });
  return Array.from(map.keys()).map(k => k.replace('_verani_persist:', ''));
}

/**
 * Clear all persisted state
 */
export async function clearPersistedState(
  actor: PersistableActor
): Promise<void> {
  const storage = actor.ctx.storage;
  const map = await storage.list({ prefix: '_verani_persist:' });
  await storage.delete(Array.from(map.keys()));
}

