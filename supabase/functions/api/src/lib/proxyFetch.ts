// fetch đi qua proxy HTTP(S)/SOCKS5 cho các request tới YouTube (khi IP máy chủ bị YouTube chặn).
import { config, isDeno } from '../env.ts';

type FetchFn = typeof fetch;

type DenoHttp = {
  createHttpClient(options: { proxy: { url: string } }): unknown;
};

let proxied: Promise<FetchFn> | undefined;

async function build(url: string): Promise<FetchFn> {
  if (isDeno) {
    const deno = (globalThis as unknown as { Deno: DenoHttp }).Deno;
    const client = deno.createHttpClient({ proxy: { url } });
    return ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, client } as RequestInit)) as FetchFn;
  }
  // Node: dùng undici (specifier tính lúc chạy để trình dựng module graph của Deno bỏ qua).
  const specifier = ['un', 'dici'].join('');
  const undici = (await import(/* @vite-ignore */ specifier)) as {
    ProxyAgent: new (url: string) => unknown;
    fetch: (input: unknown, init?: unknown) => Promise<Response>;
  };
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
