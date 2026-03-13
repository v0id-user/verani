import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	safeSerialize,
	safeDeserialize,
	createShallowProxy,
	isStateReady,
	getPersistedState,
	setPeristErrorHandler,
	persistKey,
	deletePersistedKey,
	getPersistedKeys,
	clearPersistedState,
	initializePersistedState,
	PersistNotReadyError,
	PersistError,
	STATE_READY,
	PERSISTED_STATE,
	PERSIST_ERROR_HANDLER,
} from '../../../src/actor/persist';
import type { PersistableActor } from '../../../src/actor/persist';

// ============================================================================
// safeSerialize / safeDeserialize
// ============================================================================

describe('safeSerialize', () => {
	it('serializes plain objects', () => {
		const result = safeSerialize({ name: 'alice', score: 42 });
		expect(JSON.parse(result)).toEqual({ name: 'alice', score: 42 });
	});

	it('serializes arrays', () => {
		const result = safeSerialize([1, 2, 3]);
		expect(JSON.parse(result)).toEqual([1, 2, 3]);
	});

	it('serializes null', () => {
		expect(safeSerialize(null)).toBe('null');
	});

	it('serializes strings and numbers', () => {
		expect(safeSerialize('hello')).toBe('"hello"');
		expect(safeSerialize(42)).toBe('42');
	});

	it('serializes Date as ISO string (JSON.stringify calls toJSON first)', () => {
		const date = new Date('2025-01-01T00:00:00.000Z');
		const result = safeSerialize(date);
		expect(JSON.parse(result)).toBe('2025-01-01T00:00:00.000Z');
	});

	it('wraps RegExp instances', () => {
		const result = JSON.parse(safeSerialize(/foo/gi));
		expect(result).toEqual({ __type: 'RegExp', source: 'foo', flags: 'gi' });
	});

	it('wraps Map instances', () => {
		const map = new Map([['a', 1], ['b', 2]]);
		const result = JSON.parse(safeSerialize(map));
		expect(result).toEqual({ __type: 'Map', entries: [['a', 1], ['b', 2]] });
	});

	it('wraps Set instances', () => {
		const set = new Set([1, 2, 3]);
		const result = JSON.parse(safeSerialize(set));
		expect(result).toEqual({ __type: 'Set', values: [1, 2, 3] });
	});

	it('wraps Error instances', () => {
		const err = new TypeError('bad input');
		const result = JSON.parse(safeSerialize(err));
		expect(result).toEqual({ __type: 'Error', name: 'TypeError', message: 'bad input' });
	});

	it('handles circular references by skipping them', () => {
		const obj: Record<string, unknown> = { a: 1 };
		obj.self = obj;
		const result = JSON.parse(safeSerialize(obj));
		expect(result).toEqual({ a: 1 });
	});

	it('skips functions', () => {
		const obj = { a: 1, fn: () => {} };
		const result = JSON.parse(safeSerialize(obj));
		expect(result).toEqual({ a: 1 });
	});

	it('skips symbol values', () => {
		const obj = { a: 1, sym: Symbol('test') };
		const result = JSON.parse(safeSerialize(obj));
		expect(result).toEqual({ a: 1 });
	});

	it('handles nested special types', () => {
		const obj = {
			tags: new Set(['a', 'b']),
			meta: new Map([['k', 'v']]),
		};
		const result = JSON.parse(safeSerialize(obj));
		expect(result.tags.__type).toBe('Set');
		expect(result.meta.__type).toBe('Map');
	});
});

describe('safeDeserialize', () => {
	it('deserializes plain objects', () => {
		expect(safeDeserialize('{"a":1}')).toEqual({ a: 1 });
	});

	it('restores Date instances', () => {
		const json = JSON.stringify({ __type: 'Date', value: '2025-01-01T00:00:00.000Z' });
		const result = safeDeserialize(json);
		expect(result).toBeInstanceOf(Date);
		expect((result as Date).toISOString()).toBe('2025-01-01T00:00:00.000Z');
	});

	it('restores RegExp instances', () => {
		const json = JSON.stringify({ __type: 'RegExp', source: 'foo', flags: 'gi' });
		const result = safeDeserialize(json);
		expect(result).toBeInstanceOf(RegExp);
		expect((result as RegExp).source).toBe('foo');
		expect((result as RegExp).flags).toBe('gi');
	});

	it('restores Map instances', () => {
		const json = JSON.stringify({ __type: 'Map', entries: [['a', 1], ['b', 2]] });
		const result = safeDeserialize(json);
		expect(result).toBeInstanceOf(Map);
		expect((result as Map<string, number>).get('a')).toBe(1);
		expect((result as Map<string, number>).get('b')).toBe(2);
	});

	it('restores Set instances', () => {
		const json = JSON.stringify({ __type: 'Set', values: [1, 2, 3] });
		const result = safeDeserialize(json);
		expect(result).toBeInstanceOf(Set);
		expect((result as Set<number>).has(1)).toBe(true);
		expect((result as Set<number>).size).toBe(3);
	});

	it('restores Error instances', () => {
		const json = JSON.stringify({ __type: 'Error', name: 'TypeError', message: 'bad' });
		const result = safeDeserialize(json);
		expect(result).toBeInstanceOf(Error);
		expect((result as Error).name).toBe('TypeError');
		expect((result as Error).message).toBe('bad');
	});

	it('round-trips Map, Set, RegExp, and Error through serialize/deserialize', () => {
		const original = {
			name: 'test',
			pattern: /hello/i,
			items: new Set([1, 2]),
			meta: new Map([['k', 'v']]),
		};
		const restored = safeDeserialize(safeSerialize(original)) as typeof original;
		expect(restored.name).toBe('test');
		expect(restored.pattern).toBeInstanceOf(RegExp);
		expect(restored.items).toBeInstanceOf(Set);
		expect(restored.meta).toBeInstanceOf(Map);
	});

	it('leaves unknown __type values as-is', () => {
		const json = JSON.stringify({ __type: 'Custom', data: 42 });
		const result = safeDeserialize(json) as Record<string, unknown>;
		expect(result.__type).toBe('Custom');
		expect(result.data).toBe(42);
	});
});

// ============================================================================
// createShallowProxy
// ============================================================================

describe('createShallowProxy', () => {
	it('triggers onSet when a property is set', () => {
		const onSet = vi.fn();
		const onDelete = vi.fn();
		const proxy = createShallowProxy({ a: 1 } as Record<string, number>, onSet, onDelete);

		proxy.a = 2;
		expect(onSet).toHaveBeenCalledWith('a', 2);
		expect(proxy.a).toBe(2);
	});

	it('triggers onSet for new properties', () => {
		const onSet = vi.fn();
		const onDelete = vi.fn();
		const proxy = createShallowProxy({} as Record<string, number>, onSet, onDelete);

		proxy.newKey = 42;
		expect(onSet).toHaveBeenCalledWith('newKey', 42);
	});

	it('triggers onDelete when a property is deleted', () => {
		const onSet = vi.fn();
		const onDelete = vi.fn();
		const proxy = createShallowProxy({ a: 1 } as Record<string, number>, onSet, onDelete);

		delete proxy.a;
		expect(onDelete).toHaveBeenCalledWith('a');
	});

	it('does not trigger callbacks for symbol keys', () => {
		const onSet = vi.fn();
		const onDelete = vi.fn();
		const sym = Symbol('test');
		const proxy = createShallowProxy({} as Record<symbol, number>, onSet, onDelete);

		(proxy as any)[sym] = 1;
		expect(onSet).not.toHaveBeenCalled();
	});

	it('reads values through the proxy', () => {
		const onSet = vi.fn();
		const onDelete = vi.fn();
		const proxy = createShallowProxy({ x: 10, y: 20 }, onSet, onDelete);

		expect(proxy.x).toBe(10);
		expect(proxy.y).toBe(20);
	});
});

// ============================================================================
// Error classes
// ============================================================================

describe('PersistNotReadyError', () => {
	it('includes the key name in the message', () => {
		const err = new PersistNotReadyError('count');
		expect(err.message).toContain('count');
		expect(err.name).toBe('PersistNotReadyError');
	});
});

describe('PersistError', () => {
	it('wraps the original error', () => {
		const cause = new Error('storage full');
		const err = new PersistError('data', cause);
		expect(err.message).toContain('data');
		expect(err.message).toContain('storage full');
		expect(err.name).toBe('PersistError');
		expect(err.originalCause).toBe(cause);
	});
});

// ============================================================================
// State helpers
// ============================================================================

function createMockActor(storage?: Record<string, unknown>): PersistableActor {
	const store = new Map<string, unknown>(Object.entries(storage ?? {}));
	return {
		ctx: {
			storage: {
				get: vi.fn(async (key: string) => store.get(key)),
				put: vi.fn(async (key: string, value: unknown) => { store.set(key, value); }),
				delete: vi.fn(async (keyOrKeys: string | string[]) => {
					if (Array.isArray(keyOrKeys)) {
						keyOrKeys.forEach(k => store.delete(k));
					} else {
						store.delete(keyOrKeys);
					}
				}),
				list: vi.fn(async (opts?: { prefix?: string }) => {
					const prefix = opts?.prefix ?? '';
					const result = new Map<string, unknown>();
					for (const [k, v] of store) {
						if (k.startsWith(prefix)) result.set(k, v);
					}
					return result;
				}),
			} as unknown as DurableObjectStorage,
		},
	};
}

describe('isStateReady', () => {
	it('returns false when state is not initialized', () => {
		const actor = createMockActor();
		expect(isStateReady(actor)).toBe(false);
	});

	it('returns true after state is marked ready', () => {
		const actor = createMockActor();
		actor[STATE_READY] = true;
		expect(isStateReady(actor)).toBe(true);
	});
});

describe('getPersistedState', () => {
	it('throws PersistNotReadyError when state is not ready', () => {
		const actor = createMockActor();
		expect(() => getPersistedState(actor)).toThrow(PersistNotReadyError);
	});

	it('returns persisted state when ready', () => {
		const actor = createMockActor();
		const state = { count: 0 };
		actor[STATE_READY] = true;
		actor[PERSISTED_STATE] = state;
		expect(getPersistedState(actor)).toBe(state);
	});
});

describe('setPeristErrorHandler', () => {
	it('sets the error handler on the actor', () => {
		const actor = createMockActor();
		const handler = vi.fn();
		setPeristErrorHandler(actor, handler);
		expect(actor[PERSIST_ERROR_HANDLER]).toBe(handler);
	});
});

// ============================================================================
// Storage operations
// ============================================================================

describe('persistKey', () => {
	it('serializes and stores the value', async () => {
		const actor = createMockActor();
		await persistKey(actor, 'count', 42);
		expect(actor.ctx.storage.put).toHaveBeenCalledWith(
			'_verani_persist:count',
			safeSerialize(42),
		);
	});
});

describe('deletePersistedKey', () => {
	it('deletes the key from storage', async () => {
		const actor = createMockActor();
		await deletePersistedKey(actor, 'count');
		expect(actor.ctx.storage.delete).toHaveBeenCalledWith('_verani_persist:count');
	});
});

describe('getPersistedKeys', () => {
	it('returns keys stripped of the prefix', async () => {
		const actor = createMockActor({
			'_verani_persist:count': '42',
			'_verani_persist:name': '"alice"',
			'other_key': 'ignored',
		});
		const keys = await getPersistedKeys(actor);
		expect(keys).toEqual(['count', 'name']);
	});

	it('returns empty array when no persisted keys exist', async () => {
		const actor = createMockActor();
		const keys = await getPersistedKeys(actor);
		expect(keys).toEqual([]);
	});
});

describe('clearPersistedState', () => {
	it('deletes all persisted keys from storage', async () => {
		const actor = createMockActor({
			'_verani_persist:a': '1',
			'_verani_persist:b': '2',
		});
		await clearPersistedState(actor);
		expect(actor.ctx.storage.delete).toHaveBeenCalledWith([
			'_verani_persist:a',
			'_verani_persist:b',
		]);
	});
});

// ============================================================================
// initializePersistedState
// ============================================================================

describe('initializePersistedState', () => {
	it('returns initial state when no stored values exist', async () => {
		const actor = createMockActor();
		const state = await initializePersistedState(actor, { count: 0, name: 'default' });
		expect(state.count).toBe(0);
		expect(state.name).toBe('default');
	});

	it('marks the actor state as ready', async () => {
		const actor = createMockActor();
		await initializePersistedState(actor, { count: 0 });
		expect(isStateReady(actor)).toBe(true);
	});

	it('loads stored values over initial state', async () => {
		const actor = createMockActor({
			'_verani_persist:count': safeSerialize(99),
		});
		const state = await initializePersistedState(actor, { count: 0 });
		expect(state.count).toBe(99);
	});

	it('only tracks specified keys when persistedKeys is provided', async () => {
		const actor = createMockActor({
			'_verani_persist:count': safeSerialize(5),
			'_verani_persist:name': safeSerialize('stored'),
		});
		const state = await initializePersistedState(
			actor,
			{ count: 0, name: 'default' },
			['count'],
		);
		expect(state.count).toBe(5);
		expect(state.name).toBe('default');
	});

	it('persists on property set via shallow proxy', async () => {
		const actor = createMockActor();
		const state = await initializePersistedState(actor, { count: 0 });

		state.count = 10;

		// Give the async persist a tick
		await new Promise(r => setTimeout(r, 0));
		expect(actor.ctx.storage.put).toHaveBeenCalledWith(
			'_verani_persist:count',
			safeSerialize(10),
		);
	});

	it('falls back to initial value on corrupted stored data', async () => {
		// The inner PersistError is caught by the outer catch which doesn't re-throw PersistErrors
		const actor = createMockActor({
			'_verani_persist:count': 'not valid json {{{',
		});
		const state = await initializePersistedState(actor, { count: 0 });
		expect(state.count).toBe(0);
	});

	it('falls back to initial value on corrupted data when throwOnError is false', async () => {
		const actor = createMockActor({
			'_verani_persist:count': 'not valid json {{{',
		});
		const state = await initializePersistedState(
			actor,
			{ count: 0 },
			[],
			{ throwOnError: false },
		);
		expect(state.count).toBe(0);
	});
});
