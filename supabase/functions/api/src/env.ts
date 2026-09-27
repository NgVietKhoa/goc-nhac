// Đọc biến môi trường cho cả Deno (Supabase Edge) và Node.
type DenoLike = { env: { get(name: string): string | undefined } };

const deno = (globalThis as { Deno?: DenoLike }).Deno;
const nodeEnv = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;

export const isDeno = deno !== undefined;

function read(name: string): string | undefined {
  const value = deno ? deno.env.get(name) : nodeEnv?.[name];
  return value === undefined || value.trim() === '' ? undefined : value.trim();
}

function list(name: string, fallback: string[]): string[] {
  const raw = read(name);
  return raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : fallback;
}

function required(name: string): string {
  const value = read(name);
  if (!value) throw new Error(`Thiếu biến môi trường ${name}`);
  return value;
}

export interface AppConfig {
  appPassword: string;
  sessionSecret: string;
  databaseUrl: string;
  /** Origin của frontend khi FE và API khác domain (không dùng rewrite). */
  corsOrigin?: string;
  cacheDir: string;
  yt: {
    poToken?: string;
    visitorData?: string;
    playerId?: string;
    /** Thứ tự client InnerTube thử khi lấy stream (client đầu tiên tải được trọn bài sẽ được dùng). */
    clients: string[];
  };
}

let cached: AppConfig | undefined;

export function config(): AppConfig {
  if (cached) return cached;
  const sessionSecret = required('SESSION_SECRET');
  if (sessionSecret.length < 32) throw new Error('SESSION_SECRET phải dài ít nhất 32 ký tự');
  cached = {
    appPassword: required('APP_PASSWORD'),
    sessionSecret,
    // Supabase tự cấp SUPABASE_DB_URL cho Edge Function.
    databaseUrl: read('DATABASE_URL') ?? required('SUPABASE_DB_URL'),
    corsOrigin: read('CORS_ORIGIN'),
    cacheDir: read('YT_CACHE_DIR') ?? (isDeno ? '/tmp/youtubei' : './data/youtubei-cache'),
    yt: {
      poToken: read('YT_PO_TOKEN'),
      visitorData: read('YT_VISITOR_DATA'),
      playerId: read('YT_PLAYER_ID'),
      clients: list('YT_CLIENTS', ['VISIONOS', 'YTMUSIC', 'ANDROID_VR', 'IOS', 'MWEB']),
    },
  };
  return cached;
}
