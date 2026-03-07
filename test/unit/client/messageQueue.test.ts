import { describe, it, expect, vi } from 'vitest';
import { MessageQueue } from '../../../src/client/runtime/messageQueue';

// Mock the protocol module since MessageQueue imports encodeClientMessage
vi.mock('../../../src/client/protocol', () => ({
	encodeClientMessage: (msg: unknown) => JSON.stringify(msg),
}));

describe('MessageQueue', () => {
	describe('queueMessage', () => {
		it('queues a message', () => {
			const queue = new MessageQueue(10);
			queue.queueMessage({ type: 'test', data: 'hello' });
			expect(queue.getLength()).toBe(1);
		});

		it('queues multiple messages', () => {
			const queue = new MessageQueue(10);
			queue.queueMessage({ type: 'a' });
			queue.queueMessage({ type: 'b' });
			queue.queueMessage({ type: 'c' });
			expect(queue.getLength()).toBe(3);
		});

		it('drops oldest message when queue is full', () => {
			const queue = new MessageQueue(2);
			queue.queueMessage({ type: 'first' });
			queue.queueMessage({ type: 'second' });
			queue.queueMessage({ type: 'third' });
			expect(queue.getLength()).toBe(2);
		});
	});

	describe('flushMessageQueue', () => {
		it('sends all queued messages through websocket', () => {
			const queue = new MessageQueue(10);
			queue.queueMessage({ type: 'a', data: 1 });
			queue.queueMessage({ type: 'b', data: 2 });

			const mockWs = {
				readyState: 1, // WebSocket.OPEN
				send: vi.fn(),
			} as unknown as WebSocket;

			// Need to set WebSocket.OPEN
			(globalThis as any).WebSocket = { OPEN: 1 };

			queue.flushMessageQueue(mockWs);
			expect(mockWs.send).toHaveBeenCalledTimes(2);
			expect(queue.getLength()).toBe(0);
		});

		it('does not send if websocket is not open', () => {
			const queue = new MessageQueue(10);
			queue.queueMessage({ type: 'test' });

			const mockWs = {
				readyState: 0, // CONNECTING
				send: vi.fn(),
			} as unknown as WebSocket;

			(globalThis as any).WebSocket = { OPEN: 1 };

			queue.flushMessageQueue(mockWs);
			expect(mockWs.send).not.toHaveBeenCalled();
			expect(queue.getLength()).toBe(1);
		});

		it('does not send if websocket is null', () => {
			const queue = new MessageQueue(10);
			queue.queueMessage({ type: 'test' });

			(globalThis as any).WebSocket = { OPEN: 1 };

			queue.flushMessageQueue(null as unknown as WebSocket);
			expect(queue.getLength()).toBe(1);
		});

		it('handles send errors gracefully', () => {
			const queue = new MessageQueue(10);
			queue.queueMessage({ type: 'a' });
			queue.queueMessage({ type: 'b' });

			const mockWs = {
				readyState: 1,
				send: vi.fn().mockImplementationOnce(() => { throw new Error('send failed'); }),
			} as unknown as WebSocket;

			(globalThis as any).WebSocket = { OPEN: 1 };

			expect(() => queue.flushMessageQueue(mockWs)).not.toThrow();
			// Both messages should have been attempted
			expect(mockWs.send).toHaveBeenCalledTimes(2);
			expect(queue.getLength()).toBe(0);
		});
	});

	describe('clear', () => {
		it('empties the queue', () => {
			const queue = new MessageQueue(10);
			queue.queueMessage({ type: 'a' });
			queue.queueMessage({ type: 'b' });
			queue.clear();
			expect(queue.getLength()).toBe(0);
		});
	});

	describe('getLength', () => {
		it('returns 0 for empty queue', () => {
			const queue = new MessageQueue(10);
			expect(queue.getLength()).toBe(0);
		});
	});
});
