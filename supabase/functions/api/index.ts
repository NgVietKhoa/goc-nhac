// Điểm vào Supabase Edge Function "api".
// URL: https://<project-ref>.supabase.co/functions/v1/api/...
import { createApp } from './src/app.ts';

const app = createApp();

Deno.serve(app.fetch);
