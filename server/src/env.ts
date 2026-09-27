// Cấu hình đọc từ biến môi trường (Vercel: Project Settings → Environment Variables; local: file .env).
const env = process.env;

/** Đang chạy trong Vercel Function (chỉ ghi được vào /tmp, response tối đa ~4,5 MB). */
export const isVercel = Boolean(env.VERCEL);

function read(name: string): string | undefined {
  const value = env[name];
  return value === undefined || value.trim() === '' ? undefined : value.trim();
}

function list(name: string, fallback: string[]): string[] {
  const raw = read(name);
  return raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : fallback;
}

export interface AppConfig {
  /** Không đặt = không cần đăng nhập. */
  appPassword?: string;
  sessionSecret?: string;
  /** Origin của frontend khi FE và API khác domain. */
  corsOrigin?: string;
  cacheDir: string;
  yt: {
    poToken?: string;
    visitorData?: string;
    playerId?: string;
    /** Thứ tự client InnerTube thử khi lấy stream (client đầu tiên tải được trọn bài sẽ được dùng). */
    clients: string[];
    /** Proxy cho request tới YouTube, vd http://user:pass@host:port. */
    proxy?: string;
    /** true: mọi request (cả tìm kiếm, album…) đều qua proxy; false: chỉ lấy link + tải audio. */
    proxyAll: boolean;
  };
}

let cached: AppConfig | undefined;

export function config(): AppConfig {
  if (cached) return cached;
  const appPassword = read('APP_PASSWORD');
  const sessionSecret = read('SESSION_SECRET');
  if (appPassword && (!sessionSecret || sessionSecret.length < 32)) {
    throw new Error('Đã đặt APP_PASSWORD thì phải đặt SESSION_SECRET dài ít nhất 32 ký tự');
  }
  cached = {
    appPassword,
    sessionSecret,
    corsOrigin: read('CORS_ORIGIN'),
    cacheDir: read('YT_CACHE_DIR') ?? (isVercel ? '/tmp/youtubei' : './data/youtubei-cache'),
    yt: {
      poToken: read('YT_PO_TOKEN'),
      visitorData: read('YT_VISITOR_DATA'),
      playerId: read('YT_PLAYER_ID'),
      clients: list('YT_CLIENTS', ['VISIONOS', 'YTMUSIC', 'ANDROID_VR', 'IOS', 'MWEB']),
      proxy: read('YT_PROXY'),
      proxyAll: ['1', 'true', 'yes'].includes((read('YT_PROXY_ALL') ?? '').toLowerCase()),
    },
  };
  return cached;
}

export const authEnabled = () => Boolean(config().appPassword);
