// Điểm vào Vercel Function (Node). Không đặt tên vercel.ts: Vercel CLI coi file đó là cấu hình project. scripts/build-vercel.mjs đóng gói file này thành .vercel/output/functions/api.func.
import { getRequestListener } from '@hono/node-server';
import { createApp } from './src/app.ts';

export default getRequestListener(createApp().fetch);
