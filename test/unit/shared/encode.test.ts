import { describe, it, expect } from 'vitest';
import { encodeFrame, encodeClientMessage, encodeServerMessage } from '../../../src/shared/encode';

describe('encodeFrame', () => {
	it('encodes a frame with type only', () => {
		const result = encodeFrame({ type: 'ping' });
		expect(JSON.parse(result)).toEqual({ type: 'ping' });
	});

	it('encodes a frame with type and channel', () => {
		const result = encodeFrame({ type: 'message', channel: 'chat' });
		expect(JSON.parse(result)).toEqual({ type: 'message', channel: 'chat' });
	});

	it('encodes a frame with data', () => {
		const frame = { type: 'event', data: { userId: '123', name: 'Alice' } };
		const result = encodeFrame(frame);
		expect(JSON.parse(result)).toEqual(frame);
	});

	it('encodes a frame with nested data', () => {
		const frame = { type: 'complex', data: { nested: { deep: [1, 2, 3] } } };
		const result = encodeFrame(frame);
		expect(JSON.parse(result)).toEqual(frame);
	});

	it('returns valid JSON string', () => {
		const result = encodeFrame({ type: 'test' });
		expect(() => JSON.parse(result)).not.toThrow();
	});

	it('handles undefined data gracefully', () => {
		const result = encodeFrame({ type: 'test', data: undefined });
		const parsed = JSON.parse(result);
		expect(parsed.type).toBe('test');
		expect(parsed).not.toHaveProperty('data');
	});

	it('handles null data', () => {
		const result = encodeFrame({ type: 'test', data: null });
		expect(JSON.parse(result)).toEqual({ type: 'test', data: null });
	});

	it('throws on circular references', () => {
		const circular: Record<string, unknown> = { type: 'test' };
		circular.self = circular;
		expect(() => encodeFrame(circular as any)).toThrow('Failed to encode frame');
	});
});

describe('encodeClientMessage', () => {
	it('encodes a client message', () => {
		const msg = { type: 'send', data: { text: 'hello' } };
		const result = encodeClientMessage(msg);
		expect(JSON.parse(result)).toEqual(msg);
	});
});

describe('encodeServerMessage', () => {
	it('encodes a server message', () => {
		const msg = { type: 'broadcast', channel: 'general', data: { content: 'hi' } };
		const result = encodeServerMessage(msg);
		expect(JSON.parse(result)).toEqual(msg);
	});
});
