import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@cloudflare/actors', () => ({
	Actor: class {
		ctx: unknown;
		env: unknown;

		constructor(ctx: unknown, env: unknown) {
			this.ctx = ctx;
			this.env = env;
		}
	},
}));

vi.mock('../../../src/actor/attachment', () => ({
	storeAttachment: vi.fn(),
}));

import { createConnectionHandler } from '../../../src/actor/connection-actor';

const WEBSOCKET_OPEN = 1;

function createMockStorage(initial: Record<string, unknown> = {}) {
	const store = new Map<string, unknown>(Object.entries(initial));

	return {
		get: vi.fn(async (key: string) => store.get(key)),
		put: vi.fn(async (key: string, value: unknown) => {
			store.set(key, value);
		}),
		delete: vi.fn(async (key: string | string[]) => {
			if (Array.isArray(key)) {
				for (const entry of key) {
					store.delete(entry);
				}
				return;
			}

			store.delete(key);
		}),
	};
}

function createMockContext() {
	const storage = createMockStorage();

	return {
		storage,
		acceptWebSocket: vi.fn(),
		getWebSockets: vi.fn(() => []),
	};
}

function createMockSocket() {
	return {
		readyState: WEBSOCKET_OPEN,
		close: vi.fn(),
		send: vi.fn(),
		deserializeAttachment: vi.fn(),
	} as unknown as WebSocket;
}

function createMockRoomStub() {
	return {
		join: vi.fn(async () => {}),
		leave: vi.fn(async () => {}),
		broadcast: vi.fn(async () => 1),
		getMembers: vi.fn(async () => []),
		getMemberCount: vi.fn(async () => 0),
		hasMember: vi.fn(async () => false),
	};
}

describe('createConnectionHandler room bindings', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('resolves room bindings by namespace prefix for dynamic room names', async () => {
		const roomStub = createMockRoomStub();
		const chatRoomBinding = {
			get: vi.fn(() => roomStub),
		};
		const Connection = createConnectionHandler({
			rooms: { conversation: 'ChatRoom' },
			extractMeta: () => ({
				userId: 'user-1',
				clientId: 'client-1',
				channels: ['default'],
			}),
		});
		const ctx = createMockContext();
		const actor = new Connection(ctx as never, { ChatRoom: chatRoomBinding } as never) as any;

		await actor.onInit();
		await actor.onWebSocketConnect(createMockSocket(), new Request('https://example.com/ws'));
		await actor.joinRoom('conversation:123', { role: 'member' });

		expect(chatRoomBinding.get).toHaveBeenCalledWith('conversation:123');
		expect(roomStub.join).toHaveBeenCalledWith('user-1', { role: 'member' });
		expect(ctx.storage.put).toHaveBeenCalledWith('_connection_rooms', [
			{ roomName: 'conversation:123', metadata: { role: 'member' } },
		]);
	});

	it('prefers exact room bindings over namespace matches', async () => {
		const exactRoomStub = createMockRoomStub();
		const namespaceRoomStub = createMockRoomStub();
		const specialRoomBinding = {
			get: vi.fn(() => exactRoomStub),
		};
		const chatRoomBinding = {
			get: vi.fn(() => namespaceRoomStub),
		};
		const Connection = createConnectionHandler({
			rooms: {
				conversation: 'ChatRoom',
				'conversation:123': 'SpecialRoom',
			},
			extractMeta: () => ({
				userId: 'user-1',
				clientId: 'client-1',
				channels: ['default'],
			}),
		});
		const actor = new Connection(createMockContext() as never, {
			ChatRoom: chatRoomBinding,
			SpecialRoom: specialRoomBinding,
		} as never) as any;

		await actor.onInit();
		await actor.onWebSocketConnect(createMockSocket(), new Request('https://example.com/ws'));
		await actor.joinRoom('conversation:123');

		expect(specialRoomBinding.get).toHaveBeenCalledWith('conversation:123');
		expect(chatRoomBinding.get).not.toHaveBeenCalled();
		expect(exactRoomStub.join).toHaveBeenCalledWith('user-1', undefined);
	});

	it('lets toRoom include the sender when requested', async () => {
		const roomStub = createMockRoomStub();
		const chatRoomBinding = {
			get: vi.fn(() => roomStub),
		};
		const Connection = createConnectionHandler({
			rooms: { conversation: 'ChatRoom' },
			extractMeta: () => ({
				userId: 'user-1',
				clientId: 'client-1',
				channels: ['default'],
			}),
		});
		const actor = new Connection(createMockContext() as never, { ChatRoom: chatRoomBinding } as never) as any;

		await actor.onInit();
		await actor.onWebSocketConnect(createMockSocket(), new Request('https://example.com/ws'));

		const emit = actor.createContext().emit;
		await emit.toRoom('conversation:123').emit('chat.message', { text: 'hello' });
		expect(roomStub.broadcast).toHaveBeenLastCalledWith(
			'chat.message',
			{ text: 'hello' },
			{ exceptUserId: 'user-1' },
		);

		await emit.toRoom('conversation:123', { includeSelf: true }).emit('chat.message', { text: 'hello' });
		expect(roomStub.broadcast).toHaveBeenLastCalledWith(
			'chat.message',
			{ text: 'hello' },
			undefined,
		);
	});
});
