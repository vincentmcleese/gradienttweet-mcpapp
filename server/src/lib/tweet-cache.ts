import type { TweetData } from "./apify.js";

/**
 * Cache entry for a tweet fetch request
 */
export interface TweetCacheEntry {
  status: "loading" | "ready" | "error";
  data?: TweetData;
  error?: string;
  createdAt: number;
}

// In-memory cache for tweet fetch requests
const cache = new Map<string, TweetCacheEntry>();

// TTL for cache entries (5 minutes)
const CACHE_TTL_MS = 5 * 60 * 1000;

// Cleanup interval (1 minute)
const CLEANUP_INTERVAL_MS = 60 * 1000;

// Simple logger
const log = {
  info: (msg: string, data?: unknown) => {
    console.log(`[INFO][TweetCache] ${msg}`, data !== undefined ? JSON.stringify(data, null, 2) : "");
  },
};

/**
 * Set a cache entry to loading state
 */
export function setLoading(requestId: string): void {
  log.info(`Setting loading state for requestId: ${requestId}`);
  cache.set(requestId, {
    status: "loading",
    createdAt: Date.now(),
  });
}

/**
 * Set a cache entry to ready state with data
 */
export function setReady(requestId: string, data: TweetData): void {
  log.info(`Setting ready state for requestId: ${requestId}`, data);
  cache.set(requestId, {
    status: "ready",
    data,
    createdAt: Date.now(),
  });
}

/**
 * Set a cache entry to error state
 */
export function setError(requestId: string, error: string): void {
  log.info(`Setting error state for requestId: ${requestId}, error: ${error}`);
  cache.set(requestId, {
    status: "error",
    error,
    createdAt: Date.now(),
  });
}

/**
 * Get a cache entry by requestId
 */
export function get(requestId: string): TweetCacheEntry | undefined {
  const entry = cache.get(requestId);
  log.info(`Getting cache entry for requestId: ${requestId}`, entry);
  return entry;
}

/**
 * Cleanup expired cache entries
 */
function cleanup(): void {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [requestId, entry] of cache.entries()) {
    if (now - entry.createdAt > CACHE_TTL_MS) {
      cache.delete(requestId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    log.info(`Cleaned up ${cleaned} expired cache entries`);
  }
}

// Start cleanup interval
setInterval(cleanup, CLEANUP_INTERVAL_MS);

log.info("Tweet cache initialized");

