// Thư viện cá nhân (playlist, yêu thích, lịch sử) lưu trong localStorage — không cần database.
import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { HistoryEntry, LikedTrack, MyPlaylist, MyPlaylistDetail, Track } from '../types.ts';
import { toast } from './toast.ts';

interface StoredPlaylist {
  id: number;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  tracks: { track: Track; addedAt: string }[];
}

const MAX_HISTORY = 1000;
const now = () => new Date().toISOString();

/** Chỉ giữ các trường cần thiết của Track (tránh lưu dữ liệu thừa). */
const slim = (t: Track): Track => ({
  videoId: t.videoId,
  title: t.title,
  artists: t.artists,
  album: t.album,
  durationSec: t.durationSec,
  thumbnail: t.thumbnail,
});

export function summarize(p: StoredPlaylist): MyPlaylist {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    trackCount: p.tracks.length,
    durationSec: p.tracks.reduce((s, i) => s + (i.track.durationSec ?? 0), 0),
    covers: p.tracks.flatMap((i) => (i.track.thumbnail ? [i.track.thumbnail] : [])).slice(0, 4),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export function detail(p: StoredPlaylist): MyPlaylistDetail {
  return { ...summarize(p), tracks: p.tracks.map((i) => ({ ...i.track, addedAt: i.addedAt })) };
}

interface LibraryState {
  playlists: StoredPlaylist[];
  likes: LikedTrack[];
  likedIds: Record<string, true>;
  history: HistoryEntry[];
  nextId: number;

  toggleLike(track: Track): void;
  createPlaylist(name: string, tracks?: Track[]): MyPlaylist;
  renamePlaylist(id: number, name: string): void;
  deletePlaylist(id: number): void;
  addToPlaylist(playlist: Pick<MyPlaylist, 'id' | 'name'>, tracks: Track[]): void;
  removeFromPlaylist(id: number, videoId: string): void;
  reorderPlaylist(id: number, videoIds: string[]): void;
  addHistory(track: Track, listenedSec: number): void;
  clearHistory(): void;
  exportData(): string;
  importData(json: string): void;
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => {
      const updatePlaylist = (id: number, fn: (p: StoredPlaylist) => StoredPlaylist) =>
        set((s) => ({ playlists: s.playlists.map((p) => (p.id === id ? { ...fn(p), updatedAt: now() } : p)) }));

      return {
        playlists: [],
        likes: [],
        likedIds: {},
        history: [],
        nextId: 1,

        toggleLike(track) {
          const { likedIds, likes } = get();
          if (likedIds[track.videoId]) {
            const next = { ...likedIds };
            delete next[track.videoId];
            set({ likedIds: next, likes: likes.filter((l) => l.videoId !== track.videoId) });
          } else {
            set({ likedIds: { ...likedIds, [track.videoId]: true }, likes: [{ ...slim(track), likedAt: now() }, ...likes] });
          }
        },

        createPlaylist(name, tracks = []) {
          const id = get().nextId;
          const unique = [...new Map(tracks.map((t) => [t.videoId, t])).values()];
          const playlist: StoredPlaylist = {
            id,
            name: name.trim().slice(0, 100),
            createdAt: now(),
            updatedAt: now(),
            tracks: unique.map((t) => ({ track: slim(t), addedAt: now() })),
          };
          set((s) => ({ playlists: [playlist, ...s.playlists], nextId: id + 1 }));
          toast.info(unique.length ? `Đã tạo “${playlist.name}” với ${unique.length} bài` : `Đã tạo playlist “${playlist.name}”`);
          return summarize(playlist);
        },

        renamePlaylist: (id, name) => updatePlaylist(id, (p) => ({ ...p, name: name.trim().slice(0, 100) })),

        deletePlaylist: (id) => set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) })),

        addToPlaylist(playlist, tracks) {
          const target = get().playlists.find((p) => p.id === playlist.id);
          if (!target) return;
          const have = new Set(target.tracks.map((i) => i.track.videoId));
          const fresh = [...new Map(tracks.filter((t) => !have.has(t.videoId)).map((t) => [t.videoId, t])).values()];
          if (fresh.length === 0) {
            toast.info(`Bài đã có sẵn trong ${playlist.name}`);
            return;
          }
          updatePlaylist(playlist.id, (p) => ({ ...p, tracks: [...p.tracks, ...fresh.map((t) => ({ track: slim(t), addedAt: now() }))] }));
          const label = fresh.length === 1 ? `“${fresh[0].title}”` : `${fresh.length} bài`;
          const ids = new Set(fresh.map((t) => t.videoId));
          toast.info(`Đã thêm ${label} vào ${playlist.name}`, {
            label: 'Hoàn tác',
            run: () => updatePlaylist(playlist.id, (p) => ({ ...p, tracks: p.tracks.filter((i) => !ids.has(i.track.videoId)) })),
          });
        },

        removeFromPlaylist: (id, videoId) =>
          updatePlaylist(id, (p) => ({ ...p, tracks: p.tracks.filter((i) => i.track.videoId !== videoId) })),

        reorderPlaylist: (id, videoIds) =>
          updatePlaylist(id, (p) => {
            const byId = new Map(p.tracks.map((i) => [i.track.videoId, i]));
            return { ...p, tracks: videoIds.flatMap((v) => byId.get(v) ?? []) };
          }),

        addHistory(track, listenedSec) {
          set((s) => {
            const id = (s.history[0]?.id ?? 0) + 1;
            const entry: HistoryEntry = { id, playedAt: now(), listenedSec: Math.round(listenedSec), track: slim(track) };
            return { history: [entry, ...s.history].slice(0, MAX_HISTORY) };
          });
        },

        clearHistory: () => set({ history: [] }),

        exportData() {
          const { playlists, likes, history, nextId } = get();
          return JSON.stringify({ app: 'goc-nhac', version: 1, exportedAt: now(), playlists, likes, history, nextId }, null, 2);
        },

        importData(json) {
          const data = JSON.parse(json) as Partial<Pick<LibraryState, 'playlists' | 'likes' | 'history' | 'nextId'>> & { app?: string };
          if (data.app !== 'goc-nhac' || !Array.isArray(data.playlists) || !Array.isArray(data.likes)) {
            throw new Error('File không phải bản sao lưu của Góc Nhạc.');
          }
          const likes = data.likes;
          const maxId = Math.max(0, ...data.playlists.map((p) => p.id));
          set({
            playlists: data.playlists,
            likes,
            likedIds: Object.fromEntries(likes.map((l) => [l.videoId, true as const])),
            history: Array.isArray(data.history) ? data.history.slice(0, MAX_HISTORY) : [],
            nextId: Math.max(data.nextId ?? 1, maxId + 1),
          });
        },
      };
    },
    {
      name: 'gocnhac.library',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ playlists: s.playlists, likes: s.likes, likedIds: s.likedIds, history: s.history, nextId: s.nextId }),
    },
  ),
);

/** Danh sách playlist dạng tóm tắt, mới cập nhật lên đầu. */
export function usePlaylists(): MyPlaylist[] {
  const playlists = useLibrary((s) => s.playlists);
  return useMemo(
    () => playlists.map(summarize).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [playlists],
  );
}

export function usePlaylistDetail(id: number): MyPlaylistDetail | undefined {
  const playlist = useLibrary((s) => s.playlists.find((p) => p.id === id));
  return useMemo(() => (playlist ? detail(playlist) : undefined), [playlist]);
}
