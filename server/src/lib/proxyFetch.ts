// fetch đi qua proxy HTTP(S) cho các request tới YouTube (khi IP máy chủ bị YouTube chặn).
import { config } from '../env.ts';

type FetchFn = typeof fetch;
type Undici = {
  ProxyAgent: new (url: string) => unknown;
  fetch: (input: unknown, init?: unknown) => Promise<Response>;
};

let proxied: Promise<FetchFn> | undefined;

async function build(url: string): Promise<FetchFn> {
  // Bản bundle Vercel nạp sẵn undici vào globalThis (server/undici-global.ts); chạy bằng tsx thì import bình thường.
  const undici = (globalThis as { __gocNhacUndici?: Undici }).__gocNhacUndici ?? ((await import('undici')) as unknown as Undici);
  const dispatcher = new undici.ProxyAgent(url);
  return ((input: RequestInfo | URL, init?: RequestInit) => undici.fetch(input, { ...init, dispatcher })) as FetchFn;
}

/** fetch qua proxy nếu có đặt YT_PROXY, ngược lại là fetch thường. */
export function youtubeFetch(): Promise<FetchFn> {
  const url = config().yt.proxy;
  if (!url) return Promise.resolve(fetch);
  proxied ??= build(url).catch((err: unknown) => {
    proxied = undefined;
    throw err;
  });
  return proxied;
}
