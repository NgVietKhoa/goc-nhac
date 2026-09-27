// Dùng chung type với backend để hai phía luôn khớp.
export type * from '../../server/src/types.ts';

import type { Track } from '../../server/src/types.ts';

// ---- Dữ liệu cá nhân (lưu trong localStorage của trình duyệt) ----

export interface MyPlaylist {
  id: number;
  name: string;
  description?: string;
  trackCount: number;
  durationSec: number;
  /** Tối đa 4 ảnh bìa để ghép thành ảnh playlist. */
  covers: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MyPlaylistDetail extends MyPlaylist {
  tracks: (Track & { addedAt: string })[];
}

export interface LikedTrack extends Track {
  likedAt: string;
}

export interface HistoryEntry {
  id: number;
  playedAt: string;
  listenedSec: number;
  track: Track;
}
