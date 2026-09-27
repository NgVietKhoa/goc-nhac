// Build cho Vercel theo Build Output API v3:
//   .vercel/output/static            ← giao diện (client/dist)
//   .vercel/output/functions/api.func ← backend Hono đóng gói bằng esbuild (Node)
//   .vercel/output/config.json       ← định tuyến: file tĩnh → /api/* → SPA
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.vercel/output');
const fn = path.join(out, 'functions/api.func');

rmSync(out, { recursive: true, force: true });
mkdirSync(fn, { recursive: true });

console.log('▶ Build giao diện');
execSync('npm run build -w client', { cwd: root, stdio: 'inherit' });
cpSync(path.join(root, 'client/dist'), path.join(out, 'static'), { recursive: true });

console.log('▶ Đóng gói backend');
await build({
  entryPoints: [path.join(root, 'server/vercel.ts')],
  outfile: path.join(fn, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  minify: false,
  sourcemap: false,
  logLevel: 'warning',
  // Một số thư viện CommonJS gọi require() → cung cấp require trong bản ESM.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});

writeFileSync(
  path.join(fn, '.vc-config.json'),
  JSON.stringify(
    {
      runtime: 'nodejs20.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      supportsResponseStreaming: true,
      maxDuration: 60,
    },
    null,
    2,
  ),
);

writeFileSync(
  path.join(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/assets/(.*)$', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
        { handle: 'filesystem' },
        { src: '^/api(?:/.*)?$', dest: '/api' },
        { src: '^/(.*)$', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);

console.log('✔ Xong: .vercel/output');
