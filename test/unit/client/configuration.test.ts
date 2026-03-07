import { describe, it, expect } from 'vitest';
import { resolveClientOptions } from '../../../src/client/runtime/configuration';
import { DEFAULT_RECONNECTION_CONFIG } from '../../../src/client/connection';

describe('resolveClientOptions', () => {
	it('returns all defaults when given empty options', () => {
		const result = resolveClientOptions({});
		expect(result).toEqual({
			reconnection: DEFAULT_RECONNECTION_CONFIG,
			maxQueueSize: 100,
			connectionTimeout: 10000,
			pingInterval: 5000,
			pongTimeout: 5000,
		});
	});

	it('overrides maxQueueSize', () => {
		const result = resolveClientOptions({ maxQueueSize: 50 });
		expect(result.maxQueueSize).toBe(50);
	});

	it('overrides connectionTimeout', () => {
		const result = resolveClientOptions({ connectionTimeout: 3000 });
		expect(result.connectionTimeout).toBe(3000);
	});

	it('overrides pingInterval', () => {
		const result = resolveClientOptions({ pingInterval: 0 });
		expect(result.pingInterval).toBe(0);
	});

	it('overrides pongTimeout', () => {
		const result = resolveClientOptions({ pongTimeout: 10000 });
		expect(result.pongTimeout).toBe(10000);
	});

	it('partially overrides reconnection config', () => {
		const result = resolveClientOptions({
			reconnection: { maxAttempts: 5 },
		});
		expect(result.reconnection.maxAttempts).toBe(5);
		expect(result.reconnection.enabled).toBe(DEFAULT_RECONNECTION_CONFIG.enabled);
		expect(result.reconnection.initialDelay).toBe(DEFAULT_RECONNECTION_CONFIG.initialDelay);
		expect(result.reconnection.maxDelay).toBe(DEFAULT_RECONNECTION_CONFIG.maxDelay);
		expect(result.reconnection.backoffMultiplier).toBe(DEFAULT_RECONNECTION_CONFIG.backoffMultiplier);
	});

	it('fully overrides reconnection config', () => {
		const customReconnection = {
			enabled: false,
			maxAttempts: 3,
			initialDelay: 500,
			maxDelay: 5000,
			backoffMultiplier: 2,
		};
		const result = resolveClientOptions({ reconnection: customReconnection });
		expect(result.reconnection).toEqual(customReconnection);
	});

	it('disables reconnection', () => {
		const result = resolveClientOptions({ reconnection: { enabled: false } });
		expect(result.reconnection.enabled).toBe(false);
	});
});
