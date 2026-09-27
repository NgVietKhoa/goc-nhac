// Chạy các file SQL trong supabase/migrations theo thứ tự (dùng cho dev local / tự host / hoặc đẩy lên Supabase).
// Cách dùng: npm run migrate -w server   (đọc DATABASE_URL từ .env)
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from '../supabase/functions/api/src/db/sql.ts';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../supabase/migrations');

export async function migrate(): Promise<void> {
  const db = sql();
  await db`create schema if not exists goc_nhac`;
  await db`create table if not exists goc_nhac.schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await db<{ name: string }[]>`select name from goc_nhac.schema_migrations`).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const content = await readFile(path.join(dir, file), 'utf8');
    await db.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`insert into goc_nhac.schema_migrations (name) values (${file})`;
    });
    console.log(`✔ Đã chạy migration ${file}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrate()
    .then(() => sql().end())
    .catch(async (err: unknown) => {
      console.error('Migration lỗi:', err);
      await sql().end();
      process.exit(1);
    });
}
