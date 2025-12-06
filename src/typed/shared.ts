/**
 * Shared Types and Utilities for Verani Typed
 *
 * This module contains contract definitions and type utilities that are safe
 * to use in both server (Cloudflare Workers) and client (browser) environments.
 *
 * NO RUNTIME DEPENDENCIES - pure TypeScript types and minimal runtime helpers.
 *
 * @packageDocumentation
 */

// ============================================================================
// Contract Definition (Zero Runtime Cost)
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
  // Emit types
  TypedServerEmit,
  TypedClientEmit,
  // Listener types
  TypedServerListener,
  TypedClientListener,
} from "./infer";

// ============================================================================
// Validation Types (No Server Dependencies)
// ============================================================================

export {
  withValidation,
  isValidatedContract,
  validateData,
} from "./validation";

export type {
  Validator,
  ValidationResult,
  ValidationError,
  ValidationIssue,
  ValidatorMap,
  ValidationConfig,
  ValidatedContract,
} from "./validation";

