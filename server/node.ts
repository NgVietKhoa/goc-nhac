// Chạy API trên Node: dùng cho dev local, hoặc tự host bằng Docker thay cho Supabase Edge Function.
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync } from 'node:fs';
import { Hono } from 'hono';
import { createApp } from '../supabase/functions/api/src/app.ts';
import { getPlayerYT, getYT } from '../supabase/functions/api/src/youtube/client.ts';
import { migrate } from './migrate.ts';

const port = Number(process.env.PORT ?? 3001);
const staticDir = process.env.STATIC_DIR; // vd ../client/dist khi chạy production

await migrate();

const root = new Hono();
root.route('/', createApp());

if (staticDir && existsSync(staticDir)) {
  root.use('*', serveStatic({ root: staticDir }));
  // SPA: mọi đường dẫn còn lại trả về index.html
  root.get('*', serveStatic({ root: staticDir, path: 'index.html' }));
}

serve({ fetch: root.fetch, port }, () => {
  console.log(`🎵 Góc Nhạc API: http://localhost:${port}/api`);
});

// Khởi tạo Innertube ngay khi server chạy để request đầu tiên không phải chờ.
Promise.all([getYT(), getPlayerYT()])
  .then(([, yt]) => console.log(`YouTube sẵn sàng (player ${yt.session.player?.player_id ?? '?'})`))
  .catch((err: unknown) => console.error('Không khởi tạo được YouTube:', err));
