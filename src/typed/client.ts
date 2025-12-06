/**
 * Type-Safe Client Integration for Verani
 *
 * Provides createTypedClient() which wraps VeraniClient with full type safety
 * for event listeners and emit operations based on a contract definition.
 *
 * @example
 * ```typescript
 * const client = createTypedClient(chatContract, "wss://example.com/ws");
 *
 * // Listening - only serverEvents allowed, data is typed
 * client.on("chat.message", (data) => {
 *   console.log(`${data.from}: ${data.text}`);
 * });
 *
 * // Emitting - only clientEvents allowed, data is typed
 * client.emit("message.send", { text: "Hello!" });
 * ```
 *
 * @packageDocumentation
 */

import { VeraniClient } from "../client/client";
import type { VeraniClientOptions } from "../client/client";
import type { ConnectionState } from "../client/connection";
import type { Contract } from "./contract";
import type {
  ServerEventNames,
  ClientEventNames,
  ServerPayload,
  ClientPayload,
} from "./infer";
import {
  isValidatedContract,
  getServerValidator,
  validateData,
  getValidationErrorHandler,
} from "./validation";

// ============================================================================
// Typed Client Interface
// ============================================================================

/**
 * Type-safe Verani client with contract-aware event handling.
 */
export interface TypedClient<C extends Contract> {
  // ============================================
  // Type-safe event methods
  // ============================================

  /**
   * Register a listener for a server event (sent from server to client).
   * The event name and callback data type are constrained by the contract.
   *
   * @param event - Server event name from the contract
   * @param callback - Handler function with typed data parameter
   * @returns Unsubscribe function to remove the listener
   *
   * @example
   * ```typescript
   * const unsubscribe = client.on("chat.message", (data) => {
   *   // data: { from: string; text: string } - inferred from contract!
   *   console.log(`${data.from}: ${data.text}`);
   * });
   *
   * // Later: remove the listener
   * unsubscribe();
   * ```
   */
  on<E extends ServerEventNames<C>>(
    event: E,
    callback: (data: ServerPayload<C, E>) => void,
  ): () => void;

  /**
   * Remove a listener for a server event.
   *
   * @param event - Server event name from the contract
   * @param callback - The callback function to remove
   */
  off<E extends ServerEventNames<C>>(
    event: E,
    callback: (data: ServerPayload<C, E>) => void,
  ): void;

  /**
   * Register a one-time listener for a server event.
   * The listener is automatically removed after being called once.
   *
   * @param event - Server event name from the contract
   * @param callback - Handler function with typed data parameter
   */
  once<E extends ServerEventNames<C>>(
    event: E,
    callback: (data: ServerPayload<C, E>) => void,
  ): void;

  /**
   * Send a client event to the server.
   * The event name and data are constrained by the contract.
   *
   * @param event - Client event name from the contract
   * @param data - Event payload (type-checked against contract)
   *
   * @example
   * ```typescript
   * client.emit("message.send", { text: "Hello!" });
   * // Error: client.emit("chat.message", ...) - not a clientEvent!
   * ```
   */
  emit<E extends ClientEventNames<C>>(event: E, data: ClientPayload<C, E>): void;

  // ============================================
  // Connection lifecycle methods
  // ============================================

  /**
   * Register a callback for when the connection opens.
   */
  onOpen(callback: () => void): void;

  /**
   * Register a callback for when the connection closes.
   */
  onClose(callback: (event: CloseEvent) => void): void;

  /**
   * Register a callback for connection errors.
   */
  onError(callback: (error: Event) => void): void;

  /**
   * Register a callback for connection state changes.
   */
  onStateChange(callback: (state: ConnectionState) => void): void;

  /**
   * Get the current connection state.
   */
  getState(): ConnectionState;

  /**
   * Check if the client is currently connected.
   */
  isConnected(): boolean;

  /**
   * Check if the client is currently connecting.
   */
  readonly isConnecting: boolean;

  /**
   * Get detailed connection state information.
   */
  getConnectionState(): {
    state: ConnectionState;
    isConnected: boolean;
    isConnecting: boolean;
    reconnectAttempts: number;
    connectionId: number;
  };

  /**
   * Wait for the connection to be established.
   * Returns a promise that resolves when connected.
   */
  waitForConnection(): Promise<void>;

  /**
   * Manually trigger a reconnection.
   */
  reconnect(): void;

  /**
   * Close the connection without reconnecting.
   */
  disconnect(): void;

  /**
   * Close the connection and clean up all resources.
   */
  close(): void;

  // ============================================
  // Internal access
  // ============================================

  /**
   * The underlying VeraniClient instance.
   * Use for advanced scenarios or escape hatches.
   */
  readonly _client: VeraniClient;

  /**
   * The contract this client is based on.
   */
  readonly contract: C;
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a type-safe Verani client based on a contract definition.
 *
 * This wraps the base `VeraniClient` and adds:
 * - Typed `on()` method constrained to server events
 * - Typed `emit()` method constrained to client events
 * - Compile-time validation of event names and payloads
 *
 * @param contract - The contract defining events and payloads
 * @param url - WebSocket URL to connect to
 * @param options - Optional client configuration
 * @returns A typed client with contract-aware APIs
 *
 * @example
 * ```typescript
 * const chatContract = defineContract({
 *   serverEvents: {
 *     "chat.message": payload<{ from: string; text: string }>(),
 *     "user.joined": payload<{ userId: string }>(),
 *   },
 *   clientEvents: {
 *     "message.send": payload<{ text: string }>(),
 *     "typing.start": payload<{ conversationId: string }>(),
 *   },
 * });
 *
 * const client = createTypedClient(chatContract, "wss://example.com/ws", {
 *   reconnection: { enabled: true, maxAttempts: 10 },
 * });
 *
 * // Type-safe listeners
 * client.on("chat.message", (data) => {
 *   console.log(`${data.from}: ${data.text}`);
 * });
 *
 * // Type-safe emits
 * client.emit("message.send", { text: "Hello!" });
 * ```
 */
export function createTypedClient<C extends Contract>(
  contract: C,
  url: string,
  options?: VeraniClientOptions,
): TypedClient<C> {
  const client = new VeraniClient(url, options);

  // Track listeners for unsubscribe functionality
  const listenerMap = new Map<string, Map<Function, Function>>();

  // Check if contract has validation
  const hasValidation = isValidatedContract(contract);
  const onValidationError = hasValidation ? getValidationErrorHandler(contract) : undefined;

  const typedClient: TypedClient<C> = {
    // Type-safe event methods
    on<E extends ServerEventNames<C>>(
      event: E,
      callback: (data: ServerPayload<C, E>) => void,
    ): () => void {
      // Store the original callback mapped to a wrapper
      if (!listenerMap.has(event as string)) {
        listenerMap.set(event as string, new Map());
      }

      // Create wrapper with optional validation
      const wrapper = (data: unknown) => {
        // Apply validation if contract has validators
        if (hasValidation) {
          const validator = getServerValidator(contract, event);
          if (validator) {
            const validated = validateData(
              validator,
              data,
              event as string,
              "server",
              onValidationError,
            );
            if (validated === undefined) {
              // Validation failed - don't call callback
              return;
            }
            callback(validated as ServerPayload<C, E>);
            return;
          }
        }

        callback(data as ServerPayload<C, E>);
      };

      listenerMap.get(event as string)!.set(callback, wrapper);
      client.on(event as string, wrapper);

      // Return unsubscribe function
      return () => {
        const eventListeners = listenerMap.get(event as string);
        const storedWrapper = eventListeners?.get(callback);
        if (storedWrapper) {
          client.off(event as string, storedWrapper as (data: unknown) => void);
          eventListeners?.delete(callback);
        }
      };
    },

    off<E extends ServerEventNames<C>>(
      event: E,
      callback: (data: ServerPayload<C, E>) => void,
    ): void {
      const eventListeners = listenerMap.get(event as string);
      const wrapper = eventListeners?.get(callback);
      if (wrapper) {
        client.off(event as string, wrapper as (data: unknown) => void);
        eventListeners?.delete(callback);
      }
    },

    once<E extends ServerEventNames<C>>(
      event: E,
      callback: (data: ServerPayload<C, E>) => void,
    ): void {
      client.once(event as string, (data: unknown) => {
        callback(data as ServerPayload<C, E>);
      });
    },

    emit<E extends ClientEventNames<C>>(
      event: E,
      data: ClientPayload<C, E>,
    ): void {
      client.emit(event as string, data);
    },

    // Connection lifecycle methods
    onOpen(callback: () => void): void {
      client.onOpen(callback);
    },

    onClose(callback: (event: CloseEvent) => void): void {
      client.onClose(callback);
    },

    onError(callback: (error: Event) => void): void {
      client.onError(callback);
    },

    onStateChange(callback: (state: ConnectionState) => void): void {
      client.onStateChange(callback);
    },

    getState(): ConnectionState {
      return client.getState();
    },

    isConnected(): boolean {
      return client.isConnected();
    },

    get isConnecting(): boolean {
      return (client as unknown as { isConnecting: boolean }).isConnecting;
    },

    getConnectionState() {
      return client.getConnectionState();
    },

    waitForConnection(): Promise<void> {
      return client.waitForConnection();
    },

    reconnect(): void {
      client.reconnect();
    },

    disconnect(): void {
      client.disconnect();
    },

    close(): void {
      client.close();
      listenerMap.clear();
    },

    // Internal access
    get _client() {
      return client;
    },

    contract,
  };

  return typedClient;
}

// ============================================================================
// Re-exports
// ============================================================================

export type { VeraniClientOptions } from "../client/client";
export type { ConnectionState } from "../client/connection";

