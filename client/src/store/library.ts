import { create } from 'zustand';
import { api } from '../lib/api.ts';
import type { MyPlaylist, Track } from '../types.ts';
import { toast, toastError } from './toast.ts';

interface LibraryState {
  liked: Set<string>;
  likesLoaded: boolean;
  playlists: MyPlaylist[];
  playlistsLoaded: boolean;
  /** Tăng mỗi khi playlist thay đổi để các trang đang mở tải lại. */
  version: number;

  load(): Promise<void>;
  refreshPlaylists(): Promise<void>;
  isLiked(videoId: string): boolean;
  toggleLike(track: Track): Promise<void>;
  createPlaylist(name: string, tracks?: Track[]): Promise<MyPlaylist | undefined>;
  addToPlaylist(playlist: MyPlaylist, tracks: Track[]): Promise<void>;
  bump(): void;
}

export const useLibrary = create<LibraryState>()((set, get) => ({
  liked: new Set(),
  likesLoaded: false,
  playlists: [],
  playlistsLoaded: false,
  version: 0,

  async load() {
    try {
      const [likes, playlists] = await Promise.all([api.likes(), api.playlists()]);
      set({ liked: new Set(likes.map((l) => l.videoId)), likesLoaded: true, playlists, playlistsLoaded: true });
    } catch (err) {
      toastError(err, 'Không tải được thư viện của bạn.');
    }
  },

  async refreshPlaylists() {
    try {
      set({ playlists: await api.playlists(), playlistsLoaded: true });
    } catch (err) {
      toastError(err);
    }
  },

  isLiked: (videoId) => get().liked.has(videoId),

  async toggleLike(track) {
    const was = get().liked.has(track.videoId);
    const optimistic = new Set(get().liked);
    if (was) optimistic.delete(track.videoId);
    else optimistic.add(track.videoId);
    set({ liked: optimistic, version: get().version + 1 });
    try {
      if (was) await api.unlike(track.videoId);
      else await api.like(track);
    } catch (err) {
      const rollback = new Set(get().liked);
      if (was) rollback.add(track.videoId);
      else rollback.delete(track.videoId);
      set({ liked: rollback });
      toastError(err, 'Không lưu được lượt thích.');
    }
  },

  async createPlaylist(name, tracks) {
    try {
      const created = await api.createPlaylist(name, tracks);
      await get().refreshPlaylists();
      get().bump();
      toast.info(tracks?.length ? `Đã tạo “${name}” với ${tracks.length} bài` : `Đã tạo playlist “${name}”`);
      return created;
    } catch (err) {
      toastError(err, 'Không tạo được playlist.');
      return undefined;
    }
  },

  async addToPlaylist(playlist, tracks) {
    try {
      const { added } = await api.addToPlaylist(playlist.id, tracks);
      await get().refreshPlaylists();
      get().bump();
      if (added === 0) {
        toast.info(`Bài đã có sẵn trong ${playlist.name}`);
        return;
      }
      const label = tracks.length === 1 ? `“${tracks[0].title}”` : `${added} bài`;
      const addedIds = tracks.map((t) => t.videoId);
      // Chỉ cho hoàn tác khi mọi bài đều mới thêm (không xóa nhầm bài đã có sẵn).
      if (added !== tracks.length) {
        toast.info(`Đã thêm ${label} vào ${playlist.name}`);
        return;
      }
      toast.info(`Đã thêm ${label} vào ${playlist.name}`, {
        label: 'Hoàn tác',
        run: async () => {
          try {
            await Promise.all(addedIds.map((id) => api.removeFromPlaylist(playlist.id, id).catch(() => {})));
            await get().refreshPlaylists();
            get().bump();
          } catch (err) {
            toastError(err);
          }
        },
      });
    } catch (err) {
      toastError(err, 'Không thêm được vào playlist.');
    }
  },

  bump: () => set({ version: get().version + 1 }),
}));
