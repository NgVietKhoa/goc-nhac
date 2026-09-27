import { Innertube, Log, Platform, UniversalCache } from 'youtubei.js';
import type { Types } from 'youtubei.js';
import vm from 'node:vm';
import { config } from '../env.ts';
import { youtubeFetch } from '../lib/proxyFetch.ts';

Log.setLevel(Log.Level.ERROR);

/**
 * Trình thông dịch JS cho youtubei.js (xem "Providing a Custom JavaScript Interpreter").
 * `data.output` là đoạn script do youtubei.js trích từ player của YouTube, kết thúc bằng
 * `return process(...)`, nên chỉ cần chạy nó như thân một hàm.
 */
async function evaluate(data: Types.BuildScriptResult): Promise<Types.EvalResult> {
  const code = `(function () {
${data.output}
})()`;
  // Chạy trong context riêng của node:vm, có timeout.
  return vm.runInNewContext(code, Object.create(null), { timeout: 5000 }) as Types.EvalResult;
}

Platform.shim.eval = evaluate;

let browseInstance: Promise<Innertube> | undefined;
let playerInstance: Promise<Innertube> | undefined;

async function create(withPlayer: boolean): Promise<Innertube> {
  const { yt, cacheDir } = config();
  // Instance lấy link audio luôn đi qua proxy (nếu có); instance duyệt nhạc chỉ khi YT_PROXY_ALL.
  const useProxy = yt.proxy && (withPlayer || yt.proxyAll);
  return Innertube.create({
    fetch: useProxy ? await youtubeFetch() : undefined,
    lang: 'vi',
    location: 'VN',
    enable_session_cache: true,
    cache: new UniversalCache(true, cacheDir),
    // Tải + phân tích player JS (~2–3 MB) rất tốn CPU; chỉ cần khi decipher URL stream.
    retrieve_player: withPlayer,
    po_token: yt.poToken,
    visitor_data: yt.visitorData,
    player_id: yt.playerId,
  });
}

function memo(get: () => Promise<Innertube> | undefined, set: (p: Promise<Innertube> | undefined) => void, withPlayer: boolean) {
  let current = get();
  if (!current) {
    current = create(withPlayer).catch((err: unknown) => {
      set(undefined);
      throw err;
    });
    set(current);
  }
  return current;
}

/** Instance dùng chung cho tìm kiếm / album / nghệ sĩ… (không tải player). */
export function getYT(): Promise<Innertube> {
  return memo(() => browseInstance, (p) => (browseInstance = p), false);
}

/** Instance có player của YouTube, dùng để lấy và decipher URL audio. */
export function getPlayerYT(): Promise<Innertube> {
  return memo(() => playerInstance, (p) => (playerInstance = p), true);
}

/** Bỏ instance có player (vd khi YouTube đổi player và decipher hỏng). */
export function resetYT(): void {
  playerInstance = undefined;
}
