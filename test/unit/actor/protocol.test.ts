import { describe, it, expect } from 'vitest';
import { decodeFrame, encodeFrame } from '../../../src/actor/protocol';

describe('decodeFrame (actor)', () => {
	it('decodes a valid JSON frame', () => {
		const raw = JSON.stringify({ type: 'message', channel: 'chat', data: { text: 'hi' } });
		const frame = decodeFrame(raw);
		expect(frame.type).toBe('message');
		expect(frame.channel).toBe('chat');
		expect(frame.data).toEqual({ text: 'hi' });
	});

	it('decodes a frame with type only', () => {
		const raw = JSON.stringify({ type: 'ping' });
		const frame = decodeFrame(raw);
		expect(frame.type).toBe('ping');
		expect(frame.channel).toBeUndefined();
		expect(frame.data).toBeUndefined();
	});

	it('returns invalid frame for malformed JSON', () => {
		const frame = decodeFrame('not json {{{');
		expect(frame.type).toBe('invalid');
	});

	it('returns invalid frame for missing type', () => {
		const frame = decodeFrame(JSON.stringify({ channel: 'chat' }));
		expect(frame.type).toBe('invalid');
	});

	it('returns invalid frame for empty string', () => {
		const frame = decodeFrame('');
		expect(frame.type).toBe('invalid');
	});

	it('returns invalid frame for non-string type field', () => {
		const frame = decodeFrame(JSON.stringify({ type: 123 }));
		expect(frame.type).toBe('invalid');
	});
});

describe('encodeFrame (actor)', () => {
	it('encodes a frame to JSON', () => {
		const result = encodeFrame({ type: 'message', channel: 'chat', data: { text: 'hi' } });
		expect(JSON.parse(result)).toEqual({ type: 'message', channel: 'chat', data: { text: 'hi' } });
	});

	it('encodes a frame with type only', () => {
		const result = encodeFrame({ type: 'pong' });
		expect(JSON.parse(result)).toEqual({ type: 'pong' });
	});

	it('produces valid JSON', () => {
		const result = encodeFrame({ type: 'test', data: { nested: [1, 2] } });
		expect(() => JSON.parse(result)).not.toThrow();
	});
});
