// lib/auth/rateLimit.ts
// Simple in-memory rate limiter for auth endpoints.
// Uses a sliding window per IP+route to prevent brute-force and abuse.
// Intentionally lightweight — no external Redis/Upstash dependency — to avoid
// adding memory pressure alongside the existing Puppeteer Chromium instance.

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up old entries every 10 minutes to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now - entry.windowStart > 10 * 60 * 1000) {
      store.delete(key);
    }
  }
}, 10 * 60 * 1000);

/**
 * Check and update rate limit for a given key.
 * @param key       Unique key (e.g., `login:${ip}`)
 * @param limit     Maximum requests allowed per window
 * @param windowMs  Window size in milliseconds
 * @returns `allowed: true` if within limit, `allowed: false` if exceeded
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    // Start new window
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  if (entry.count >= limit) {
    const retryAfterMs = windowMs - (now - entry.windowStart);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  entry.count += 1;
  return { allowed: true, remaining: limit - entry.count, retryAfterMs: 0 };
}

// ─── Preconfigured limits ─────────────────────────────────────────────────────

/** 5 login attempts per 15 minutes per IP */
export function loginRateLimit(ip: string) {
  return checkRateLimit(`login:${ip}`, 5, 15 * 60 * 1000);
}

/** 3 forgot-password requests per 15 minutes per IP */
export function forgotPasswordRateLimit(ip: string) {
  return checkRateLimit(`forgot:${ip}`, 3, 15 * 60 * 1000);
}

/** 5 password reset submissions per 15 minutes per IP */
export function resetPasswordRateLimit(ip: string) {
  return checkRateLimit(`reset:${ip}`, 5, 15 * 60 * 1000);
}

/** 10 PDF generation requests per hour per user */
export function pdfGenerationRateLimit(userId: string) {
  return checkRateLimit(`pdf:${userId}`, 10, 60 * 60 * 1000);
}

/**
 * Extract client IP from request headers (works behind Vercel/Render/Cloudflare proxies).
 */
export function getClientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf;
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'unknown';
}
