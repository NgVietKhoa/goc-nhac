import type { Context, ErrorHandler, MiddlewareHandler } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { hitRateLimit } from './db/repos.ts';
import { config } from './env.ts';
import { AppError } from './errors.ts';

export const SESSION_COOKIE = 'gn_session';
const SESSION_DAYS = 30;

const encoder = new TextEncoder();

async function hmacHex(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(config().sessionSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** So sánh mật khẩu qua HMAC để thời gian so sánh không phụ thuộc nội dung. */
export async function passwordMatches(input: string): Promise<boolean> {
  const [a, b] = await Promise.all([hmacHex(input), hmacHex(config().appPassword)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function cookieOptions(c: Context) {
  const crossSite = Boolean(config().corsOrigin);
  const secure = crossSite || new URL(c.req.url).protocol === 'https:' || c.req.header('x-forwarded-proto') === 'https';
  return {
    path: '/',
    httpOnly: true,
    secure,
    // FE và API khác domain thì cookie phải là SameSite=None (bắt buộc kèm Secure).
    sameSite: crossSite ? ('None' as const) : ('Lax' as const),
  };
}

export async function startSession(c: Context): Promise<void> {
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  await setSignedCookie(c, SESSION_COOKIE, String(expires), config().sessionSecret, {
    ...cookieOptions(c),
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export function endSession(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, cookieOptions(c));
}

export async function hasSession(c: Context): Promise<boolean> {
  const value = await getSignedCookie(c, config().sessionSecret, SESSION_COOKIE);
  return typeof value === 'string' && Number(value) > Date.now();
}

const PUBLIC_PATHS = ['/api/auth/', '/api/health'];

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (c.req.method === 'OPTIONS' || PUBLIC_PATHS.some((p) => path.startsWith(p))) return next();
  if (!(await hasSession(c))) throw new AppError('UNAUTHORIZED', 'Bạn cần đăng nhập.', 401);
  await next();
};

export function clientIp(c: Context): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    c.req.header('cf-connecting-ip') ||
    'local'
  );
}

/**
 * Rate limit theo cửa sổ cố định, lưu trong Postgres để dùng chung giữa các instance Edge Function.
 * `perIp: false` dùng một bucket chung (vd chống dò mật khẩu từ nhiều IP).
 */
export function rateLimit(name: string, limit: number, windowMs = 60_000, perIp = true): MiddlewareHandler {
  return async (c, next) => {
    const bucket = perIp ? `${name}:${clientIp(c)}` : name;
    let hits = 0;
    try {
      hits = await hitRateLimit(bucket, windowMs);
    } catch (err) {
      console.warn('Rate limit không hoạt động:', err instanceof Error ? err.message : err);
    }
    if (hits > limit) {
      c.header('retry-after', String(Math.ceil(windowMs / 1000)));
      throw new AppError('RATE_LIMITED', 'Bạn thao tác quá nhanh, đợi một chút rồi thử lại.', 429);
    }
    await next();
  };
}

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status);
  }
  console.error(err);
  return c.json({ error: { code: 'INTERNAL', message: 'Lỗi máy chủ, thử lại sau.' } }, 500);
};
