import { Hono } from 'hono';
import { authEnabled } from './env.ts';
import { AppError, badRequest } from './errors.ts';
import { endSession, hasSession, passwordMatches, rateLimit, startSession } from './middleware.ts';
import * as v from './validate.ts';
import * as yt from './youtube/service.ts';
import { diagnoseStream, proxyStream, type AudioPref } from './youtube/stream.ts';

async function jsonBody(req: { json(): Promise<unknown> }): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (typeof body === 'object' && body !== null && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // rơi xuống lỗi bên dưới
  }
  throw badRequest('Dữ liệu gửi lên không hợp lệ.');
}

// ---------- Đăng nhập ----------

export const auth = new Hono()
  .post('/login', rateLimit('login', 5), rateLimit('login-all', 20, 60_000, false), async (c) => {
    if (!authEnabled()) return c.json({ ok: true });
    const body = await jsonBody(c.req);
    if (typeof body.password !== 'string' || !(await passwordMatches(body.password))) {
      throw new AppError('WRONG_PASSWORD', 'Sai mật khẩu, bạn thử lại nhé.', 401);
    }
    await startSession(c);
    return c.json({ ok: true });
  })
  .post('/logout', (c) => {
    endSession(c);
    return c.json({ ok: true });
  })
  .get('/me', async (c) => c.json({ authRequired: authEnabled(), authenticated: await hasSession(c) }));

// ---------- Dữ liệu YouTube Music ----------

const SHORT = 'private, max-age=300';
const LONG = 'private, max-age=3600';

export const music = new Hono()
  .get('/search', rateLimit('search', 30), async (c) => {
    const result = await yt.search(v.query(c.req.query('q')), v.searchType(c.req.query('type')));
    c.header('cache-control', SHORT);
    return c.json(result);
  })
  .get('/search/suggestions', rateLimit('suggest', 120), async (c) => {
    const result = await yt.suggestions(v.query(c.req.query('q'), 100));
    c.header('cache-control', LONG);
    return c.json(result);
  })
  .get('/track/:videoId', async (c) => {
    c.header('cache-control', LONG);
    return c.json(await yt.track(v.videoId(c.req.param('videoId'))));
  })
  .get('/up-next/:videoId', async (c) => {
    c.header('cache-control', SHORT);
    return c.json(await yt.upNext(v.videoId(c.req.param('videoId'))));
  })
  .get('/lyrics/:videoId', async (c) => {
    c.header('cache-control', LONG);
    return c.json(await yt.lyrics(v.videoId(c.req.param('videoId'))));
  })
  .get('/album/:id', async (c) => {
    c.header('cache-control', LONG);
    return c.json(await yt.album(v.browseId(c.req.param('id'))));
  })
  .get('/artist/:id', async (c) => {
    c.header('cache-control', LONG);
    return c.json(await yt.artist(v.browseId(c.req.param('id'))));
  })
  .get('/playlist/:id', async (c) => {
    c.header('cache-control', SHORT);
    return c.json(await yt.playlist(v.browseId(c.req.param('id'))));
  })
  .get('/home', async (c) => {
    const filter = c.req.query('filter')?.slice(0, 50) || undefined;
    c.header('cache-control', SHORT);
    return c.json(await yt.home(filter));
  })
  .get('/stream/:videoId', rateLimit('stream', 120), async (c) => {
    const id = v.videoId(c.req.param('videoId'));
    const pref: AudioPref = c.req.query('format') === 'm4a' ? 'm4a' : 'opus';
    return proxyStream(id, pref, c.req.header('range'));
  })
  .get('/debug/stream', rateLimit('debug', 5), async (c) => {
    // Chẩn đoán vì sao không phát được: thử mọi client InnerTube trên máy chủ hiện tại.
    const id = v.videoId(c.req.query('v') ?? 'qHpE45b4INk');
    c.header('cache-control', 'no-store');
    return c.json(await diagnoseStream(id));
  })
  .get('/image', async (c) => {
    // Proxy ảnh bìa để trình duyệt đọc được pixel (lấy màu chủ đạo) mà không vướng CORS.
    const raw = c.req.query('url') ?? '';
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw badRequest('URL ảnh không hợp lệ.');
    }
    if (url.protocol !== 'https:' || !/(^|\.)(googleusercontent\.com|ytimg\.com|ggpht\.com)$/.test(url.hostname)) {
      throw badRequest('Chỉ hỗ trợ ảnh từ YouTube.');
    }
    // Không đi theo redirect: tránh bị dẫn sang host khác ngoài danh sách cho phép.
    const res = await fetch(url, { redirect: 'error' }).catch(() => {
      throw new AppError('UPSTREAM', 'Không tải được ảnh.', 502);
    });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.startsWith('image/')) {
      await res.body?.cancel();
      throw new AppError('UPSTREAM', 'Không tải được ảnh.', 502);
    }
    return new Response(res.body, {
      headers: { 'content-type': type, 'cache-control': 'private, max-age=86400' },
    });
  });
