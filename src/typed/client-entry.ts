/**
 * Verani Typed - Client Entry Point
 *
 * ✅ CLIENT-SAFE: This module has NO Cloudflare/server dependencies.
 * Safe for browsers, React Native, Node.js clients, and any JavaScript runtime.
 *
 * This module provides:
 * - `createTypedClient()` - Type-safe WebSocket client
 * - Contract definitions (shared with server)
 * - Type utilities for payloads and events
 * - Optional validation support
 *
 * @example
 * ```typescript
 * // Client code (browser, React Native, Node.js)
 * import { createTypedClient, defineContract, payload } from "verani/typed/client";
 *
 * // Define contract (or import from shared module)
 * const chatContract = defineContract({
 *   serverEvents: {
 *     "chat.message": payload<{ from: string; text: string }>(),
 *   },
 *   clientEvents: {
 *     "message.send": payload<{ text: string }>(),
 *   },
 * });
 *
 * const client = createTypedClient(chatContract, "wss://example.com/ws");
 *
 * client.on("chat.message", (data) => {
 *   console.log(`${data.from}: ${data.text}`);
 * });
 *
 * client.emit("message.send", { text: "Hello!" });
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// Client Integration (No Server Dependencies)
// ============================================================================

export { createTypedClient } from "./client";

export type {
  TypedClient,
  VeraniClientOptions,
  ConnectionState,
} from "./client";

// ============================================================================
// Contract Definition (Shared - Zero Runtime Cost)
// ============================================================================

export {
  defineContract,
  payload,
  isContract,
} from "./contract";

export type {
  Contract,
  ContractDefinition,
  EventMap,
  PayloadMarker,
  ExtractPayload,
  EventPayloads,
} from "./contract";

// ============================================================================
// Type Inference Utilities (Pure Types)
// ============================================================================

export type {
  // Event extraction
  InferServerEvents,
  InferClientEvents,
  InferChannels,
  // Event names
  ServerEventNames,
  ClientEventNames,
  AllEventNames,
  // Payload extraction
  ServerPayload,
  ClientPayload,
  ServerPayloadMap,
  ClientPayloadMap,
  // Handler types
  ServerEventHandler,
  ClientEventHandler,
} from "./infer";

// ============================================================================
// Validation (Client-Safe Utilities)
// ============================================================================

export {
  withValidation,
  isValidatedContract,
  validateData,
  getServerValidator,
  createValidatedListener,
} from "./validation";

export type {
  Validator,
  ValidationResult,
  ValidationError,
  ValidationIssue,
  ValidatedContract,
} from "./validation";
