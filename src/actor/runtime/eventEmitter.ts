import type { RoomEventEmitter, EventHandler, MessageContext, ConnectionMeta } from "../types";

/**
 * Room-level event emitter for socket.io-like event handling.
 * Manages event handlers that survive actor hibernation by storing them in static storage.
 * Supports wildcard "*" handlers that receive all events.
 *
 * @template TMeta - Connection metadata type
 * @template E - Environment type
 * @template TState - Room state type
 */
export class RoomEventEmitterImpl<TMeta extends ConnectionMeta = ConnectionMeta, E = unknown, TState extends Record<string, unknown> = Record<string, unknown>>
	implements RoomEventEmitter<TMeta, E, TState> {
	private handlers = new Map<string, Set<EventHandler<TMeta, E, TState>>>();

	/**
	 * Register an event handler
	 * @param event - Event name (supports wildcard "*")
	 * @param handler - Handler function
	 */
	on(event: string, handler: EventHandler<TMeta, E, TState>): void {
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
	off(event: string, handler?: EventHandler<TMeta, E, TState>): void {
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
	async emit(event: string, ctx: MessageContext<TMeta, E, TState>, data: any): Promise<void> {
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
	 * Check if there are any handlers registered for a given event.
	 * Returns true if handlers exist for the specific event or for the wildcard "*" event.
	 *
	 * @param event - Event name to check
	 * @returns True if handlers exist for the event or wildcard, false otherwise
	 */
	hasHandlers(event: string): boolean {
		return (
			(this.handlers.has(event) && this.handlers.get(event)!.size > 0) ||
			(this.handlers.has("*") && this.handlers.get("*")!.size > 0)
		);
	}

	/**
	 * Get all registered event names.
	 * Returns an array of all event names that have at least one handler registered.
	 *
	 * @returns Array of event names (excluding wildcard "*" if present)
	 */
	getEventNames(): string[] {
		return Array.from(this.handlers.keys());
	}

	/**
	 * Rebuild handlers from static storage.
	 * Called after hibernation to restore handlers from the room definition.
	 * @param staticHandlers - Map of event names to handler sets from static storage
	 */
	rebuildHandlers(staticHandlers: Map<string, Set<EventHandler<TMeta, E, TState>>>): void {
		console.debug(`[Verani:EventEmitter] Rebuilding handlers from static storage, ${staticHandlers.size} event types`);
		// Clear existing handlers
		this.handlers.clear();
		// Copy all handlers from static storage
		for (const [event, handlers] of staticHandlers.entries()) {
			this.handlers.set(event, new Set(handlers));
		}
		console.debug(`[Verani:EventEmitter] Rebuilt ${this.handlers.size} event types`);
	}
}

/**
 * Create a new room event emitter instance.
 * Factory function that creates a RoomEventEmitterImpl instance.
 *
 * @template TMeta - Connection metadata type
 * @template E - Environment type
 * @template TState - Room state type
 * @returns A new RoomEventEmitter instance
 */
export function createRoomEventEmitter<TMeta extends ConnectionMeta = ConnectionMeta, E = unknown, TState extends Record<string, unknown> = Record<string, unknown>>(): RoomEventEmitter<TMeta, E, TState> {
	return new RoomEventEmitterImpl<TMeta, E, TState>();
}

