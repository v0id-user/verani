import { describe, it, expect } from 'vitest';
import { payload, defineContract, isContract } from '../../../src/typed/contract';

describe('payload', () => {
	it('returns an object', () => {
		const p = payload<{ text: string }>();
		expect(typeof p).toBe('object');
	});
});

describe('defineContract', () => {
	it('creates a contract with server and client events', () => {
		const contract = defineContract({
			serverEvents: {
				'chat.message': payload<{ text: string }>(),
			},
			clientEvents: {
				'message.send': payload<{ text: string }>(),
			},
		});

		expect(contract._brand).toBe('VeraniContract');
		expect(contract.serverEvents).toBeDefined();
		expect(contract.clientEvents).toBeDefined();
	});

	it('defaults channels to ["default"]', () => {
		const contract = defineContract({
			serverEvents: {},
			clientEvents: {},
		});

		expect(contract.channels).toEqual(['default']);
	});

	it('preserves custom channels', () => {
		const contract = defineContract({
			serverEvents: {},
			clientEvents: {},
			channels: ['general', 'announcements'] as const,
		});

		expect(contract.channels).toEqual(['general', 'announcements']);
	});

	it('preserves event definitions', () => {
		const serverEvents = {
			'event.a': payload<string>(),
			'event.b': payload<number>(),
		};
		const clientEvents = {
			'event.c': payload<boolean>(),
		};

		const contract = defineContract({ serverEvents, clientEvents });
		expect(Object.keys(contract.serverEvents)).toEqual(['event.a', 'event.b']);
		expect(Object.keys(contract.clientEvents)).toEqual(['event.c']);
	});
});

describe('isContract', () => {
	it('returns true for a valid contract', () => {
		const contract = defineContract({
			serverEvents: {},
			clientEvents: {},
		});
		expect(isContract(contract)).toBe(true);
	});

	it('returns false for null', () => {
		expect(isContract(null)).toBe(false);
	});

	it('returns false for undefined', () => {
		expect(isContract(undefined)).toBe(false);
	});

	it('returns false for a plain object', () => {
		expect(isContract({ serverEvents: {}, clientEvents: {} })).toBe(false);
	});

	it('returns false for an object with wrong brand', () => {
		expect(isContract({ _brand: 'NotVerani' })).toBe(false);
	});

	it('returns false for primitives', () => {
		expect(isContract('string')).toBe(false);
		expect(isContract(42)).toBe(false);
		expect(isContract(true)).toBe(false);
	});
});
