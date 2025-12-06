import type { ConnectionState } from "./connection";

/**
 * Detailed connection state information
 */
export interface ConnectionStateInfo {
  state: ConnectionState;
  isConnected: boolean;
  isConnecting: boolean;
  reconnectAttempts: number;
  connectionId: number;
}

/**
 * Connection promise state for awaiting connection establishment
 */
export interface ConnectionPromiseState {
  promise?: Promise<void>;
  resolve?: () => void;
  reject?: (error: Error) => void;
  clear(): void;
}

/**
 * Connection timeout state
 */
export interface ConnectionTimeoutState {
  value: number | undefined;
  clear(): void;
}

/**
 * Partial connection promise state (used in handlers)
 */
export interface PartialConnectionPromiseState {
  resolve?: () => void;
  reject?: (error: Error) => void;
  clear: () => void;
}

/**
 * Document-like interface for browser environment detection
 */
export interface DocumentLike {
  hidden: boolean;
  addEventListener: (type: string, handler: () => void) => void;
  removeEventListener: (type: string, handler: () => void) => void;
}

/**
 * Reference object for tracking connection state
 */
export interface IsConnectingRef {
  value: boolean;
}
