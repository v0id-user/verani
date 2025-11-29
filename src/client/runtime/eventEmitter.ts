/**
 * Manages event listeners and lifecycle events
 */
export class EventEmitter {
  private listeners = new Map<string, Set<(data: any) => void>>();

  /**
   * Registers an event listener
   */
  on(event: string, callback: (data: any) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * Removes an event listener
   */
  off(event: string, callback: (data: any) => void): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(callback);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Registers a one-time event listener
   */
  once(event: string, callback: (data: any) => void): void {
    const wrapper = (data: any) => {
      this.off(event, wrapper);
      callback(data);
    };
    this.on(event, wrapper);
  }

  /**
   * Emits a lifecycle event to registered listeners
   */
  emitLifecycleEvent(event: string, data?: any): void {
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
   * Dispatches an event to registered listeners
   */
  dispatch(eventType: string, eventData: any): void {
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
   * Clears all listeners
   */
  clear(): void {
    this.listeners.clear();
  }
}

