import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from '../../../src/client/runtime/eventEmitter';

describe('EventEmitter', () => {
	describe('on / dispatch', () => {
		it('calls registered listener when event is dispatched', () => {
			const emitter = new EventEmitter();
			const handler = vi.fn();
			emitter.on('test', handler);
			emitter.dispatch('test', { value: 42 });
			expect(handler).toHaveBeenCalledWith({ value: 42 });
		});

		it('supports multiple listeners on the same event', () => {
			const emitter = new EventEmitter();
			const handler1 = vi.fn();
			const handler2 = vi.fn();
			emitter.on('test', handler1);
			emitter.on('test', handler2);
			emitter.dispatch('test', 'data');
			expect(handler1).toHaveBeenCalledWith('data');
			expect(handler2).toHaveBeenCalledWith('data');
		});

		it('does not call listeners for other events', () => {
			const emitter = new EventEmitter();
			const handler = vi.fn();
			emitter.on('eventA', handler);
			emitter.dispatch('eventB', 'data');
			expect(handler).not.toHaveBeenCalled();
		});

		it('handles dispatch with no listeners', () => {
			const emitter = new EventEmitter();
			expect(() => emitter.dispatch('nonexistent', 'data')).not.toThrow();
		});
	});

	describe('off', () => {
		it('removes a specific listener', () => {
			const emitter = new EventEmitter();
			const handler = vi.fn();
			emitter.on('test', handler);
			emitter.off('test', handler);
			emitter.dispatch('test', 'data');
			expect(handler).not.toHaveBeenCalled();
		});

		it('does not affect other listeners on same event', () => {
			const emitter = new EventEmitter();
			const handler1 = vi.fn();
			const handler2 = vi.fn();
			emitter.on('test', handler1);
			emitter.on('test', handler2);
			emitter.off('test', handler1);
			emitter.dispatch('test', 'data');
			expect(handler1).not.toHaveBeenCalled();
			expect(handler2).toHaveBeenCalledWith('data');
		});

		it('handles removing non-existent listener', () => {
			const emitter = new EventEmitter();
			const handler = vi.fn();
			expect(() => emitter.off('test', handler)).not.toThrow();
		});

		it('cleans up event key when last listener is removed', () => {
			const emitter = new EventEmitter();
			const handler = vi.fn();
			emitter.on('test', handler);
			emitter.off('test', handler);
			// Dispatch should not throw even after cleanup
			expect(() => emitter.dispatch('test', null)).not.toThrow();
		});
	});

	describe('once', () => {
		it('calls listener only once', () => {
			const emitter = new EventEmitter();
			const handler = vi.fn();
			emitter.once('test', handler);
			emitter.dispatch('test', 'first');
			emitter.dispatch('test', 'second');
			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler).toHaveBeenCalledWith('first');
		});

		it('can be used alongside regular listeners', () => {
			const emitter = new EventEmitter();
			const onceHandler = vi.fn();
			const regularHandler = vi.fn();
			emitter.once('test', onceHandler);
			emitter.on('test', regularHandler);
			emitter.dispatch('test', 'data');
			emitter.dispatch('test', 'data2');
			expect(onceHandler).toHaveBeenCalledTimes(1);
			expect(regularHandler).toHaveBeenCalledTimes(2);
		});
	});

	describe('emitLifecycleEvent', () => {
		it('calls registered listeners', () => {
			const emitter = new EventEmitter();
			const handler = vi.fn();
			emitter.on('connected', handler);
			emitter.emitLifecycleEvent('connected', { id: '123' });
			expect(handler).toHaveBeenCalledWith({ id: '123' });
		});

		it('calls listeners with undefined data when none provided', () => {
			const emitter = new EventEmitter();
			const handler = vi.fn();
			emitter.on('disconnected', handler);
			emitter.emitLifecycleEvent('disconnected');
			expect(handler).toHaveBeenCalledWith(undefined);
		});

		it('catches errors in listeners and continues', () => {
			const emitter = new EventEmitter();
			const errorHandler = vi.fn(() => { throw new Error('boom'); });
			const goodHandler = vi.fn();
			emitter.on('test', errorHandler);
			emitter.on('test', goodHandler);
			expect(() => emitter.emitLifecycleEvent('test', 'data')).not.toThrow();
			expect(errorHandler).toHaveBeenCalled();
			expect(goodHandler).toHaveBeenCalled();
		});
	});

	describe('dispatch error handling', () => {
		it('catches errors in handlers and continues', () => {
			const emitter = new EventEmitter();
			const errorHandler = vi.fn(() => { throw new Error('handler error'); });
			const goodHandler = vi.fn();
			emitter.on('msg', errorHandler);
			emitter.on('msg', goodHandler);
			expect(() => emitter.dispatch('msg', 'data')).not.toThrow();
			expect(goodHandler).toHaveBeenCalledWith('data');
		});
	});

	describe('clear', () => {
		it('removes all listeners', () => {
			const emitter = new EventEmitter();
			const handler1 = vi.fn();
			const handler2 = vi.fn();
			emitter.on('eventA', handler1);
			emitter.on('eventB', handler2);
			emitter.clear();
			emitter.dispatch('eventA', 'data');
			emitter.dispatch('eventB', 'data');
			expect(handler1).not.toHaveBeenCalled();
			expect(handler2).not.toHaveBeenCalled();
		});
	});
});
