// Điều khiển phát nhạc: đồng bộ store Zustand với 2 thẻ <audio> (1 đang phát, 1 tải trước bài kế).
import { api, streamError, streamUrl } from '../lib/api.ts';
import { img, trackSubtitle } from '../lib/format.ts';
import { currentItem, loadPosition, savePosition, usePlayback, usePlayer, type QueueItem } from '../store/player.ts';
import { toast } from '../store/toast.ts';
import type { Track } from '../types.ts';

const HISTORY_AFTER_SEC = 30;

class AudioEngine {
  private readonly els: [HTMLAudioElement, HTMLAudioElement];
  private active = 0;
  private loadedUid: string | undefined;
  /** Vị trí cần tua tới khi metadata đã tải (khôi phục phiên trước / thử lại sau lỗi). */
  private pendingSeek = 0;
  private listened = 0;
  private lastTime = 0;
  private historySent = false;
  private lastSave = 0;
  private lastMediaPos = 0;
  private consecutiveErrors = 0;
  private retriedUid: string | undefined;
  private radio = new Map<string, Promise<Track[]>>();

  constructor() {
    this.els = [this.createElement(), this.createElement()];
  }

  private get el(): HTMLAudioElement {
    return this.els[this.active];
  }

  private get idle(): HTMLAudioElement {
    return this.els[1 - this.active];
  }

  private createElement(): HTMLAudioElement {
    const el = new Audio();
    el.preload = 'auto';
    const on = (type: string, fn: () => void) => el.addEventListener(type, () => el === this.el && fn());
    on('timeupdate', () => this.onTime());
    on('loadedmetadata', () => this.onMetadata());
    on('durationchange', () => usePlayback.getState().setTime(el.currentTime, this.duration()));
    on('ended', () => this.onEnded());
    on('play', () => !usePlayer.getState().playing && usePlayer.getState().setPlaying(true));
    on('pause', () => !el.ended && usePlayer.getState().playing && usePlayer.getState().setPlaying(false));
    on('waiting', () => usePlayback.getState().setBuffering(true));
    on('playing', () => {
      usePlayback.getState().setBuffering(false);
      this.consecutiveErrors = 0;
    });
    on('canplay', () => {
      usePlayback.getState().setBuffering(false);
      this.preloadNext();
    });
    on('error', () => void this.onError());
    return el;
  }

  init(): void {
    const state = usePlayer.getState();
    this.applyVolume();
    // Khôi phục phiên trước: hiện đúng vị trí nhưng chưa tải audio cho tới khi bấm phát.
    const item = currentItem(state);
    if (item) {
      this.pendingSeek = loadPosition(item.track.videoId);
      usePlayback.getState().setTime(this.pendingSeek, item.track.durationSec ?? 0);
      this.updateMetadata(item.track);
    }
    usePlayer.subscribe((s, prev) => {
      const cur = currentItem(s);
      const before = currentItem(prev);
      if (cur?.uid !== before?.uid) this.loadCurrent(s.playing);
      else if (s.playing !== prev.playing) this.applyPlaying(s.playing);
      if (s.volume !== prev.volume || s.muted !== prev.muted) this.applyVolume();
      if (s.queue !== prev.queue || s.repeat !== prev.repeat) this.preloadNext();
    });
    this.setupMediaSession();
    const save = () => {
      const cur = currentItem(usePlayer.getState());
      if (cur && this.el.src) savePosition(cur.track.videoId, this.el.currentTime);
    };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && save());
  }

  // ---------- điều khiển ----------

  seek(sec: number): void {
    const target = Math.max(0, Math.min(sec, this.duration() || sec));
    if (!this.el.src) {
      this.pendingSeek = target;
    } else {
      this.el.currentTime = target;
    }
    this.lastTime = target;
    usePlayback.getState().setTime(target);
    this.updatePositionState(true);
  }

  seekBy(delta: number): void {
    this.seek(this.currentTime() + delta);
  }

  currentTime(): number {
    return this.el.src ? this.el.currentTime : this.pendingSeek;
  }

  /** "Bài trước": nếu đã nghe quá 3 giây thì tua về đầu bài. */
  previous(): void {
    if (this.currentTime() > 3) this.seek(0);
    else usePlayer.getState().prev();
  }

  async next(): Promise<void> {
    await this.advance(false);
  }

  private duration(): number {
    const d = this.el.duration;
    if (Number.isFinite(d) && d > 0) return d;
    return currentItem(usePlayer.getState())?.track.durationSec ?? 0;
  }

  // ---------- tải bài ----------

  private loadCurrent(autoplay: boolean): void {
    const item = currentItem(usePlayer.getState());
    if (!item) {
      this.el.pause();
      this.el.removeAttribute('src');
      this.el.load();
      this.loadedUid = undefined;
      usePlayback.getState().setTime(0, 0);
      this.clearMediaSession();
      return;
    }
    if (item.uid === this.loadedUid && this.el.src) {
      this.applyPlaying(autoplay);
      return;
    }
    this.loadedUid = item.uid;
    this.listened = 0;
    this.lastTime = 0;
    this.historySent = false;
    this.pendingSeek = 0;
    const id = item.track.videoId;

    const old = this.el;
    if (this.idle.dataset.videoId === id && this.idle.src) {
      // Bài kế đã được tải trước → đổi vai hai thẻ audio.
      this.active = 1 - this.active;
      old.pause();
      this.el.currentTime = 0;
    } else {
      old.pause();
      this.el.src = streamUrl(id);
      this.el.dataset.videoId = id;
    }
    usePlayback.getState().setTime(0, item.track.durationSec ?? 0);
    usePlayback.getState().setBuffering(autoplay);
    this.updateMetadata(item.track);
    if (autoplay) this.play();
  }

  private applyPlaying(playing: boolean): void {
    if (playing) {
      const item = currentItem(usePlayer.getState());
      if (!item) return usePlayer.getState().setPlaying(false);
      if (!this.el.src || this.loadedUid !== item.uid) {
        // Lần phát đầu sau khi mở lại trang.
        const resumeAt = this.pendingSeek;
        this.loadCurrent(false);
        this.pendingSeek = resumeAt;
      }
      this.play();
    } else {
      this.el.pause();
    }
  }

  private play(): void {
    this.el.play().catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        // Trình duyệt chặn tự phát khi chưa có thao tác người dùng.
        usePlayer.getState().setPlaying(false);
      }
    });
  }

  private applyVolume(): void {
    const { volume, muted } = usePlayer.getState();
    for (const el of this.els) {
      el.volume = volume;
      el.muted = muted;
    }
  }

  private nextItem(): QueueItem | undefined {
    const { queue, index, repeat } = usePlayer.getState();
    if (repeat === 'one') return undefined;
    return queue[index + 1] ?? (repeat === 'all' ? queue[0] : undefined);
  }

  private preloadNext(): void {
    if (!this.el.src || this.el.readyState < 3) return;
    let nextId = this.nextItem()?.track.videoId;
    if (!nextId) {
      // Cuối hàng đợi + tự động phát → tải trước bài liên quan đầu tiên.
      const s = usePlayer.getState();
      const cur = currentItem(s);
      if (!s.autoplay || !cur || s.repeat !== 'off') return;
      void this.radioFor(cur.track.videoId).then((list) => {
        const first = list[0]?.videoId;
        if (first && this.idle.dataset.videoId !== first && !this.nextItem()) this.preloadInto(first);
      });
      return;
    }
    if (this.idle.dataset.videoId !== nextId) this.preloadInto(nextId);
  }

  private preloadInto(videoId: string): void {
    if (this.idle.dataset.videoId === videoId) return;
    this.idle.src = streamUrl(videoId);
    this.idle.dataset.videoId = videoId;
    this.idle.load();
  }

  /** Danh sách bài liên quan cho chế độ tự động phát (bỏ các bài vừa có trong hàng đợi). */
  radioFor(videoId: string): Promise<Track[]> {
    let pending = this.radio.get(videoId);
    if (!pending) {
      pending = api.upNext(videoId).catch(() => {
        this.radio.delete(videoId);
        return [];
      });
      this.radio.set(videoId, pending);
    }
    return pending.then((list) => {
      const recent = new Set(usePlayer.getState().queue.slice(-100).map((i) => i.track.videoId));
      return list.filter((t) => !recent.has(t.videoId));
    });
  }

  private async advance(auto: boolean): Promise<void> {
    const player = usePlayer.getState();
    if (player.next(auto)) return;
    const cur = currentItem(player);
    if (auto && player.autoplay && cur) {
      const more = (await this.radioFor(cur.track.videoId)).slice(0, 20);
      if (more.length > 0) {
        usePlayer.getState().addToQueue(more, 'auto');
        usePlayer.getState().next(true);
        return;
      }
    }
    // Hết hàng đợi.
    usePlayer.getState().setPlaying(false);
    if (auto) this.seek(0);
  }

  // ---------- sự kiện ----------

  private onMetadata(): void {
    if (this.pendingSeek > 0) {
      this.el.currentTime = this.pendingSeek;
      this.lastTime = this.pendingSeek;
      this.pendingSeek = 0;
    }
    usePlayback.getState().setTime(this.el.currentTime, this.duration());
    this.updatePositionState(true);
    // Bổ sung thời lượng cho bài thiếu thông tin (vd kết quả tìm kiếm dạng video).
    const item = currentItem(usePlayer.getState());
    const d = this.el.duration;
    if (item && !item.track.durationSec && Number.isFinite(d) && d > 0) {
      usePlayer.setState((s) => ({
        queue: s.queue.map((q) => (q.uid === item.uid ? { ...q, track: { ...q.track, durationSec: Math.round(d) } } : q)),
      }));
    }
  }

  private onTime(): void {
    const t = this.el.currentTime;
    usePlayback.getState().setTime(t, this.duration());
    const delta = t - this.lastTime;
    if (delta > 0 && delta < 1.5 && !this.el.paused) this.listened += delta;
    this.lastTime = t;

    const item = currentItem(usePlayer.getState());
    if (!item) return;
    if (!this.historySent && this.listened >= HISTORY_AFTER_SEC) {
      this.historySent = true;
      api.addHistory(item.track, Math.round(this.listened)).catch(() => {
        this.historySent = false;
      });
    }
    const now = Date.now();
    if (now - this.lastSave > 5000) {
      this.lastSave = now;
      savePosition(item.track.videoId, t);
    }
    this.updatePositionState();
  }

  private onEnded(): void {
    if (usePlayer.getState().repeat === 'one') {
      this.el.currentTime = 0;
      this.play();
      return;
    }
    void this.advance(true);
  }

  private async onError(): Promise<void> {
    const item = currentItem(usePlayer.getState());
    if (!item || !this.el.src) return;
    const position = this.el.currentTime;
    // Lỗi mạng giữa chừng: thử tải lại một lần từ vị trí đang nghe.
    if (position > 1 && this.retriedUid !== item.uid) {
      this.retriedUid = item.uid;
      this.pendingSeek = position;
      this.el.src = streamUrl(item.track.videoId);
      this.play();
      return;
    }
    const wasPlaying = usePlayer.getState().playing;
    const message = await streamError(item.track.videoId);
    usePlayback.getState().markFailed(item.track.videoId, message);
    this.consecutiveErrors += 1;
    if (!wasPlaying) {
      toast.error(message, `Không phát được “${item.track.title}”`);
      return;
    }
    if (this.consecutiveErrors >= 4) {
      usePlayer.getState().setPlaying(false);
      toast.error('Nhiều bài liên tiếp không phát được, đã dừng. Kiểm tra máy chủ hoặc README.', 'Tạm dừng phát');
      return;
    }
    toast.error(`${message} Đang chuyển sang bài tiếp theo…`, `Không phát được “${item.track.title}”`);
    window.setTimeout(() => {
      if (currentItem(usePlayer.getState())?.uid === item.uid) void this.advance(true);
    }, 1200);
  }

  // ---------- Media Session ----------

  private setupMediaSession(): void {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => usePlayer.getState().setPlaying(true)],
      ['pause', () => usePlayer.getState().setPlaying(false)],
      ['previoustrack', () => this.previous()],
      ['nexttrack', () => void this.next()],
      ['seekbackward', (d) => this.seekBy(-(d.seekOffset ?? 10))],
      ['seekforward', (d) => this.seekBy(d.seekOffset ?? 10)],
      ['seekto', (d) => d.seekTime !== undefined && this.seek(d.seekTime)],
      ['stop', () => usePlayer.getState().setPlaying(false)],
    ];
    for (const [action, handler] of handlers) {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        // Trình duyệt không hỗ trợ hành động này.
      }
    }
    usePlayer.subscribe((s) => {
      ms.playbackState = currentItem(s) ? (s.playing ? 'playing' : 'paused') : 'none';
    });
  }

  private updateMetadata(track: Track): void {
    if (!('mediaSession' in navigator)) return;
    const artwork = [96, 256, 512]
      .map((size) => ({ src: img(track.thumbnail, size) ?? '', sizes: `${size}x${size}`, type: 'image/jpeg' }))
      .filter((a) => a.src);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: trackSubtitle(track),
      album: track.album?.name ?? '',
      artwork,
    });
    document.title = `${track.title} · ${trackSubtitle(track)}`;
  }

  private clearMediaSession(): void {
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
    document.title = 'Góc Nhạc';
  }

  private updatePositionState(force = false): void {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    const now = Date.now();
    if (!force && now - this.lastMediaPos < 1000) return;
    this.lastMediaPos = now;
    const duration = this.duration();
    if (!duration) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        position: Math.min(this.currentTime(), duration),
        playbackRate: this.el.playbackRate || 1,
      });
    } catch {
      // Bỏ qua giá trị không hợp lệ.
    }
  }
}

export const engine = new AudioEngine();
