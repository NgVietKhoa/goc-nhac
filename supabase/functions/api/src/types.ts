// Các kiểu dữ liệu gọn của app — frontend chỉ phụ thuộc vào file này,
// không phụ thuộc cấu trúc của youtubei.js.

export interface ArtistRef {
  id?: string;
  name: string;
}

export interface AlbumRef {
  id?: string;
  name: string;
}

export interface Track {
  videoId: string;
  title: string;
  artists: ArtistRef[];
  album?: AlbumRef;
  durationSec?: number;
  /** Ảnh bìa lớn nhất tìm được. */
  thumbnail?: string;
}

export interface AlbumSummary {
  id: string;
  title: string;
  artists: ArtistRef[];
  year?: string;
  thumbnail?: string;
}

export interface ArtistSummary {
  id: string;
  name: string;
  subtitle?: string;
  thumbnail?: string;
}

export interface PlaylistSummary {
  id: string;
  title: string;
  author?: string;
  subtitle?: string;
  thumbnail?: string;
}

export type SearchType = 'song' | 'album' | 'artist' | 'playlist';

export type TopResult =
  | { kind: 'song'; track: Track }
  | { kind: 'album'; album: AlbumSummary }
  | { kind: 'artist'; artist: ArtistSummary }
  | { kind: 'playlist'; playlist: PlaylistSummary };

export interface SearchAllResult {
  top?: TopResult;
  songs: Track[];
  albums: AlbumSummary[];
  artists: ArtistSummary[];
  playlists: PlaylistSummary[];
}

export type SearchResult =
  | { type: 'all'; result: SearchAllResult }
  | { type: 'song'; items: Track[] }
  | { type: 'album'; items: AlbumSummary[] }
  | { type: 'artist'; items: ArtistSummary[] }
  | { type: 'playlist'; items: PlaylistSummary[] };

export interface Album extends AlbumSummary {
  subtitle?: string;
  info?: string;
  tracks: Track[];
}

export type ShelfItem =
  | { kind: 'song'; track: Track }
  | { kind: 'album'; album: AlbumSummary }
  | { kind: 'artist'; artist: ArtistSummary }
  | { kind: 'playlist'; playlist: PlaylistSummary };

export interface Shelf {
  title: string;
  subtitle?: string;
  /** Playlist chứa đầy đủ các bài (vd "Bài hát hàng đầu" của nghệ sĩ). */
  morePlaylistId?: string;
  items: ShelfItem[];
}

export interface Artist {
  id: string;
  name: string;
  description?: string;
  thumbnail?: string;
  shelves: Shelf[];
}

export interface Playlist extends PlaylistSummary {
  info?: string;
  description?: string;
  tracks: Track[];
}

export interface HomeFeed {
  /** Các chip tâm trạng (Thư giãn, Tập trung…). */
  filters: string[];
  activeFilter?: string;
  shelves: Shelf[];
}

export interface SearchSuggestions {
  queries: string[];
  items: ShelfItem[];
}

export interface Lyrics {
  lines: string[];
  source?: string;
}

// ---- Dữ liệu cá nhân ----

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

export interface ApiError {
  error: { code: string; message: string };
}
