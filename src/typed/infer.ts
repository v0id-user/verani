/**
 * Type Inference Utilities for Verani Contracts
 *
 * Provides type helpers for extracting event types, payloads, and channels
 * from contract definitions. These utilities power the type-safe APIs.
 *
 * @packageDocumentation
 */

import type {
  Contract,
  EventMap,
  PayloadMarker,
} from "./contract";

// ============================================================================
// Event Type Extraction
// ============================================================================

/**
 * Extracts the server events map from a contract.
 * Server events are sent from server to client.
 */
export type InferServerEvents<C extends Contract> =
  C extends Contract<infer S, EventMap, readonly string[]> ? S : never;

/**
 * Extracts the client events map from a contract.
 * Client events are sent from client to server.
 */
export type InferClientEvents<C extends Contract> =
  C extends Contract<EventMap, infer E, readonly string[]> ? E : never;

/**
 * Extracts the channel names from a contract.
 */
export type InferChannels<C extends Contract> =
  C extends Contract<EventMap, EventMap, infer Ch> ? Ch[number] : string;

// ============================================================================
// Event Name Extraction
// ============================================================================

/**
 * Gets all server event names as a union type.
 */
export type ServerEventNames<C extends Contract> = keyof InferServerEvents<C> &
  string;

/**
 * Gets all client event names as a union type.
 */
export type ClientEventNames<C extends Contract> = keyof InferClientEvents<C> &
  string;

/**
 * Gets all event names (both directions) as a union type.
 */
export type AllEventNames<C extends Contract> =
  | ServerEventNames<C>
  | ClientEventNames<C>;

// ============================================================================
// Payload Extraction
// ============================================================================

/**
 * Extracts the payload type for a specific server event.
 */
export type ServerPayload<
  C extends Contract,
  E extends ServerEventNames<C>,
> = InferServerEvents<C>[E] extends PayloadMarker<infer P> ? P : never;

/**
 * Extracts the payload type for a specific client event.
 */
export type ClientPayload<
  C extends Contract,
  E extends ClientEventNames<C>,
> = InferClientEvents<C>[E] extends PayloadMarker<infer P> ? P : never;

// ============================================================================
// Payload Maps (Resolved)
// ============================================================================

/**
 * Converts server events to a map of event names to resolved payload types.
 */
export type ServerPayloadMap<C extends Contract> = {
  [K in ServerEventNames<C>]: ServerPayload<C, K>;
};

/**
 * Converts client events to a map of event names to resolved payload types.
 */
export type ClientPayloadMap<C extends Contract> = {
  [K in ClientEventNames<C>]: ClientPayload<C, K>;
};

// ============================================================================
// Handler Types
// ============================================================================

/**
 * Type for a server event handler function.
 * Receives typed data based on the event name.
 */
export type ServerEventHandler<
  C extends Contract,
  E extends ServerEventNames<C>,
> = (data: ServerPayload<C, E>) => void;

/**
 * Type for a client event handler function.
 * Receives typed data based on the event name.
 */
export type ClientEventHandler<
  C extends Contract,
  E extends ClientEventNames<C>,
> = (data: ClientPayload<C, E>) => void;

// ============================================================================
// Emit Types
// ============================================================================

/**
 * Typed emit function for server events.
 * Constrains event names and payload types.
 */
export interface TypedServerEmit<C extends Contract> {
  <E extends ServerEventNames<C>>(event: E, data: ServerPayload<C, E>): void;
}

/**
 * Typed emit function for client events.
 * Constrains event names and payload types.
 */
export interface TypedClientEmit<C extends Contract> {
  <E extends ClientEventNames<C>>(event: E, data: ClientPayload<C, E>): void;
}

// ============================================================================
// Listener Types
// ============================================================================

/**
 * Typed listener registration for server events (used by client).
 */
export interface TypedServerListener<C extends Contract> {
  <E extends ServerEventNames<C>>(
    event: E,
    handler: ServerEventHandler<C, E>,
  ): () => void;
}

/**
 * Typed listener registration for client events (used by server).
 */
export interface TypedClientListener<C extends Contract> {
  <E extends ClientEventNames<C>>(
    event: E,
    handler: ClientEventHandler<C, E>,
  ): void;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Makes specific properties of a type required.
 */
export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Checks if a type is never.
 */
export type IsNever<T> = [T] extends [never] ? true : false;

/**
 * Ensures an event exists in the event map.
 */
export type AssertEvent<
  TEvents extends EventMap,
  E extends string,
> = E extends keyof TEvents ? E : never;

