import { create } from 'zustand';
import type { Track } from '../types.ts';

export interface TrackMenuState {
  x: number;
  y: number;
  track: Track;
  /** Đang mở trong playlist của tôi → có mục "Xóa khỏi playlist". */
  playlistId?: number;
  /** Đang mở trong hàng đợi → có mục "Xóa khỏi hàng đợi". */
  queueUid?: string;
}

interface UiState {
  queueOpen: boolean;
  nowPlayingOpen: boolean;
  menu: TrackMenuState | null;
  addToPlaylist: Track[] | null;
  toggleQueue(): void;
  setQueueOpen(open: boolean): void;
  setNowPlaying(open: boolean): void;
  openMenu(menu: TrackMenuState): void;
  closeMenu(): void;
  openAddToPlaylist(tracks: Track[]): void;
  closeAddToPlaylist(): void;
}

const wideScreen = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1200px)').matches;

export const useUi = create<UiState>()((set) => ({
  queueOpen: wideScreen(),
  nowPlayingOpen: false,
  menu: null,
  addToPlaylist: null,
  toggleQueue: () => set((s) => ({ queueOpen: !s.queueOpen })),
  setQueueOpen: (queueOpen) => set({ queueOpen }),
  setNowPlaying: (nowPlayingOpen) => set({ nowPlayingOpen }),
  openMenu: (menu) => set({ menu }),
  closeMenu: () => set({ menu: null }),
  openAddToPlaylist: (tracks) => set({ addToPlaylist: tracks, menu: null }),
  closeAddToPlaylist: () => set({ addToPlaylist: null }),
}));
