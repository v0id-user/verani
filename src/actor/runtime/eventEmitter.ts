import type { RoomEventEmitter, EventHandler, MessageContext, ConnectionMeta } from "../types";

/**
 * Room-level event emitter for socket.io-like event handling
 */
export class RoomEventEmitterImpl<TMeta extends ConnectionMeta = ConnectionMeta, E = unknown>
	implements RoomEventEmitter<TMeta, E> {
	private handlers = new Map<string, Set<EventHandler<TMeta, E>>>();

	/**
	 * Register an event handler
	 * @param event - Event name (supports wildcard "*")
	 * @param handler - Handler function
	 */
	on(event: string, handler: EventHandler<TMeta, E>): void {
		if (!this.handlers.has(event)) {
			this.handlers.set(event, new Set());
		}
		this.handlers.get(event)!.add(handler);
		console.debug(`[Verani:EventEmitter] Registered handler for event: ${event}`);
	}

	/**
	 * Remove an event handler
	 * @param event - Event name
	 * @param handler - Optional specific handler to remove, or remove all handlers for event
	 */
	off(event: string, handler?: EventHandler<TMeta, E>): void {
		const eventHandlers = this.handlers.get(event);
		if (!eventHandlers) {
			return;
		}

		if (handler) {
			eventHandlers.delete(handler);
			console.debug(`[Verani:EventEmitter] Removed specific handler for event: ${event}`);
			if (eventHandlers.size === 0) {
				this.handlers.delete(event);
			}
		} else {
			this.handlers.delete(event);
			console.debug(`[Verani:EventEmitter] Removed all handlers for event: ${event}`);
		}
	}

	/**
	 * Emit an event to registered handlers
	 * @param event - Event name
	 * @param ctx - Message context
	 * @param data - Event data
	 */
	async emit(event: string, ctx: MessageContext<TMeta, E>, data: any): Promise<void> {
		console.debug(`[Verani:EventEmitter] Emitting event: ${event}`);

		// Get handlers for the specific event
		const eventHandlers = this.handlers.get(event);
		if (eventHandlers && eventHandlers.size > 0) {
			const promises: Promise<void>[] = [];
			for (const handler of eventHandlers) {
				try {
					const result = handler(ctx, data);
					if (result instanceof Promise) {
						promises.push(result);
					}
				} catch (error) {
					console.error(`[Verani:EventEmitter] Error in handler for event ${event}:`, error);
				}
			}
			await Promise.all(promises);
		}

		// Also check for wildcard handlers
		const wildcardHandlers = this.handlers.get("*");
		if (wildcardHandlers && wildcardHandlers.size > 0) {
			const promises: Promise<void>[] = [];
			for (const handler of wildcardHandlers) {
				try {
					const result = handler(ctx, data);
					if (result instanceof Promise) {
						promises.push(result);
					}
				} catch (error) {
					console.error(`[Verani:EventEmitter] Error in wildcard handler for event ${event}:`, error);
				}
			}
			await Promise.all(promises);
		}
	}

	/**
	 * Check if there are any handlers for a given event
	 * @param event - Event name
	 * @returns True if handlers exist for the event or wildcard
	 */
	hasHandlers(event: string): boolean {
		return (
			(this.handlers.has(event) && this.handlers.get(event)!.size > 0) ||
			(this.handlers.has("*") && this.handlers.get("*")!.size > 0)
		);
	}

	/**
	 * Get all registered event names
	 * @returns Array of event names
	 */
	getEventNames(): string[] {
		return Array.from(this.handlers.keys());
	}
}

/**
 * Create a new room event emitter instance
 */
export function createRoomEventEmitter<TMeta extends ConnectionMeta = ConnectionMeta, E = unknown>(): RoomEventEmitter<TMeta, E> {
	return new RoomEventEmitterImpl<TMeta, E>();
}

