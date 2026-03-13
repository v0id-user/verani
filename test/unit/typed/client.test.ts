import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineContract, payload } from '../../../src/typed/contract';
import { withValidation } from '../../../src/typed/validation';

// We can't easily mock VeraniClient since vitest+bun has module resolution quirks.
// Instead, test the typed client's wrapper behavior by importing createTypedClient
// and verifying it properly wraps the underlying client.

// Mock the WebSocket global to prevent actual connections
const mockWsSend = vi.fn();
const mockWsClose = vi.fn();

class MockWebSocket {
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSING = 2;
	static CLOSED = 3;

	readyState = MockWebSocket.CONNECTING;
	onopen: ((ev: Event) => void) | null = null;
	onclose: ((ev: CloseEvent) => void) | null = null;
	onmessage: ((ev: MessageEvent) => void) | null = null;
	onerror: ((ev: Event) => void) | null = null;
	url: string;

	constructor(url: string) {
		this.url = url;
		// Simulate async open
		setTimeout(() => {
			this.readyState = MockWebSocket.OPEN;
			this.onopen?.(new Event('open'));
		}, 0);
	}

	send = mockWsSend;
	close = mockWsClose;
	addEventListener() {}
	removeEventListener() {}
}

vi.stubGlobal('WebSocket', MockWebSocket);

import { createTypedClient } from '../../../src/typed/client';

const chatContract = defineContract({
	serverEvents: {
		'chat.message': payload<{ from: string; text: string }>(),
		'user.joined': payload<{ userId: string }>(),
	},
	clientEvents: {
		'message.send': payload<{ text: string }>(),
	},
});

describe('createTypedClient', () => {
	it('returns a typed client with all expected methods', () => {
		const client = createTypedClient(chatContract, 'ws://localhost');
		expect(client.on).toBeTypeOf('function');
		expect(client.off).toBeTypeOf('function');
		expect(client.once).toBeTypeOf('function');
		expect(client.emit).toBeTypeOf('function');
		expect(client.disconnect).toBeTypeOf('function');
		expect(client.close).toBeTypeOf('function');
		client.close();
	});

	it('exposes the contract', () => {
		const client = createTypedClient(chatContract, 'ws://localhost');
		expect(client.contract).toBe(chatContract);
		client.close();
	});

	it('exposes the underlying _client', () => {
		const client = createTypedClient(chatContract, 'ws://localhost');
		expect(client._client).toBeDefined();
		expect(client._client.constructor.name).toBe('VeraniClient');
		client.close();
	});

	it('delegates emit to the underlying client', () => {
		const client = createTypedClient(chatContract, 'ws://localhost');
		const emitSpy = vi.spyOn(client._client, 'emit');
		client.emit('message.send', { text: 'hello' });
		expect(emitSpy).toHaveBeenCalledWith('message.send', { text: 'hello' });
		client.close();
	});

	it('registers and dispatches listeners via on()', async () => {
		const client = createTypedClient(chatContract, 'ws://localhost');
		const handler = vi.fn();
		const unsub = client.on('chat.message', handler);

		expect(unsub).toBeTypeOf('function');

		// Simulate receiving a message via the underlying client's event emitter
		const underlying = client._client as any;
		underlying.eventEmitter.dispatch('chat.message', { from: 'alice', text: 'hi' });

		expect(handler).toHaveBeenCalledWith({ from: 'alice', text: 'hi' });

		unsub();
		client.close();
	});

	it('removes listeners via off()', () => {
		const client = createTypedClient(chatContract, 'ws://localhost');
		const handler = vi.fn();
		client.on('chat.message', handler);
		client.off('chat.message', handler);

		const underlying = client._client as any;
		underlying.eventEmitter.dispatch('chat.message', { from: 'alice', text: 'hi' });

		expect(handler).not.toHaveBeenCalled();
		client.close();
	});

	it('delegates lifecycle registration', () => {
		const client = createTypedClient(chatContract, 'ws://localhost');
		const onOpenSpy = vi.spyOn(client._client, 'onOpen');
		const onCloseSpy = vi.spyOn(client._client, 'onClose');
		const onErrorSpy = vi.spyOn(client._client, 'onError');

		const cb = vi.fn();
		client.onOpen(cb);
		client.onClose(cb);
		client.onError(cb);

		expect(onOpenSpy).toHaveBeenCalledWith(cb);
		expect(onCloseSpy).toHaveBeenCalledWith(cb);
		expect(onErrorSpy).toHaveBeenCalledWith(cb);
		client.close();
	});

	it('delegates getState and isConnected', () => {
		const client = createTypedClient(chatContract, 'ws://localhost');
		expect(client.getState()).toBe('connecting');
		expect(client.isConnected()).toBe(false);
		client.close();
	});

	it('delegates getConnectionState', () => {
		const client = createTypedClient(chatContract, 'ws://localhost');
		const state = client.getConnectionState();
		expect(state).toHaveProperty('state');
		expect(state).toHaveProperty('isConnected');
		expect(state).toHaveProperty('reconnectAttempts');
		client.close();
	});
});

describe('createTypedClient with validation', () => {
	it('blocks invalid server data when contract has validators', () => {
		const validated = withValidation(chatContract, {
			serverEvents: {
				'chat.message': {
					safeParse: (data: unknown) => {
						if (typeof data === 'object' && data !== null && 'from' in data && 'text' in data) {
							return { success: true as const, data: data as { from: string; text: string } };
						}
						return { success: false as const, error: { issues: [{ message: 'invalid' }] } };
					},
				},
			},
		});

		const client = createTypedClient(validated, 'ws://localhost');
		const handler = vi.fn();
		client.on('chat.message', handler);

		const underlying = client._client as any;

		// Invalid data — handler should not be called
		underlying.eventEmitter.dispatch('chat.message', { wrong: 'field' });
		expect(handler).not.toHaveBeenCalled();

		// Valid data — handler should be called
		underlying.eventEmitter.dispatch('chat.message', { from: 'alice', text: 'hi' });
		expect(handler).toHaveBeenCalledWith({ from: 'alice', text: 'hi' });

		client.close();
	});
});
