import { DEFAULT_RECONNECTION_CONFIG } from "../connection";
import type { ReconnectionConfig } from "../connection";

/**
 * Client options for configuring the Verani client
 */
export interface VeraniClientOptions {
  /** Reconnection configuration */
  reconnection?: Partial<ReconnectionConfig>;
  /** Maximum number of messages to queue when disconnected */
  maxQueueSize?: number;
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
  /** Ping interval in milliseconds (0 = disabled, default: 5000) */
  pingInterval?: number;
  /** Pong timeout in milliseconds (default: 5000) */
  pongTimeout?: number;
}

/**
 * Internal fully-resolved client options
 */
export interface ResolvedClientOptions {
  reconnection: ReconnectionConfig;
  maxQueueSize: number;
  connectionTimeout: number;
  pingInterval: number;
  pongTimeout: number;
}

/**
 * Resolves client options with defaults
 */
export function resolveClientOptions(options: VeraniClientOptions): ResolvedClientOptions {
  const reconnectionConfig: ReconnectionConfig = {
    enabled: options.reconnection?.enabled ?? DEFAULT_RECONNECTION_CONFIG.enabled,
    maxAttempts: options.reconnection?.maxAttempts ?? DEFAULT_RECONNECTION_CONFIG.maxAttempts,
    initialDelay: options.reconnection?.initialDelay ?? DEFAULT_RECONNECTION_CONFIG.initialDelay,
    maxDelay: options.reconnection?.maxDelay ?? DEFAULT_RECONNECTION_CONFIG.maxDelay,
    backoffMultiplier: options.reconnection?.backoffMultiplier ?? DEFAULT_RECONNECTION_CONFIG.backoffMultiplier
  };

  return {
    reconnection: reconnectionConfig,
    maxQueueSize: options.maxQueueSize ?? 100,
    connectionTimeout: options.connectionTimeout ?? 10000,
    pingInterval: options.pingInterval ?? 5000,
    pongTimeout: options.pongTimeout ?? 5000
  };
}

