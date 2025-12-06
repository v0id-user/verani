/**
 * Echo Contract - Shared between server and client
 *
 * Defines the events for a simple echo system.
 */
import { defineContract, payload } from "../../src/typed";

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

