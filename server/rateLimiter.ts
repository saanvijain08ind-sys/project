/**
 * Strict Per-Connection Sliding Window Rate Limiter
 * Enforces max allowed updates/second to prevent socket flooding.
 */

export interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
  retryAfterMs: number;
}

export class SlidingWindowRateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly hits: Map<string, number[]>;

  constructor(maxRequests: number = 5, windowMs: number = 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.hits = new Map();

    // Periodic sweep to prevent unbounded memory growth from disconnected sockets
    setInterval(() => {
      this.cleanup();
    }, 60000).unref();
  }

  /**
   * Evaluates if an incoming event from socketId exceeds the rate limit.
   */
  public check(socketId: string): RateLimitResult {
    const now = Date.now();
    const timestamps = this.hits.get(socketId) || [];

    // Filter out timestamps older than the sliding window
    const windowStart = now - this.windowMs;
    const validTimestamps = timestamps.filter((t) => t > windowStart);

    if (validTimestamps.length >= this.maxRequests) {
      const oldestInWindow = validTimestamps[0];
      const retryAfterMs = Math.max(0, oldestInWindow + this.windowMs - now);

      this.hits.set(socketId, validTimestamps);
      return {
        allowed: false,
        currentCount: validTimestamps.length,
        limit: this.maxRequests,
        retryAfterMs,
      };
    }

    // Record this hit
    validTimestamps.push(now);
    this.hits.set(socketId, validTimestamps);

    return {
      allowed: true,
      currentCount: validTimestamps.length,
      limit: this.maxRequests,
      retryAfterMs: 0,
    };
  }

  /**
   * Resets rate tracking for a specific socket when it disconnects.
   */
  public reset(socketId: string): void {
    this.hits.delete(socketId);
  }

  /**
   * Removes stale entries
   */
  private cleanup(): void {
    const cutoff = Date.now() - this.windowMs;
    for (const [socketId, timestamps] of this.hits.entries()) {
      const active = timestamps.filter((t) => t > cutoff);
      if (active.length === 0) {
        this.hits.delete(socketId);
      } else {
        this.hits.set(socketId, active);
      }
    }
  }
}
