import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { shuffleArray, uid } from '../lib/format.ts';
import type { Track } from '../types.ts';

export type RepeatMode = 'off' | 'all' | 'one';

export interface QueueItem {
  uid: string;
  track: Track;
  /** 'auto' = bài do tự động phát thêm vào. */
  source: 'user' | 'auto';
}

export interface PlayContext {
  label: string;
  /** vd "Đang phát từ playlist" */
  kind: string;
  href?: string;
}

interface PlayerState {
  queue: QueueItem[];
  index: number;
  /** Thứ tự gốc (uid) trước khi bật trộn bài, để tắt trộn thì khôi phục. */
  originalOrder: string[] | null;
  shuffle: boolean;
  repeat: RepeatMode;
  autoplay: boolean;
  volume: number;
  muted: boolean;
  playing: boolean;
  context: PlayContext | null;

  playTracks(tracks: Track[], start?: number, context?: PlayContext | null, shuffle?: boolean): void;
  playNext(tracks: Track[]): void;
  addToQueue(tracks: Track[], source?: QueueItem['source']): void;
  removeFromQueue(uid: string): void;
  moveInQueue(fromUid: string, toUid: string): void;
  clearUpcoming(): void;
  jumpTo(uid: string): void;
  /** Chuyển sang bài kế; trả về false nếu đã hết hàng đợi. */
  next(auto?: boolean): boolean;
  prev(): void;
  setPlaying(playing: boolean): void;
  toggle(): void;
  setVolume(volume: number): void;
  toggleMute(): void;
  toggleShuffle(): void;
  cycleRepeat(): void;
  setAutoplay(on: boolean): void;
}

const toItems = (tracks: Track[], source: QueueItem['source'] = 'user'): QueueItem[] =>
  tracks.map((track) => ({ uid: uid(), track, source }));

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => ({
      queue: [],
      index: -1,
      originalOrder: null,
      shuffle: false,
      repeat: 'off',
      autoplay: true,
      volume: 0.8,
      muted: false,
      playing: false,
      context: null,

      playTracks(tracks, start = 0, context = null, shuffle) {
        if (tracks.length === 0) return;
        const items = toItems(tracks);
        const useShuffle = shuffle ?? get().shuffle;
        if (useShuffle) {
          const first = items[Math.min(start, items.length - 1)];
          const rest = shuffleArray(items.filter((i) => i !== first));
          const queue = shuffle === true && start === 0 && tracks.length > 1 ? shuffleArray(items) : [first, ...rest];
          set({ queue, index: 0, originalOrder: items.map((i) => i.uid), shuffle: true, playing: true, context });
        } else {
          set({ queue: items, index: Math.min(start, items.length - 1), originalOrder: null, playing: true, context });
        }
      },

      playNext(tracks) {
        const { queue, index } = get();
        if (index < 0) return get().playTracks(tracks);
        const items = toItems(tracks);
        const next = [...queue.slice(0, index + 1), ...items, ...queue.slice(index + 1)];
        set((s) => ({
          queue: next,
          originalOrder: s.originalOrder ? [...s.originalOrder, ...items.map((i) => i.uid)] : null,
        }));
      },

      addToQueue(tracks, source = 'user') {
        const { index } = get();
        if (index < 0 && source === 'user') return get().playTracks(tracks);
        const items = toItems(tracks, source);
        set((s) => ({
          queue: [...s.queue, ...items],
          originalOrder: s.originalOrder ? [...s.originalOrder, ...items.map((i) => i.uid)] : null,
        }));
      },

      removeFromQueue(id) {
        const { queue, index } = get();
        const pos = queue.findIndex((i) => i.uid === id);
        if (pos < 0 || pos === index) return;
        set((s) => ({
          queue: queue.filter((i) => i.uid !== id),
          index: pos < index ? index - 1 : index,
          originalOrder: s.originalOrder?.filter((u) => u !== id) ?? null,
        }));
      },

      moveInQueue(fromUid, toUid) {
        const { queue, index } = get();
        const from = queue.findIndex((i) => i.uid === fromUid);
        const to = queue.findIndex((i) => i.uid === toUid);
        if (from < 0 || to < 0 || from === to) return;
        const current = queue[index]?.uid;
        const next = [...queue];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        set({ queue: next, index: next.findIndex((i) => i.uid === current) });
      },

      clearUpcoming() {
        const { queue, index } = get();
        set({ queue: queue.slice(0, index + 1), originalOrder: null });
      },

      jumpTo(id) {
        const pos = get().queue.findIndex((i) => i.uid === id);
        if (pos >= 0) set({ index: pos, playing: true });
      },

      next(auto = false) {
        const { queue, index, repeat } = get();
        if (queue.length === 0) return false;
        if (index + 1 < queue.length) {
          set({ index: index + 1, playing: true });
          return true;
        }
        if (repeat === 'all' || (!auto && repeat === 'one')) {
          set({ index: 0, playing: true });
          return true;
        }
        return false;
      },

      prev() {
        const { queue, index, repeat } = get();
        if (queue.length === 0) return;
        if (index > 0) set({ index: index - 1, playing: true });
        else if (repeat === 'all') set({ index: queue.length - 1, playing: true });
      },

      setPlaying: (playing) => set({ playing }),
      toggle: () => set((s) => ({ playing: s.index >= 0 ? !s.playing : false })),
      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)), muted: false }),
      toggleMute: () => set((s) => ({ muted: !s.muted })),

      toggleShuffle() {
        const { shuffle, queue, index, originalOrder } = get();
        if (!shuffle) {
          // Trộn các bài phía sau bài hiện tại.
          const head = queue.slice(0, index + 1);
          const tail = shuffleArray(queue.slice(index + 1));
          set({ shuffle: true, originalOrder: queue.map((i) => i.uid), queue: [...head, ...tail] });
        } else {
          const current = queue[index]?.uid;
          let restored = queue;
          if (originalOrder) {
            const pos = new Map(originalOrder.map((u, i) => [u, i]));
            restored = [...queue].sort((a, b) => (pos.get(a.uid) ?? 1e9) - (pos.get(b.uid) ?? 1e9));
          }
          set({ shuffle: false, originalOrder: null, queue: restored, index: restored.findIndex((i) => i.uid === current) });
        }
      },

      cycleRepeat: () => set((s) => ({ repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off' })),
      setAutoplay: (autoplay) => set({ autoplay }),
    }),
    {
      name: 'gocnhac.player',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        // Giữ tối đa 300 bài quanh bài đang phát để localStorage không phình to.
        queue: s.queue.slice(Math.max(0, s.index - 50), Math.max(0, s.index - 50) + 300),
        index: s.index - Math.max(0, s.index - 50),
        originalOrder: s.originalOrder,
        shuffle: s.shuffle,
        repeat: s.repeat,
        autoplay: s.autoplay,
        volume: s.volume,
        muted: s.muted,
        context: s.context,
      }),
    },
  ),
);

export const currentItem = (s: Pick<PlayerState, 'queue' | 'index'>): QueueItem | undefined => s.queue[s.index];

// ---- Trạng thái phát theo thời gian thực (không persist, cập nhật nhiều lần mỗi giây) ----

interface PlaybackState {
  position: number;
  duration: number;
  buffering: boolean;
  /** uid các bài đã lỗi (để hiện mờ "Không khả dụng"). */
  failed: Record<string, string>;
  setTime(position: number, duration?: number): void;
  setBuffering(b: boolean): void;
  markFailed(videoId: string, message: string): void;
}

export const usePlayback = create<PlaybackState>()((set) => ({
  position: 0,
  duration: 0,
  buffering: false,
  failed: {},
  setTime: (position, duration) => set((s) => ({ position, duration: duration ?? s.duration })),
  setBuffering: (buffering) => set({ buffering }),
  markFailed: (videoId, message) => set((s) => ({ failed: { ...s.failed, [videoId]: message } })),
}));

const POSITION_KEY = 'gocnhac.position';

export function savePosition(videoId: string, position: number): void {
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify({ videoId, position }));
  } catch {
    // localStorage đầy hoặc bị chặn — bỏ qua.
  }
}

export function loadPosition(videoId: string): number {
  try {
    const raw = localStorage.getItem(POSITION_KEY);
    if (!raw) return 0;
    const data = JSON.parse(raw) as { videoId?: string; position?: number };
    return data.videoId === videoId && typeof data.position === 'number' ? data.position : 0;
  } catch {
    return 0;
  }
}
