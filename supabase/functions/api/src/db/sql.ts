import postgres from 'postgres';
import { config, isDeno } from '../env.ts';

let client: postgres.Sql | undefined;

/** Kết nối Postgres dùng chung (Supabase: SUPABASE_DB_URL; Node: DATABASE_URL). */
export function sql(): postgres.Sql {
  client ??= postgres(config().databaseUrl, {
    // Pooler của Supabase (transaction mode) không hỗ trợ prepared statements.
    prepare: false,
    max: isDeno ? 2 : 10,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
  return client;
}
