/**
 * Optional Validation Layer for Verani Contracts
 *
 * Provides runtime validation integration with Zod or any compatible validator.
 * Validation enriches contracts without replacing them - types are preserved
 * while adding runtime safety.
 *
 * @example
 * ```typescript
 * import { z } from "zod";
 *
 * const validatedContract = withValidation(chatContract, {
 *   clientEvents: {
 *     "message.send": z.object({ text: z.string().min(1).max(1000) }),
 *   },
 *   serverEvents: {
 *     "chat.message": z.object({
 *       from: z.string(),
 *       text: z.string(),
 *       timestamp: z.number(),
 *     }),
 *   },
 * });
 * ```
 *
 * @packageDocumentation
 */

import type { Contract, EventMap, ExtractPayload } from "./contract";
import type { ServerEventNames, ClientEventNames, ServerPayload, ClientPayload } from "./infer";

// ============================================================================
// Validator Types
// ============================================================================

/**
 * Generic validator interface compatible with Zod and similar libraries.
 * Any object with a `safeParse` method can be used as a validator.
 */
export interface Validator<T = unknown> {
  /**
   * Safely parse and validate input.
   * Returns a result object with success status and data or error.
   */
  safeParse(data: unknown): ValidationResult<T>;
}

/**
 * Result of a validation attempt.
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: ValidationError };

/**
 * Validation error with issues array.
 */
export interface ValidationError {
  issues: ValidationIssue[];
}

/**
 * Individual validation issue.
 */
export interface ValidationIssue {
  message: string;
  path?: (string | number)[];
  code?: string;
}

// ============================================================================
// Validated Contract Types
// ============================================================================

/**
 * Map of event names to validators.
 */
export type ValidatorMap<TEvents extends EventMap> = {
  [K in keyof TEvents]?: Validator<ExtractPayload<TEvents[K]>>;
};

/**
 * Configuration for adding validation to a contract.
 */
export interface ValidationConfig<C extends Contract> {
  /**
   * Validators for client events (validated on server when receiving).
   */
  clientEvents?: {
    [K in ClientEventNames<C>]?: Validator<ClientPayload<C, K>>;
  };

  /**
   * Validators for server events (validated on client when receiving).
   */
  serverEvents?: {
    [K in ServerEventNames<C>]?: Validator<ServerPayload<C, K>>;
  };

  /**
   * Called when validation fails.
   * Default behavior logs a warning.
   */
  onValidationError?: (
    event: string,
    error: ValidationError,
    direction: "client" | "server",
  ) => void;
}

/**
 * Contract enriched with validation metadata.
 */
export interface ValidatedContract<C extends Contract> extends Contract {
  /**
   * The original contract
   */
  readonly _baseContract: C;

  /**
   * Validation configuration
   */
  readonly _validation: ValidationConfig<C>;

  /**
   * Brand to identify validated contracts
   */
  readonly _validatedBrand: "ValidatedVeraniContract";
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Default validation error handler.
 */
function defaultOnValidationError(
  event: string,
  error: ValidationError,
  direction: "client" | "server",
): void {
  console.warn(
    `[Verani] Validation failed for ${direction} event "${event}":`,
    error.issues.map((i) => i.message).join(", "),
  );
}

/**
 * Validates data using a validator.
 * Returns the validated data or undefined if validation fails.
 */
export function validateData<T>(
  validator: Validator<T>,
  data: unknown,
  event: string,
  direction: "client" | "server",
  onError?: (event: string, error: ValidationError, direction: "client" | "server") => void,
): T | undefined {
  const result = validator.safeParse(data);

  if (result.success) {
    return result.data;
  }

  (onError ?? defaultOnValidationError)(event, result.error, direction);
  return undefined;
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Enriches a contract with runtime validation.
 *
 * Validators are applied:
 * - **Server side**: Client event validators run before handlers receive data
 * - **Client side**: Server event validators run before listeners receive data
 *
 * @param contract - The base contract to enrich
 * @param config - Validation configuration with validators for events
 * @returns A validated contract that can be used with createTypedRoom/createTypedClient
 *
 * @example
 * ```typescript
 * import { z } from "zod";
 *
 * const chatContract = defineContract({
 *   serverEvents: {
 *     "chat.message": payload<{ from: string; text: string }>(),
 *   },
 *   clientEvents: {
 *     "message.send": payload<{ text: string }>(),
 *   },
 * });
 *
 * const validatedContract = withValidation(chatContract, {
 *   clientEvents: {
 *     "message.send": z.object({
 *       text: z.string().min(1).max(1000),
 *     }),
 *   },
 *   serverEvents: {
 *     "chat.message": z.object({
 *       from: z.string(),
 *       text: z.string(),
 *     }),
 *   },
 *   onValidationError: (event, error, direction) => {
 *     console.error(`Validation failed for ${event}:`, error.issues);
 *   },
 * });
 *
 * // Use with typed room - validation runs automatically
 * const room = createTypedRoom(validatedContract, { ... });
 * ```
 */
export function withValidation<C extends Contract>(
  contract: C,
  config: ValidationConfig<C>,
): ValidatedContract<C> {
  return {
    ...contract,
    _baseContract: contract,
    _validation: config,
    _validatedBrand: "ValidatedVeraniContract",
  } as ValidatedContract<C>;
}

/**
 * Type guard to check if a contract has validation.
 */
export function isValidatedContract<C extends Contract>(
  contract: C,
): contract is C & ValidatedContract<C> {
  return (
    "_validatedBrand" in contract &&
    (contract as unknown as ValidatedContract<C>)._validatedBrand ===
      "ValidatedVeraniContract"
  );
}

/**
 * Gets the client event validator for a specific event.
 */
export function getClientValidator<C extends Contract, E extends ClientEventNames<C>>(
  contract: C | ValidatedContract<C>,
  event: E,
): Validator<ClientPayload<C, E>> | undefined {
  if (!isValidatedContract(contract)) {
    return undefined;
  }

  const validators = contract._validation.clientEvents;
  return validators?.[event] as Validator<ClientPayload<C, E>> | undefined;
}

/**
 * Gets the server event validator for a specific event.
 */
export function getServerValidator<C extends Contract, E extends ServerEventNames<C>>(
  contract: C | ValidatedContract<C>,
  event: E,
): Validator<ServerPayload<C, E>> | undefined {
  if (!isValidatedContract(contract)) {
    return undefined;
  }

  const validators = contract._validation.serverEvents;
  return validators?.[event] as Validator<ServerPayload<C, E>> | undefined;
}

/**
 * Gets the validation error handler from a validated contract.
 */
export function getValidationErrorHandler<C extends Contract>(
  contract: C | ValidatedContract<C>,
): ((event: string, error: ValidationError, direction: "client" | "server") => void) | undefined {
  if (!isValidatedContract(contract)) {
    return undefined;
  }

  return contract._validation.onValidationError;
}

// ============================================================================
// Validated Wrapper Helpers
// ============================================================================

/**
 * Creates a validated handler wrapper for server-side event handlers.
 * Used internally by createTypedRoom when using validated contracts.
 */
export function createValidatedHandler<C extends Contract, E extends ClientEventNames<C>>(
  contract: C | ValidatedContract<C>,
  event: E,
  handler: (data: ClientPayload<C, E>) => void | Promise<void>,
): (data: unknown) => void | Promise<void> {
  const validator = getClientValidator(contract, event);
  const onError = getValidationErrorHandler(contract);

  if (!validator) {
    return handler as (data: unknown) => void | Promise<void>;
  }

  return (data: unknown) => {
    const validated = validateData(validator, data, event as string, "client", onError);
    if (validated !== undefined) {
      return handler(validated);
    }
    // Validation failed - handler is not called
  };
}

/**
 * Creates a validated listener wrapper for client-side event listeners.
 * Used internally by createTypedClient when using validated contracts.
 */
export function createValidatedListener<C extends Contract, E extends ServerEventNames<C>>(
  contract: C | ValidatedContract<C>,
  event: E,
  callback: (data: ServerPayload<C, E>) => void,
): (data: unknown) => void {
  const validator = getServerValidator(contract, event);
  const onError = getValidationErrorHandler(contract);

  if (!validator) {
    return callback as (data: unknown) => void;
  }

  return (data: unknown) => {
    const validated = validateData(validator, data, event as string, "server", onError);
    if (validated !== undefined) {
      callback(validated);
    }
    // Validation failed - callback is not called
  };
}

