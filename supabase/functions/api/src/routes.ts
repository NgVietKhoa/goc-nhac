import { Hono } from 'hono';
import * as repo from './db/repos.ts';
import { isDeno } from './env.ts';
import { AppError, badRequest } from './errors.ts';
import { endSession, hasSession, passwordMatches, rateLimit, startSession } from './middleware.ts';
import * as v from './validate.ts';
import * as yt from './youtube/service.ts';
import { proxyStream, type AudioPref } from './youtube/stream.ts';

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
  .get('/me', async (c) => c.json({ authenticated: await hasSession(c) }));

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
    // Trên Supabase Edge: lần decipher đầu trả 307 để việc stream chạy trong request riêng (xem proxyStream).
    const again = isDeno && c.req.query('r') !== '1' ? `?format=${pref}&r=1` : undefined;
    return proxyStream(id, pref, c.req.header('range'), again);
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

// ---------- Dữ liệu cá nhân ----------

const id = (raw: string | undefined) => v.positiveInt(raw, 'Mã playlist');

export const me = new Hono()
  .get('/playlists', async (c) => c.json(await repo.listPlaylists()))
  .post('/playlists', async (c) => {
    const body = await jsonBody(c.req);
    const playlist = await repo.createPlaylist(
      v.playlistName(body.name),
      typeof body.description === 'string' ? body.description.slice(0, 500) : undefined,
    );
    if (body.tracks !== undefined) await repo.addToPlaylist(playlist.id, v.trackList(body.tracks));
    return c.json(await repo.getPlaylist(playlist.id), 201);
  })
  .get('/playlists/:id', async (c) => c.json(await repo.getPlaylist(id(c.req.param('id')))))
  .patch('/playlists/:id', async (c) => {
    const body = await jsonBody(c.req);
    const patch: { name?: string; description?: string | null } = {};
    if (body.name !== undefined) patch.name = v.playlistName(body.name);
    if (body.description !== undefined) {
      patch.description = typeof body.description === 'string' && body.description.trim() ? body.description.slice(0, 500) : null;
    }
    return c.json(await repo.updatePlaylist(id(c.req.param('id')), patch));
  })
  .delete('/playlists/:id', async (c) => {
    await repo.deletePlaylist(id(c.req.param('id')));
    return c.body(null, 204);
  })
  .post('/playlists/:id/tracks', async (c) => {
    const body = await jsonBody(c.req);
    const tracks = body.tracks !== undefined ? v.trackList(body.tracks) : [v.track(body.track)];
    const added = await repo.addToPlaylist(id(c.req.param('id')), tracks);
    return c.json({ added, skipped: tracks.length - added });
  })
  .delete('/playlists/:id/tracks/:videoId', async (c) => {
    await repo.removeFromPlaylist(id(c.req.param('id')), v.videoId(c.req.param('videoId')));
    return c.body(null, 204);
  })
  .put('/playlists/:id/order', async (c) => {
    const body = await jsonBody(c.req);
    if (!Array.isArray(body.videoIds)) throw badRequest('Thiếu danh sách videoIds.');
    const ids = body.videoIds.map((x) => v.videoId(typeof x === 'string' ? x : undefined));
    await repo.reorderPlaylist(id(c.req.param('id')), ids);
    return c.body(null, 204);
  })
  .get('/likes', async (c) => c.json(await repo.listLikes()))
  .put('/likes/:videoId', async (c) => {
    const body = await jsonBody(c.req);
    const track = v.track(body.track);
    if (track.videoId !== c.req.param('videoId')) throw badRequest('Mã bài hát không khớp.');
    await repo.like(track);
    return c.body(null, 204);
  })
  .delete('/likes/:videoId', async (c) => {
    await repo.unlike(v.videoId(c.req.param('videoId')));
    return c.body(null, 204);
  })
  .get('/history', async (c) => {
    const limit = Math.min(Number(c.req.query('limit')) || 50, 200);
    const before = c.req.query('before') ? v.positiveInt(c.req.query('before'), 'before') : undefined;
    return c.json(await repo.listHistory(limit, before));
  })
  .post('/history', async (c) => {
    const body = await jsonBody(c.req);
    const listened = typeof body.listenedSec === 'number' ? Math.round(body.listenedSec) : NaN;
    if (!Number.isFinite(listened) || listened < 30) throw badRequest('Chỉ ghi lịch sử khi đã nghe quá 30 giây.');
    await repo.addHistory(v.track(body.track), Math.min(listened, 86_400));
    return c.body(null, 204);
  })
  .delete('/history', async (c) => {
    await repo.clearHistory();
    return c.body(null, 204);
  });
