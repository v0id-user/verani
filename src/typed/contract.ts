/**
 * Contract Definition API for Type-Safe Verani
 *
 * Provides compile-time type safety for WebSocket events with zero runtime cost.
 * The contract defines bidirectional events (server→client, client→server)
 * and optional typed channels.
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
 *   channels: ["default", "announcements"] as const,
 * });
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// Payload Marker Types
// ============================================================================

/**
 * Symbol used to brand payload markers for type extraction
 */
declare const PayloadBrand: unique symbol;

/**
 * Marker type for payload definitions.
 * This is a compile-time only construct with no runtime representation.
 */
export interface PayloadMarker<T> {
  readonly [PayloadBrand]: T;
}

/**
 * Creates a typed payload marker for contract definitions.
 * This function has zero runtime cost - it simply returns an empty object
 * that TypeScript uses for type inference.
 *
 * @example
 * ```typescript
 * const contract = defineContract({
 *   serverEvents: {
 *     "user.joined": payload<{ userId: string; username: string }>(),
 *   },
 *   clientEvents: {
 *     "message.send": payload<{ text: string }>(),
 *   },
 * });
 * ```
 */
export function payload<T>(): PayloadMarker<T> {
  return {} as PayloadMarker<T>;
}

// ============================================================================
// Event Map Types
// ============================================================================

/**
 * Map of event names to their payload types.
 * Used for both server and client event definitions.
 */
export type EventMap = Record<string, PayloadMarker<unknown>>;

/**
 * Extracts the payload type from a PayloadMarker
 */
export type ExtractPayload<T> = T extends PayloadMarker<infer P> ? P : never;

/**
 * Converts an EventMap to a record of event names to payload types
 */
export type EventPayloads<T extends EventMap> = {
  [K in keyof T]: ExtractPayload<T[K]>;
};

// ============================================================================
// Contract Types
// ============================================================================

/**
 * Contract definition input shape.
 * This is what users pass to defineContract().
 */
export interface ContractDefinition<
  TServerEvents extends EventMap = EventMap,
  TClientEvents extends EventMap = EventMap,
  TChannels extends readonly string[] = readonly string[],
> {
  /**
   * Events that the server sends to the client.
   * Clients listen for these events, servers emit them.
   */
  serverEvents: TServerEvents;

  /**
   * Events that the client sends to the server.
   * Servers listen for these events, clients emit them.
   */
  clientEvents: TClientEvents;

  /**
   * Optional list of valid channel names.
   * Use `as const` for literal type inference.
   *
   * @example
   * ```typescript
   * channels: ["default", "announcements"] as const
   * ```
   */
  channels?: TChannels;
}

/**
 * Resolved contract with extracted payload types.
 * This is the type returned by defineContract().
 */
export interface Contract<
  TServerEvents extends EventMap = EventMap,
  TClientEvents extends EventMap = EventMap,
  TChannels extends readonly string[] = readonly string[],
> {
  /**
   * Server events definition (preserves PayloadMarker for type extraction)
   */
  readonly serverEvents: TServerEvents;

  /**
   * Client events definition (preserves PayloadMarker for type extraction)
   */
  readonly clientEvents: TClientEvents;

  /**
   * Channel names (typed as literal union if using `as const`)
   */
  readonly channels: TChannels;

  /**
   * Brand to identify this as a Verani contract
   */
  readonly _brand: "VeraniContract";
}

// ============================================================================
// Contract Factory
// ============================================================================

/**
 * Defines a type-safe contract for Verani WebSocket communication.
 *
 * The contract specifies:
 * - **serverEvents**: Events the server sends to clients
 * - **clientEvents**: Events clients send to the server
 * - **channels**: Optional typed channel names
 *
 * @param definition - The contract definition object
 * @returns A typed contract for use with createTypedRoom and createTypedClient
 *
 * @example
 * ```typescript
 * const chatContract = defineContract({
 *   serverEvents: {
 *     "chat.message": payload<{ from: string; text: string; timestamp: number }>(),
 *     "user.joined": payload<{ userId: string; username: string }>(),
 *     "user.left": payload<{ userId: string }>(),
 *   },
 *   clientEvents: {
 *     "message.send": payload<{ text: string }>(),
 *     "typing.start": payload<{ conversationId: string }>(),
 *     "typing.stop": payload<{ conversationId: string }>(),
 *   },
 *   channels: ["default", "announcements"] as const,
 * });
 * ```
 */
export function defineContract<
  TServerEvents extends EventMap,
  TClientEvents extends EventMap,
  TChannels extends readonly string[] = readonly string[],
>(
  definition: ContractDefinition<TServerEvents, TClientEvents, TChannels>,
): Contract<TServerEvents, TClientEvents, TChannels> {
  return {
    serverEvents: definition.serverEvents,
    clientEvents: definition.clientEvents,
    channels: (definition.channels ?? (["default"] as const)) as TChannels,
    _brand: "VeraniContract",
  };
}

// ============================================================================
// Contract Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a Verani contract
 */
export function isContract(value: unknown): value is Contract {
  return (
    typeof value === "object" &&
    value !== null &&
    "_brand" in value &&
    (value as Contract)._brand === "VeraniContract"
  );
}

