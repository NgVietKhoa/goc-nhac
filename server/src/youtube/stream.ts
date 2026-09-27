// Lấy URL audio đã decipher và proxy về client, hỗ trợ Range để tua.
import type { Misc, Types } from 'youtubei.js';
import { AppError, playabilityError } from '../errors.ts';
import { config, isVercel } from '../env.ts';
import { TtlCache } from '../lib/ttlCache.ts';
import { youtubeFetch } from '../lib/proxyFetch.ts';
import { getPlayerYT, resetYT } from './client.ts';
import { contentPoToken, lastPoError, poAutoEnabled } from './poToken.ts';

export type AudioPref = 'opus' | 'm4a';

const MAX_URL_AGE_MS = 5 * 60 * 60 * 1000; // 5 giờ
/** Mỗi lần gọi googlevideo chỉ xin tối đa 2 MiB — xin cả file một lần thường bị bóp băng thông. */
const UPSTREAM_CHUNK = 2 * 1024 * 1024;
/**
 * Range mở (bytes=N-) chỉ trả tối đa 8 MiB (Vercel: 4 MiB, dưới giới hạn 4,5 MB mỗi response);
 * trình duyệt sẽ tự xin tiếp phần còn lại.
 */
const MAX_OPEN_RANGE = (isVercel ? 4 : 8) * 1024 * 1024;
/** Vị trí byte dùng để kiểm tra URL (sau giới hạn ~1 MB khi thiếu PO token). */
const PROBE_OFFSET = 1_200_000;

export interface CachedStream {
  url: string;
  mimeType: string;
  contentLength?: number;
  expiresAt: number;
}

/** Cache URL đã decipher trong bộ nhớ của instance (tối đa 5 giờ, theo tham số expire của URL). */
const memory = new TtlCache<CachedStream>(500);
const inflight = new Map<string, Promise<CachedStream>>();

type Format = Misc.Format;

/** Chọn định dạng audio-only tốt nhất theo ưu tiên (opus/webm hoặc m4a). */
export function pickAudioFormat(formats: readonly Format[], pref: AudioPref): Format | undefined {
  const audio = formats.filter(
    (f) => f.has_audio && !f.has_video && !f.drm_families?.length && (f.url || f.signature_cipher || f.cipher),
  );
  const isM4a = (f: Format) => f.mime_type.startsWith('audio/mp4');
  const isOpus = (f: Format) => f.mime_type.includes('opus');
  const score = (f: Format) =>
    (pref === 'm4a' ? (isM4a(f) ? 4 : 0) : isOpus(f) ? 4 : isM4a(f) ? 2 : 0) +
    (f.is_drc ? 0 : 2) +
    (f.is_dubbed || f.is_auto_dubbed || f.is_descriptive ? 0 : 1);
  return [...audio].sort((a, b) => score(b) - score(a) || b.bitrate - a.bitrate)[0];
}

function expiryOf(url: string): number {
  const expire = Number(new URL(url).searchParams.get('expire'));
  const cap = Date.now() + MAX_URL_AGE_MS;
  // Trừ hao 10 phút để không dùng URL sắp hết hạn.
  return Number.isFinite(expire) && expire > 0 ? Math.min(cap, expire * 1000 - 10 * 60 * 1000) : cap;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function fetchFresh(videoId: string, pref: AudioPref): Promise<CachedStream> {
  const yt = await getPlayerYT();
  const poToken = await contentPoToken(yt, videoId);
  let lastError: AppError | undefined;
  let playerBroken = false;

  for (const client of config().yt.clients) {
    try {
      const info = await yt.getBasicInfo(videoId, { client: client as Types.InnerTubeClient, po_token: poToken });
      const status = info.playability_status?.status;
      if (status && status !== 'OK') {
        const err = playabilityError(status, info.playability_status?.reason);
        // Bài bị xóa / chặn vùng thì client khác cũng không giúp được.
        if (err.code === 'TRACK_NOT_FOUND' || err.code === 'REGION_BLOCKED') throw err;
        lastError ??= err;
        continue;
      }
      const format = pickAudioFormat(info.streaming_data?.adaptive_formats ?? [], pref);
      if (!format) {
        lastError ??= new AppError('NO_AUDIO', 'Không tìm thấy luồng audio cho bài này.', 404);
        continue;
      }
      let url: string;
      try {
        url = await format.decipher(yt.session.player);
      } catch (err) {
        playerBroken = true;
        lastError ??= new AppError('UPSTREAM', `Không giải mã được URL (${describe(err)}).`, 502);
        continue;
      }
      // Kiểm tra URL thật sự tải được. Thiếu PO token, googlevideo vẫn cho tải ~1 MB đầu rồi trả 403,
      // nên phải thử đọc một byte nằm sau mốc đó.
      const probeAt = format.content_length && format.content_length > PROBE_OFFSET ? PROBE_OFFSET : 0;
      const probe = await (await youtubeFetch())(url, { headers: { range: `bytes=${probeAt}-${probeAt}` } });
      await probe.body?.cancel();
      if (probe.status !== 206 && probe.status !== 200) {
        lastError ??= new AppError('UPSTREAM', `YouTube từ chối luồng audio (${client}: HTTP ${probe.status}).`, 502);
        continue;
      }
      const total = Number(probe.headers.get('content-range')?.split('/')[1]);
      return {
        url,
        mimeType: format.mime_type.split(';')[0],
        contentLength: format.content_length ?? (Number.isFinite(total) ? total : undefined),
        expiresAt: expiryOf(url),
      };
    } catch (err) {
      if (err instanceof AppError) {
        if (err.code === 'TRACK_NOT_FOUND' || err.code === 'REGION_BLOCKED') throw err;
        lastError ??= err;
      } else if (/unavailable|not available|không có sẵn/i.test(describe(err))) {
        throw new AppError('TRACK_NOT_FOUND', 'Bài hát không tồn tại hoặc đã bị xóa.', 410);
      } else {
        lastError ??= new AppError('UPSTREAM', `Lỗi khi lấy luồng audio: ${describe(err)}`, 502);
      }
    }
  }
  // Player của YouTube có thể vừa đổi → lần sau tạo lại Innertube để tải player mới.
  if (playerBroken) resetYT();
  throw lastError ?? new AppError('UNPLAYABLE', 'Không phát được bài này.', 403);
}

/**
 * Lấy URL đã decipher: bộ nhớ → Postgres → YouTube. `force` bỏ qua cache.
 * `fresh` = vừa phải hỏi YouTube (tốn CPU).
 */
export async function resolveStream(
  videoId: string,
  pref: AudioPref,
  force = false,
): Promise<CachedStream & { fresh: boolean }> {
  const key = `${videoId}:${pref}`;
  if (!force) {
    const hit = memory.get(key);
    if (hit) return { ...hit, fresh: false };
  } else {
    memory.delete(key);
  }

  // Gộp các request đồng thời cho cùng một bài.
  let pending = inflight.get(key);
  if (!pending) {
    pending = fetchFresh(videoId, pref).finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  const fresh = await pending;
  memory.set(key, fresh, fresh.expiresAt - Date.now());
  return { ...fresh, fresh: true };
}

// ---------- Proxy ----------

interface ByteRange {
  start: number;
  end?: number;
}

/** Chỉ hỗ trợ một khoảng "bytes=a-b" hoặc "bytes=a-" (đủ cho thẻ <audio>). */
export function parseRange(header: string | undefined): ByteRange | null | 'invalid' {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return 'invalid';
  if (m[1] === '') return 'invalid'; // suffix range (bytes=-500) không cần cho audio
  const start = Number(m[1]);
  const end = m[2] === '' ? undefined : Number(m[2]);
  if (end !== undefined && end < start) return 'invalid';
  return { start, end };
}

/** Đoạn đầu nhỏ để bắt đầu phát nhanh. */
const FIRST_CHUNK = 256 * 1024;
/** Chậm hơn mức này coi như URL bị bóp băng thông → thử lấy URL mới. */
const MIN_BYTES_PER_SEC = 150 * 1024;
/** Khi URL mới vẫn chậm thì chấp nhận chậm (vẫn nhanh hơn bitrate ~16 KB/s của audio). */
const SLOW_BYTES_PER_SEC = 12 * 1024;

class ChunkError extends Error {}

/** Tải trọn một đoạn byte từ googlevideo, có hạn chót theo kích thước. */
async function downloadChunk(url: string, start: number, end: number, lenient = false): Promise<Uint8Array> {
  const size = end - start + 1;
  const timeoutMs = Math.round(3000 + (size / (lenient ? SLOW_BYTES_PER_SEC : MIN_BYTES_PER_SEC)) * 1000);
  let res: Response;
  try {
    res = await (await youtubeFetch())(url, { headers: { range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new ChunkError(`không tải được đoạn ${start}-${end}: ${describe(err)}`);
  }
  if (res.status !== 206 && res.status !== 200) {
    await res.body?.cancel().catch(() => {});
    throw new ChunkError(`googlevideo trả HTTP ${res.status}`);
  }
  try {
    const data = new Uint8Array(await res.arrayBuffer());
    if (data.byteLength !== size) throw new ChunkError(`đoạn ${start}-${end} bị thiếu (${data.byteLength}/${size} byte)`);
    return data;
  } catch (err) {
    throw err instanceof ChunkError ? err : new ChunkError(`đoạn ${start}-${end} quá chậm hoặc bị ngắt: ${describe(err)}`);
  }
}

/** Proxy audio về client, hỗ trợ Range. */
export async function proxyStream(videoId: string, pref: AudioPref, rangeHeader: string | undefined): Promise<Response> {
  const range = parseRange(rangeHeader);
  if (range === 'invalid') return new Response(null, { status: 416 });

  const first = await resolveStream(videoId, pref);
  let stream: CachedStream = first;
  let refreshed = false;

  /**
   * Tải một đoạn. Lỗi (403 / hết hạn / quá chậm) → lấy URL mới một lần;
   * nếu URL mới vẫn chậm thì chấp nhận tải chậm thay vì báo lỗi.
   */
  const getChunk = async (start: number, end: number): Promise<Uint8Array> => {
    if (refreshed) return downloadChunk(stream.url, start, end, true);
    try {
      return await downloadChunk(stream.url, start, end);
    } catch (err) {
      console.warn(`[stream ${videoId}] ${describe(err)} → lấy URL mới`);
      refreshed = true;
      stream = await resolveStream(videoId, pref, true);
      return downloadChunk(stream.url, start, end, true);
    }
  };

  let total = stream.contentLength;
  if (total === undefined) {
    // Hiếm gặp: YouTube không báo kích thước → hỏi bằng một request 1 byte.
    const probe = await (await youtubeFetch())(stream.url, { headers: { range: 'bytes=0-0' } });
    await probe.body?.cancel();
    total = Number(probe.headers.get('content-range')?.split('/')[1]);
    if (!Number.isFinite(total)) throw new AppError('UPSTREAM', 'Không xác định được kích thước file audio.', 502);
  }

  const start = range?.start ?? 0;
  if (start >= total) {
    return new Response(null, { status: 416, headers: { 'content-range': `bytes */${total}` } });
  }
  let end = total - 1;
  if (range) end = range.end !== undefined ? Math.min(range.end, total - 1) : Math.min(start + MAX_OPEN_RANGE - 1, total - 1);

  // Tải sẵn đoạn đầu để báo lỗi (JSON) trước khi gửi header 206.
  const firstEnd = Math.min(end, start + FIRST_CHUNK - 1);
  let head: Uint8Array;
  try {
    head = await getChunk(start, firstEnd);
  } catch (err) {
    throw new AppError('UPSTREAM', `Không tải được audio từ YouTube (${describe(err)}).`, 502);
  }

  let next = firstEnd + 1;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(head);
      if (next > end) controller.close();
    },
    async pull(controller) {
      if (next > end) return;
      const chunkEnd = Math.min(next + UPSTREAM_CHUNK - 1, end);
      try {
        controller.enqueue(await getChunk(next, chunkEnd));
        next = chunkEnd + 1;
        if (next > end) controller.close();
      } catch (err) {
        console.warn(`[stream ${videoId}] dừng giữa chừng: ${describe(err)}`);
        controller.error(err);
      }
    },
  });

  const headers = new Headers({
    'content-type': stream.mimeType,
    'accept-ranges': 'bytes',
    'content-length': String(end - start + 1),
    'cache-control': 'private, max-age=3600',
  });
  if (range) headers.set('content-range', `bytes ${start}-${end}/${total}`);
  return new Response(body, { status: range ? 206 : 200, headers });
}

// ---------- Chẩn đoán ----------

const DIAG_CLIENTS = ['VISIONOS', 'YTMUSIC', 'MWEB', 'WEB', 'IOS', 'ANDROID_VR', 'TV', 'TV_SIMPLY', 'WEB_EMBEDDED'];

/** Thử mọi client (có / không PO token) để biết tổ hợp nào lấy được audio trên máy chủ hiện tại. */
export async function diagnoseStream(videoId: string) {
  const started = Date.now();
  const yt = await getPlayerYT();
  const fetchFn = await youtubeFetch();
  const ip = await fetchFn('https://api.ipify.org?format=json')
    .then((r) => r.json() as Promise<{ ip?: string }>)
    .then((d) => d.ip)
    .catch(() => undefined);
  const po = await contentPoToken(yt, videoId);
  const results: Record<string, string>[] = [];
  const clients = [...new Set([...config().yt.clients, ...DIAG_CLIENTS])];
  for (const client of clients) {
    for (const withPo of po ? [false, true] : [false]) {
      const row: Record<string, string> = { client, po: withPo ? 'có' : 'không' };
      try {
        const info = await yt.getBasicInfo(videoId, { client: client as Types.InnerTubeClient, po_token: withPo ? po : undefined });
        row.status = info.playability_status?.status ?? '?';
        if (info.playability_status?.reason) row.reason = info.playability_status.reason.slice(0, 120);
        const format = pickAudioFormat(info.streaming_data?.adaptive_formats ?? [], 'opus');
        if (format) {
          row.itag = String(format.itag);
          const url = await format.decipher(yt.session.player);
          const at = format.content_length && format.content_length > PROBE_OFFSET ? PROBE_OFFSET : 0;
          const probe = await fetchFn(url, { headers: { range: `bytes=${at}-${at}` } });
          await probe.body?.cancel();
          row.audio = probe.status === 206 || probe.status === 200 ? `OK (${probe.status})` : `HTTP ${probe.status}`;
        }
      } catch (err) {
        row.error = describe(err).slice(0, 160);
      }
      results.push(row);
    }
  }
  return {
    videoId,
    serverIp: ip,
    proxy: Boolean(config().yt.proxy),
    poToken: po ? 'đã sinh' : poAutoEnabled() ? `lỗi: ${lastPoError ?? '?'}` : 'tắt',
    ms: Date.now() - started,
    works: results.filter((r) => r.audio?.startsWith('OK')).map((r) => `${r.client}${r.po === 'có' ? '+po' : ''}`),
    results,
  };
}
