/**
 * Generic callback type for event listeners
 */
export type EventCallback<TData = unknown> = (data: TData) => void;

/**
 * Manages event listeners and lifecycle events for the Verani client.
 * Provides methods to register, remove, and dispatch events.
 * Supports both regular event listeners and one-time listeners.
 */
export class EventEmitter {
  private listeners = new Map<string, Set<EventCallback<unknown>>>();

  /**
   * Registers an event listener that will be called whenever the event is dispatched.
   * Multiple listeners can be registered for the same event.
   *
   * @param event - Event type to listen for
   * @param callback - Callback function to invoke when event is received
   */
  on<TData = unknown>(event: string, callback: EventCallback<TData>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as EventCallback<unknown>);
  }

  /**
   * Removes an event listener.
   * If the callback is not found, this method does nothing.
   *
   * @param event - Event type to remove listener from
   * @param callback - Callback function to remove (must be the same function reference)
   */
  off<TData = unknown>(event: string, callback: EventCallback<TData>): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(callback as EventCallback<unknown>);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Registers a one-time event listener that will be called only once.
   * The listener is automatically removed after being called.
   *
   * @param event - Event type to listen for
   * @param callback - Callback function to invoke once
   */
  once<TData = unknown>(event: string, callback: EventCallback<TData>): void {
    const wrapper: EventCallback<TData> = (data: TData) => {
      this.off(event, wrapper);
      callback(data);
    };
    this.on(event, wrapper);
  }

  /**
   * Emits a lifecycle event to registered listeners.
   * Lifecycle events include "connecting", "connected", "disconnected", "reconnecting", "error", etc.
   * Errors in listeners are caught and logged but do not prevent other listeners from being called.
   *
   * @param event - Lifecycle event name
   * @param data - Optional event data to pass to listeners
   */
  emitLifecycleEvent<TData = unknown>(event: string, data?: TData): void {
    const set = this.listeners.get(event);
    if (set) {
      console.debug("[Verani:Client] Emitting lifecycle event:", event, "to", set.size, "listeners");
      for (const fn of set) {
        try {
          fn(data);
        } catch (error) {
          console.error("[Verani] Error in lifecycle event handler:", error);
        }
      }
    }
  }

  /**
   * Dispatches an event to registered listeners.
   * This is used for application-level events (not lifecycle events).
   * Errors in listeners are caught and logged but do not prevent other listeners from being called.
   *
   * @param eventType - Event type name
   * @param eventData - Event data to pass to listeners
   */
  dispatch<TData = unknown>(eventType: string, eventData: TData): void {
    const set = this.listeners.get(eventType);
    if (set) {
      console.debug("[Verani:Client] Dispatching to", set.size, "listeners");

      for (const fn of set) {
        try {
          fn(eventData);
        } catch (error) {
          console.error("[Verani] Error in message handler:", error);
        }
      }
    } else {
      console.debug("[Verani:Client] No listeners for message type:", eventType);
    }
  }

  /**
   * Clears all event listeners.
   * Should be called during cleanup to prevent memory leaks.
   */
  clear(): void {
    this.listeners.clear();
  }
}

