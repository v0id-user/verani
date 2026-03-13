import { describe, it, expect, vi } from 'vitest';
import { defineContract, payload } from '../../../src/typed/contract';
import { withValidation } from '../../../src/typed/validation';

// Mock @cloudflare/actors to prevent cloudflare:workers resolution
vi.mock('@cloudflare/actors', () => ({
	Actor: class {},
}));

// Mock the connection-actor to avoid actor layer dependencies
vi.mock('../../../src/actor/connection-actor', () => ({
	defineConnection: vi.fn((def: any) => {
		const handlers = new Map();
		return {
			...def,
			handlers,
			on(event: string, handler: Function) {
				handlers.set(event, handler);
			},
			off(event: string) {
				handlers.delete(event);
			},
		};
	}),
}));

// Mock attachment module (imported by connection-actor)
vi.mock('../../../src/actor/attachment', () => ({}));

import { createTypedConnection } from '../../../src/typed/server';

const chatContract = defineContract({
	serverEvents: {
		'chat.message': payload<{ from: string; text: string }>(),
		'user.joined': payload<{ userId: string }>(),
	},
	clientEvents: {
		'message.send': payload<{ text: string }>(),
		'typing.start': payload<{}>(),
	},
});

describe('createTypedConnection', () => {
	it('returns a typed connection with on, off, definition, and contract', () => {
		const conn = createTypedConnection(chatContract, {});
		expect(conn.on).toBeTypeOf('function');
		expect(conn.off).toBeTypeOf('function');
		expect(conn.definition).toBeDefined();
		expect(conn.contract).toBe(chatContract);
	});

	it('exposes the underlying definition', () => {
		const conn = createTypedConnection(chatContract, {
			websocketPath: '/ws/chat',
		});
		expect(conn.definition).toBeDefined();
	});

	it('registers event handlers via on()', () => {
		const conn = createTypedConnection(chatContract, {});
		const handler = vi.fn();

		conn.on('message.send', handler);

		const def = conn.definition as any;
		expect(def.handlers.has('message.send')).toBe(true);
	});

	it('removes event handlers via off()', () => {
		const conn = createTypedConnection(chatContract, {});
		const handler = vi.fn();

		conn.on('message.send', handler);
		conn.off('message.send');

		const def = conn.definition as any;
		expect(def.handlers.has('message.send')).toBe(false);
	});

	it('passes config options to the underlying definition', () => {
		const extractMeta = vi.fn();
		const conn = createTypedConnection(chatContract, {
			name: 'test-chat',
			websocketPath: '/ws/test',
			extractMeta,
		});

		const def = conn.definition as any;
		expect(def.name).toBe('test-chat');
		expect(def.websocketPath).toBe('/ws/test');
		expect(def.extractMeta).toBe(extractMeta);
	});

	it('defaults websocketPath to /ws', () => {
		const conn = createTypedConnection(chatContract, {});
		const def = conn.definition as any;
		expect(def.websocketPath).toBe('/ws');
	});

	it('wraps onConnect with typed context', () => {
		const onConnect = vi.fn();
		const conn = createTypedConnection(chatContract, { onConnect });
		const def = conn.definition as any;

		expect(def.onConnect).toBeTypeOf('function');
	});

	it('wraps onDisconnect with typed context', () => {
		const onDisconnect = vi.fn();
		const conn = createTypedConnection(chatContract, { onDisconnect });
		const def = conn.definition as any;

		expect(def.onDisconnect).toBeTypeOf('function');
	});

	it('wraps onError with typed context', () => {
		const onError = vi.fn();
		const conn = createTypedConnection(chatContract, { onError });
		const def = conn.definition as any;

		expect(def.onError).toBeTypeOf('function');
	});

	it('passes onHibernationRestore through directly', () => {
		const onHibernationRestore = vi.fn();
		const conn = createTypedConnection(chatContract, { onHibernationRestore });
		const def = conn.definition as any;

		expect(def.onHibernationRestore).toBe(onHibernationRestore);
	});

	it('invokes handler with typed message context when event fires', () => {
		const conn = createTypedConnection(chatContract, {});
		const handler = vi.fn();
		conn.on('message.send', handler);

		const def = conn.definition as any;
		const registeredHandler = def.handlers.get('message.send');

		const mockBaseCtx = {
			actor: {},
			ws: null,
			meta: { userId: 'u1', clientId: 'c1', channels: ['default'] },
			emit: {
				emit: vi.fn(),
				to: vi.fn(() => ({ emit: vi.fn() })),
				toRoom: vi.fn(() => ({ emit: vi.fn() })),
				toUser: vi.fn(() => ({ emit: vi.fn() })),
			},
			state: {},
		};

		registeredHandler(mockBaseCtx, { text: 'hello' });

		expect(handler).toHaveBeenCalledOnce();
		const [ctx, data] = handler.mock.calls[0];
		expect(ctx.meta.userId).toBe('u1');
		expect(ctx.frame.type).toBe('message.send');
		expect(ctx.frame.data).toEqual({ text: 'hello' });
		expect(data).toEqual({ text: 'hello' });
	});
});

describe('createTypedConnection with validation', () => {
	it('blocks invalid data when contract has validators', () => {
		const validated = withValidation(chatContract, {
			clientEvents: {
				'message.send': {
					safeParse: (data: unknown) => {
						if (typeof data === 'object' && data !== null && 'text' in data) {
							return { success: true as const, data: data as { text: string } };
						}
						return { success: false as const, error: { issues: [{ message: 'missing text' }] } };
					},
				},
			},
		});

		const conn = createTypedConnection(validated, {});
		const handler = vi.fn();
		conn.on('message.send', handler);

		const def = conn.definition as any;
		const registeredHandler = def.handlers.get('message.send');

		const mockBaseCtx = {
			actor: {},
			ws: null,
			meta: { userId: 'u1', clientId: 'c1', channels: ['default'] },
			emit: {
				emit: vi.fn(),
				to: vi.fn(() => ({ emit: vi.fn() })),
				toRoom: vi.fn(() => ({ emit: vi.fn() })),
				toUser: vi.fn(() => ({ emit: vi.fn() })),
			},
			state: {},
		};

		// Invalid data — handler should not be called
		registeredHandler(mockBaseCtx, { wrong: 'field' });
		expect(handler).not.toHaveBeenCalled();

		// Valid data — handler should be called
		registeredHandler(mockBaseCtx, { text: 'hello' });
		expect(handler).toHaveBeenCalledOnce();
	});
});
