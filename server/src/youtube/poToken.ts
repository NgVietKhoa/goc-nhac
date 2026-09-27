// Tự sinh PO token (Proof of Origin) bằng BotGuard của YouTube chạy trong jsdom (thư viện bgutils-js).
// Token gắn với video được gửi kèm request /player để giảm khả năng bị YouTube coi là bot khi chạy trên IP datacenter.
import { BotGuardClient } from 'bgutils-js/botguard';
import type { WebPoSignalOutput } from 'bgutils-js/shared-types';
import { buildURL, GOOG_API_KEY, USER_AGENT } from 'bgutils-js/utils';
import { WebPoMinter } from 'bgutils-js/webpo';
import { JSDOM, ResourceLoader } from 'jsdom';
import type { Innertube } from 'youtubei.js';
import { config } from '../env.ts';
import { youtubeFetch } from '../lib/proxyFetch.ts';

/** Request key của YouTube web player cho WAA/GenerateIT. */
const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';

interface MinterEntry {
  minter: WebPoMinter;
  expiresAt: number;
}

let pending: Promise<MinterEntry> | undefined;
/** Lỗi sinh token gần nhất (hiện ở /api/debug/stream). */
export let lastPoError: string | undefined;
let domReady = false;

/** BotGuard cần window/document toàn cục; chỉ gắn một lần và không ghi đè nếu đã có. */
function ensureDom(): void {
  if (domReady) return;
  const dom = new JSDOM('<!DOCTYPE html><html lang="en"><head><title></title></head><body></body></html>', {
    url: 'https://www.youtube.com/',
    referrer: 'https://www.youtube.com/',
    // User-agent mặc định của jsdom có chữ "jsdom" → BotGuard dễ nhận ra.
    resources: new ResourceLoader({ userAgent: USER_AGENT }),
  });
  const g = globalThis as Record<string, unknown>;
  g.window ??= dom.window;
  g.document ??= dom.window.document;
  g.location ??= dom.window.location;
  g.origin ??= dom.window.origin;
  if (!Reflect.has(globalThis, 'navigator')) Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator });
  // Giả lập getContext trả về null để tránh jsdom log lỗi "Not implemented: HTMLCanvasElement.prototype.getContext".
  try {
    dom.window.HTMLCanvasElement.prototype.getContext = () => null;
  } catch {}
  domReady = true;
}

async function createMinter(yt: Innertube): Promise<MinterEntry> {
  ensureDom();
  const fetchFn = await youtubeFetch();
  const challenge = await yt.getAttestationChallenge('ENGAGEMENT_TYPE_UNBOUND');
  const bg = challenge.bg_challenge;
  if (!bg) throw new Error('YouTube không trả về BotGuard challenge');
  const interpreterUrl = bg.interpreter_url.private_do_not_access_or_else_trusted_resource_url_wrapped_value;
  const interpreter = await (await fetchFn(`https:${interpreterUrl}`)).text();
  new Function(interpreter)();

  const botguard = await BotGuardClient.create({ program: bg.program, globalName: bg.global_name, globalObject: globalThis });
  const signalOutput: WebPoSignalOutput = [];
  const snapshot = await botguard.snapshot({ webPoSignalOutput: signalOutput });
  const res = await fetchFn(buildURL('GenerateIT', true), {
    method: 'POST',
    headers: {
      'content-type': 'application/json+protobuf',
      'x-goog-api-key': GOOG_API_KEY,
      'x-user-agent': 'grpc-web-javascript/0.1',
      'user-agent': USER_AGENT,
    },
    body: JSON.stringify([REQUEST_KEY, snapshot]),
  });
  const data = (await res.json()) as unknown[];
  const integrityToken = data[0];
  const ttlSec = typeof data[1] === 'number' ? data[1] : 3600;
  if (typeof integrityToken !== 'string') throw new Error(`Không lấy được integrity token (HTTP ${res.status})`);
  const minter = await WebPoMinter.create({ integrityToken }, signalOutput);
  // Làm mới sớm 10% trước khi hết hạn.
  return { minter, expiresAt: Date.now() + ttlSec * 900 };
}

export function poAutoEnabled(): boolean {
  const { yt } = config();
  return yt.poAuto && !yt.poToken;
}

/** PO token gắn với nội dung (videoId); trả undefined nếu tắt hoặc sinh lỗi. */
export async function contentPoToken(yt: Innertube, videoId: string): Promise<string | undefined> {
  if (!poAutoEnabled()) return undefined;
  try {
    let entry = await pending;
    if (!entry || entry.expiresAt < Date.now()) {
      pending = createMinter(yt).catch((err: unknown) => {
        pending = undefined;
        throw err;
      });
      entry = await pending;
    }
    const token = await entry.minter.mintAsWebsafeString(videoId);
    lastPoError = undefined;
    return token;
  } catch (err) {
    lastPoError = err instanceof Error ? err.message : String(err);
    console.warn('[po-token] không sinh được:', lastPoError);
    pending = undefined;
    return undefined;
  }
}
