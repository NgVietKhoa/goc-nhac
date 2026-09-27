// Điểm vào Vercel Function (Node). scripts/build-vercel.mjs đóng gói file này thành .vercel/output/functions/api.func.
import { getRequestListener } from '@hono/node-server';
import { createApp } from './src/app.ts';

export default getRequestListener(createApp().fetch);
