import type {
  Album,
  Artist,
  HomeFeed,
  Lyrics,
  Playlist,
  SearchResult,
  SearchSuggestions,
  SearchType,
  Track,
} from '../types.ts';

/**
 * Gốc của API. Mặc định "/api": dev dùng proxy của Vite, production dùng rewrite của Vercel
 * (cùng domain nên cookie httpOnly hoạt động). Có thể đặt VITE_API_BASE khi API ở domain khác.
 */
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || '/api';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

let onUnauthorized: (() => void) | undefined;
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
  }
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string } } | undefined)?.error;
    if (res.status === 401 && e?.code === 'UNAUTHORIZED') onUnauthorized?.();
    throw new ApiError(res.status, e?.code ?? 'HTTP', e?.message ?? `Lỗi máy chủ (${res.status}).`);
  }
  return data as T;
}

const get = <T>(path: string, signal?: AbortSignal) => request<T>('GET', path, undefined, signal);
const enc = encodeURIComponent;

export const api = {
  // Đăng nhập
  me: () => get<{ authRequired: boolean; authenticated: boolean }>('/auth/me'),
  login: (password: string) => request<{ ok: true }>('POST', '/auth/login', { password }),
  logout: () => request<{ ok: true }>('POST', '/auth/logout'),

  // YouTube Music
  search: (q: string, type: SearchType | 'all', signal?: AbortSignal) =>
    get<SearchResult>(`/search?q=${enc(q)}&type=${type}`, signal),
  suggestions: (q: string, signal?: AbortSignal) => get<SearchSuggestions>(`/search/suggestions?q=${enc(q)}`, signal),
  track: (id: string) => get<Track>(`/track/${id}`),
  upNext: (id: string) => get<Track[]>(`/up-next/${id}`),
  lyrics: (id: string) => get<Lyrics>(`/lyrics/${id}`),
  album: (id: string) => get<Album>(`/album/${enc(id)}`),
  artist: (id: string) => get<Artist>(`/artist/${enc(id)}`),
  playlist: (id: string) => get<Playlist>(`/playlist/${enc(id)}`),
  home: (filter?: string) => get<HomeFeed>(filter ? `/home?filter=${enc(filter)}` : '/home'),
};

/** Định dạng audio trình duyệt phát tốt: Safari/iOS phát opus trong webm không ổn định nên dùng m4a. */
export const audioFormat: 'opus' | 'm4a' = (() => {
  if (typeof navigator === 'undefined') return 'opus';
  const ua = navigator.userAgent;
  const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS|OPR/.test(ua);
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
  if (isSafari || isIOS) return 'm4a';
  const probe = document.createElement('audio');
  return probe.canPlayType('audio/webm; codecs="opus"') ? 'opus' : 'm4a';
})();

export const streamUrl = (videoId: string) => `${API_BASE}/stream/${videoId}?format=${audioFormat}`;
export const imageProxyUrl = (url: string) => `${API_BASE}/image?url=${enc(url)}`;

/** Lấy thông báo lỗi tiếng Việt của một bài không phát được. */
export async function streamError(videoId: string): Promise<string> {
  try {
    const res = await fetch(streamUrl(videoId), { credentials: 'include', headers: { range: 'bytes=0-1' } });
    if (res.ok) {
      await res.body?.cancel();
      return 'Trình duyệt không phát được luồng audio này.';
    }
    const data = (await res.json()) as { error?: { message?: string } };
    return data.error?.message ?? `Lỗi ${res.status}`;
  } catch {
    return 'Không kết nối được máy chủ.';
  }
}
