import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConnectionManager, DEFAULT_RECONNECTION_CONFIG } from '../../../src/client/connection';
import type { ReconnectionConfig } from '../../../src/client/connection';

describe('ConnectionManager', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('initial state', () => {
		it('starts in disconnected state', () => {
			const cm = new ConnectionManager();
			expect(cm.getState()).toBe('disconnected');
		});

		it('starts with 0 reconnect attempts', () => {
			const cm = new ConnectionManager();
			expect(cm.getReconnectAttempts()).toBe(0);
		});

		it('initial delay matches config', () => {
			const cm = new ConnectionManager();
			expect(cm.getNextDelay()).toBe(DEFAULT_RECONNECTION_CONFIG.initialDelay);
		});
	});

	describe('setState', () => {
		it('transitions from disconnected to connecting', () => {
			const cm = new ConnectionManager();
			cm.setState('connecting');
			expect(cm.getState()).toBe('connecting');
		});

		it('calls onStateChange callback on valid transition', () => {
			const onStateChange = vi.fn();
			const cm = new ConnectionManager(DEFAULT_RECONNECTION_CONFIG, onStateChange);
			cm.setState('connecting');
			expect(onStateChange).toHaveBeenCalledWith('connecting');
		});

		it('does not call onStateChange when state is the same', () => {
			const onStateChange = vi.fn();
			const cm = new ConnectionManager(DEFAULT_RECONNECTION_CONFIG, onStateChange);
			cm.setState('disconnected');
			expect(onStateChange).not.toHaveBeenCalled();
		});

		it('warns on invalid state transition but still transitions', () => {
			const cm = new ConnectionManager();
			// disconnected -> connected is not valid (must go through connecting)
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			cm.setState('connected');
			expect(warnSpy).toHaveBeenCalled();
			expect(cm.getState()).toBe('connected');
			warnSpy.mockRestore();
		});
	});

	describe('scheduleReconnect', () => {
		it('schedules reconnection and calls connectFn after delay', () => {
			const cm = new ConnectionManager();
			cm.setState('connecting');
			cm.setState('disconnected');

			const connectFn = vi.fn();
			const result = cm.scheduleReconnect(connectFn);

			expect(result).toBe(true);
			expect(cm.getState()).toBe('reconnecting');
			expect(connectFn).not.toHaveBeenCalled();

			vi.advanceTimersByTime(DEFAULT_RECONNECTION_CONFIG.initialDelay);
			expect(connectFn).toHaveBeenCalledOnce();
		});

		it('returns false when reconnection is disabled', () => {
			const config: ReconnectionConfig = { ...DEFAULT_RECONNECTION_CONFIG, enabled: false };
			const cm = new ConnectionManager(config);
			const connectFn = vi.fn();
			expect(cm.scheduleReconnect(connectFn)).toBe(false);
		});

		it('returns false when max attempts reached', () => {
			const config: ReconnectionConfig = { ...DEFAULT_RECONNECTION_CONFIG, maxAttempts: 2 };
			const cm = new ConnectionManager(config);
			cm.setState('connecting');
			cm.setState('disconnected');

			const connectFn = vi.fn();
			cm.scheduleReconnect(connectFn);
			vi.advanceTimersByTime(config.initialDelay);

			cm.scheduleReconnect(connectFn);
			vi.advanceTimersByTime(config.maxDelay);

			// Third attempt should fail
			const result = cm.scheduleReconnect(connectFn);
			expect(result).toBe(false);
			expect(cm.getState()).toBe('error');
		});

		it('applies exponential backoff', () => {
			const config: ReconnectionConfig = {
				enabled: true,
				maxAttempts: 5,
				initialDelay: 100,
				maxDelay: 10000,
				backoffMultiplier: 2,
			};
			const cm = new ConnectionManager(config);
			cm.setState('connecting');
			cm.setState('disconnected');

			const connectFn = vi.fn();

			// First attempt: delay = 100
			cm.scheduleReconnect(connectFn);
			expect(cm.getNextDelay()).toBe(100);
			vi.advanceTimersByTime(100);
			expect(connectFn).toHaveBeenCalledTimes(1);

			// After first attempt fires, delay should be 200
			expect(cm.getNextDelay()).toBe(200);

			// Second attempt: delay = 200
			cm.scheduleReconnect(connectFn);
			vi.advanceTimersByTime(200);
			expect(connectFn).toHaveBeenCalledTimes(2);
			expect(cm.getNextDelay()).toBe(400);
		});

		it('caps delay at maxDelay', () => {
			const config: ReconnectionConfig = {
				enabled: true,
				maxAttempts: 0,
				initialDelay: 5000,
				maxDelay: 10000,
				backoffMultiplier: 3,
			};
			const cm = new ConnectionManager(config);
			cm.setState('connecting');
			cm.setState('disconnected');

			const connectFn = vi.fn();
			cm.scheduleReconnect(connectFn);
			vi.advanceTimersByTime(5000);

			// 5000 * 3 = 15000, capped at 10000
			expect(cm.getNextDelay()).toBe(10000);
		});

		it('increments reconnect attempts', () => {
			const cm = new ConnectionManager();
			cm.setState('connecting');
			cm.setState('disconnected');

			const connectFn = vi.fn();
			cm.scheduleReconnect(connectFn);
			expect(cm.getReconnectAttempts()).toBe(1);
		});

		it('allows infinite reconnection with maxAttempts=0', () => {
			const config: ReconnectionConfig = {
				...DEFAULT_RECONNECTION_CONFIG,
				maxAttempts: 0,
				initialDelay: 10,
			};
			const cm = new ConnectionManager(config);
			cm.setState('connecting');
			cm.setState('disconnected');

			const connectFn = vi.fn();
			for (let i = 0; i < 100; i++) {
				const result = cm.scheduleReconnect(connectFn);
				expect(result).toBe(true);
				vi.advanceTimersByTime(config.maxDelay);
			}
		});
	});

	describe('cancelReconnect', () => {
		it('transitions from reconnecting to disconnected', () => {
			const cm = new ConnectionManager();
			cm.setState('connecting');
			cm.setState('disconnected');

			cm.scheduleReconnect(vi.fn());
			expect(cm.getState()).toBe('reconnecting');

			cm.cancelReconnect();
			expect(cm.getState()).toBe('disconnected');
		});

		it('does not change state if not reconnecting', () => {
			const cm = new ConnectionManager();
			cm.setState('connecting');
			cm.setState('connected');

			cm.cancelReconnect();
			expect(cm.getState()).toBe('connected');
		});
	});

	describe('resetReconnection', () => {
		it('resets attempt counter and delay', () => {
			const config: ReconnectionConfig = {
				...DEFAULT_RECONNECTION_CONFIG,
				initialDelay: 100,
			};
			const cm = new ConnectionManager(config);
			cm.setState('connecting');
			cm.setState('disconnected');

			const connectFn = vi.fn();
			cm.scheduleReconnect(connectFn);
			vi.advanceTimersByTime(100);

			expect(cm.getReconnectAttempts()).toBe(1);

			cm.resetReconnection();
			expect(cm.getReconnectAttempts()).toBe(0);
			expect(cm.getNextDelay()).toBe(100);
		});
	});

	describe('destroy', () => {
		it('clears pending timers', () => {
			const cm = new ConnectionManager();
			cm.setState('connecting');
			cm.setState('disconnected');

			const connectFn = vi.fn();
			cm.scheduleReconnect(connectFn);

			cm.destroy();

			vi.advanceTimersByTime(DEFAULT_RECONNECTION_CONFIG.maxDelay);
			expect(connectFn).not.toHaveBeenCalled();
		});
	});
});
