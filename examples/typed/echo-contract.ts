/**
 * Echo Contract - Shared between server and client
 *
 * Defines the events for a simple echo system.
 * Import from "verani/typed/shared" for contract-only usage (no server/client deps).
 */
import { defineContract, payload } from "../../src/typed/shared";

export const echoContract = defineContract({
  // Events the SERVER sends TO the client
  serverEvents: {
    "echo.response": payload<{ message: string; timestamp: number }>(),
    "welcome": payload<{ message: string }>(),
  },
  // Events the CLIENT sends TO the server
  clientEvents: {
    "echo.send": payload<{ message: string }>(),
  },
});

// Export inferred types for convenience
export type EchoContract = typeof echoContract;

