/**
 * Verani Typed Client - Type-Safe WebSocket Client
 *
 * Client-side entry point for the typed Verani SDK.
 * Import from "verani/typed/client" for browser/client environments.
 *
 * @example
 * ```typescript
 * import { createTypedClient } from "verani/typed/client";
 * import { chatContract } from "./contracts/chat";
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
// Client Integration
// ============================================================================

export { createTypedClient } from "./client";

export type {
  TypedClient,
  VeraniClientOptions,
  ConnectionState,
} from "./client";

// ============================================================================
// Contract Definition (for sharing with server)
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
// Type Inference Utilities
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
// Validation (Optional)
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

