import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { config } from './env.ts';
import { errorHandler, requireAuth } from './middleware.ts';
import { auth, me, music } from './routes.ts';

/** Ứng dụng Hono dùng chung cho Supabase Edge Function (Deno) và server Node. */
export function createApp(): Hono {
  const app = new Hono().basePath('/api');
  app.onError(errorHandler);
  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Không có API này.' } }, 404));

  const { corsOrigin } = config();
  if (corsOrigin) {
    app.use('*', cors({ origin: corsOrigin, credentials: true, exposeHeaders: ['content-range', 'content-length'] }));
  }

  app.get('/health', (c) => c.json({ ok: true }));
  app.use('*', requireAuth);
  app.route('/auth', auth);
  app.route('/me', me);
  app.route('/', music);
  return app;
}
