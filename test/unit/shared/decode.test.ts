import { describe, it, expect } from 'vitest';
import { decodeFrame, decodeClientMessage, decodeServerMessage } from '../../../src/shared/decode';

describe('decodeFrame', () => {
	it('decodes a valid frame with type only', () => {
		const raw = JSON.stringify({ type: 'ping' });
		const result = decodeFrame(raw);
		expect(result).toEqual({ type: 'ping' });
	});

	it('decodes a valid frame with type and channel', () => {
		const raw = JSON.stringify({ type: 'message', channel: 'chat' });
		const result = decodeFrame(raw);
		expect(result).toEqual({ type: 'message', channel: 'chat' });
	});

	it('decodes a valid frame with type, channel, and data', () => {
		const raw = JSON.stringify({ type: 'message', channel: 'chat', data: { text: 'hello' } });
		const result = decodeFrame(raw);
		expect(result).toEqual({ type: 'message', channel: 'chat', data: { text: 'hello' } });
	});

	it('returns null for invalid JSON', () => {
		const result = decodeFrame('not json');
		expect(result).toBeNull();
	});

	it('returns null for empty string', () => {
		const result = decodeFrame('');
		expect(result).toBeNull();
	});

	it('returns null for object without type', () => {
		const raw = JSON.stringify({ channel: 'chat', data: 'hello' });
		const result = decodeFrame(raw);
		expect(result).toBeNull();
	});

	it('returns null for non-string type', () => {
		const raw = JSON.stringify({ type: 123 });
		const result = decodeFrame(raw);
		expect(result).toBeNull();
	});

	it('returns null for non-string channel', () => {
		const raw = JSON.stringify({ type: 'message', channel: 123 });
		const result = decodeFrame(raw);
		expect(result).toBeNull();
	});

	it('returns null for null input parsed from JSON', () => {
		const raw = JSON.stringify(null);
		const result = decodeFrame(raw);
		expect(result).toBeNull();
	});

	it('returns null for array input', () => {
		const raw = JSON.stringify([1, 2, 3]);
		const result = decodeFrame(raw);
		expect(result).toBeNull();
	});

	it('returns null for primitive JSON values', () => {
		expect(decodeFrame('42')).toBeNull();
		expect(decodeFrame('"string"')).toBeNull();
		expect(decodeFrame('true')).toBeNull();
	});

	it('preserves extra properties on the frame', () => {
		const raw = JSON.stringify({ type: 'event', extra: 'value' });
		const result = decodeFrame(raw);
		expect(result).toEqual({ type: 'event', extra: 'value' });
	});
});

describe('decodeClientMessage', () => {
	it('decodes a valid client message', () => {
		const raw = JSON.stringify({ type: 'send', data: { text: 'hi' } });
		const result = decodeClientMessage(raw);
		expect(result).toEqual({ type: 'send', data: { text: 'hi' } });
	});

	it('returns null for invalid message', () => {
		expect(decodeClientMessage('bad')).toBeNull();
	});
});

describe('decodeServerMessage', () => {
	it('decodes a valid server message', () => {
		const raw = JSON.stringify({ type: 'broadcast', channel: 'general', data: [1, 2] });
		const result = decodeServerMessage(raw);
		expect(result).toEqual({ type: 'broadcast', channel: 'general', data: [1, 2] });
	});

	it('returns null for invalid message', () => {
		expect(decodeServerMessage('{}')).toBeNull();
	});
});
