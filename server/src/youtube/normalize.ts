// Chuyển các node phức tạp của youtubei.js thành type gọn của app.
import { YTNodes } from 'youtubei.js';
import type { Misc } from 'youtubei.js';
import type {
  AlbumSummary,
  ArtistRef,
  ArtistSummary,
  PlaylistSummary,
  Shelf,
  ShelfItem,
  TopResult,
  Track,
} from '../types.ts';

type Thumb = { url: string; width?: number; height?: number };
type Text = Misc.Text;
type RawArtist = { name: string; channel_id?: string };

const COVER_SIZE = 544;

/** Lấy ảnh lớn nhất; ảnh googleusercontent thì xin đúng kích thước mong muốn. */
export function bestThumb(thumbs: readonly Thumb[] | null | undefined, size = COVER_SIZE): string | undefined {
  if (!thumbs || thumbs.length === 0) return undefined;
  const best = [...thumbs].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  let url = best.url.startsWith('//') ? `https:${best.url}` : best.url;
  if (/googleusercontent\.com|ggpht\.com/.test(url)) {
    url = /=w\d+-h\d+/.test(url)
      ? url.replace(/=w\d+-h\d+[^&?#]*/, `=w${size}-h${size}-l90-rj`)
      : url.replace(/=s\d+[^&?#]*/, `=s${size}`);
  }
  return url;
}

const text = (t: Text | string | undefined | null): string | undefined => {
  if (t === undefined || t === null) return undefined;
  const s = typeof t === 'string' ? t : t.text;
  return s && s.trim() !== '' ? s : undefined;
};

const artistRefs = (list: readonly RawArtist[] | undefined): ArtistRef[] =>
  (list ?? []).filter((a) => a.name).map((a) => ({ id: a.channel_id || undefined, name: a.name }));

/** Lấy danh sách nghệ sĩ từ các run của một dòng chữ (run nào trỏ tới kênh UC… là nghệ sĩ). */
export function artistsFromText(t: Text | undefined): ArtistRef[] {
  const runs = t?.runs ?? [];
  const result: ArtistRef[] = [];
  for (const run of runs) {
    if (!('endpoint' in run)) continue;
    const browseId = browseIdOf(run.endpoint);
    if (browseId?.startsWith('UC')) result.push({ id: browseId, name: run.text });
  }
  return result;
}

function browseIdOf(endpoint: unknown): string | undefined {
  const payload = (endpoint as { payload?: { browseId?: unknown } } | undefined)?.payload;
  return typeof payload?.browseId === 'string' ? payload.browseId : undefined;
}

function videoIdOf(endpoint: unknown): string | undefined {
  const payload = (endpoint as { payload?: { videoId?: unknown } } | undefined)?.payload;
  return typeof payload?.videoId === 'string' ? payload.videoId : undefined;
}

const SONG_TYPES = new Set(['song', 'video', 'non_music_track']);
const SUBTITLE_LABELS = new Set(['Bài hát', 'Video', 'Song', 'Tập', 'Episode', 'Podcast']);
const DURATION = /^\d{1,2}(:\d{2}){1,2}$/;

function parseDuration(value: string): number {
  return value.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
}

// ---------- Track ----------

export function trackFromListItem(item: YTNodes.MusicResponsiveListItem): Track | undefined {
  const videoId = item.id ?? videoIdOf(item.overlay?.content?.endpoint) ?? videoIdOf(item.endpoint);
  if (!videoId || !item.title) return undefined;
  let artists = artistRefs(item.artists);
  if (artists.length === 0) artists = artistRefs(item.authors);
  if (artists.length === 0 && item.author) artists = artistRefs([item.author]);
  // Một số kết quả (dạng video, tìm kiếm tổng hợp) chỉ có thông tin trong dòng phụ đề:
  // "Video • Tên kênh • 1,2 Tr lượt xem • 4:21".
  const subtitle = item.flex_columns?.[1]?.title;
  const parts = (text(subtitle) ?? '').split(' • ').map((p) => p.trim()).filter(Boolean);
  if (artists.length === 0) artists = artistsFromText(subtitle);
  if (artists.length === 0) {
    const name = parts.find((p) => !SUBTITLE_LABELS.has(p) && !DURATION.test(p) && !/lượt|views?|plays?/i.test(p));
    if (name) artists = [{ name }];
  }
  const durationText = parts.find((p) => DURATION.test(p));
  return {
    videoId,
    title: item.title,
    artists,
    album: item.album?.name ? { id: item.album.id, name: item.album.name } : undefined,
    durationSec: item.duration?.seconds || (durationText ? parseDuration(durationText) : undefined),
    thumbnail: bestThumb(item.thumbnail?.contents),
  };
}

export function trackFromTwoRow(item: YTNodes.MusicTwoRowItem): Track | undefined {
  const videoId = item.id ?? videoIdOf(item.endpoint);
  const title = text(item.title);
  if (!videoId || !title) return undefined;
  let artists = artistRefs(item.artists);
  if (artists.length === 0 && item.author) artists = artistRefs([item.author]);
  if (artists.length === 0) artists = artistsFromText(item.subtitle);
  return { videoId, title, artists, thumbnail: bestThumb(item.thumbnail) };
}

export function trackFromPanel(item: YTNodes.PlaylistPanelVideo): Track | undefined {
  const title = text(item.title);
  if (!item.video_id || !title) return undefined;
  const artists = artistRefs(item.artists);
  return {
    videoId: item.video_id,
    title,
    artists: artists.length > 0 ? artists : item.author ? [{ name: item.author }] : [],
    album: item.album?.name ? { id: item.album.id, name: item.album.name } : undefined,
    durationSec: item.duration?.seconds || undefined,
    thumbnail: bestThumb(item.thumbnail),
  };
}

// ---------- Album / Artist / Playlist summaries ----------

export function albumFromNode(item: YTNodes.MusicResponsiveListItem | YTNodes.MusicTwoRowItem): AlbumSummary | undefined {
  const id = item.id ?? browseIdOf(item.endpoint);
  if (!id) return undefined;
  if (item instanceof YTNodes.MusicTwoRowItem) {
    const artists = artistRefs(item.artists);
    return {
      id,
      title: text(item.title) ?? '',
      artists: artists.length > 0 ? artists : item.author ? artistRefs([item.author]) : artistsFromText(item.subtitle),
      year: item.year,
      thumbnail: bestThumb(item.thumbnail),
    };
  }
  return {
    id,
    title: item.title ?? '',
    artists: item.author ? artistRefs([item.author]) : artistRefs(item.artists),
    year: item.year,
    thumbnail: bestThumb(item.thumbnail?.contents),
  };
}

export function artistFromNode(item: YTNodes.MusicResponsiveListItem | YTNodes.MusicTwoRowItem): ArtistSummary | undefined {
  const id = item.id ?? browseIdOf(item.endpoint);
  if (!id) return undefined;
  if (item instanceof YTNodes.MusicTwoRowItem) {
    return { id, name: text(item.title) ?? '', subtitle: text(item.subtitle), thumbnail: bestThumb(item.thumbnail, 320) };
  }
  return {
    id,
    name: item.name ?? item.title ?? '',
    subtitle: text(item.subtitle),
    thumbnail: bestThumb(item.thumbnail?.contents, 320),
  };
}

export function playlistFromNode(item: YTNodes.MusicResponsiveListItem | YTNodes.MusicTwoRowItem): PlaylistSummary | undefined {
  const id = item.id ?? browseIdOf(item.endpoint);
  if (!id) return undefined;
  if (item instanceof YTNodes.MusicTwoRowItem) {
    return { id, title: text(item.title) ?? '', author: item.author?.name, subtitle: text(item.subtitle), thumbnail: bestThumb(item.thumbnail) };
  }
  return {
    id,
    title: item.title ?? '',
    author: item.author?.name,
    subtitle: text(item.subtitle),
    thumbnail: bestThumb(item.thumbnail?.contents),
  };
}

/** Một item bất kỳ trong carousel/shelf → ShelfItem (bỏ qua loại không hỗ trợ như podcast). */
export function shelfItem(node: unknown): ShelfItem | undefined {
  if (node instanceof YTNodes.MusicResponsiveListItem || node instanceof YTNodes.MusicTwoRowItem) {
    const kind = node.item_type ?? '';
    if (SONG_TYPES.has(kind)) {
      const track = node instanceof YTNodes.MusicTwoRowItem ? trackFromTwoRow(node) : trackFromListItem(node);
      return track && { kind: 'song', track };
    }
    if (kind === 'album') {
      const album = albumFromNode(node);
      return album && { kind: 'album', album };
    }
    if (kind === 'artist' || kind === 'library_artist') {
      const artist = artistFromNode(node);
      return artist && { kind: 'artist', artist };
    }
    if (kind === 'playlist') {
      const playlist = playlistFromNode(node);
      return playlist && { kind: 'playlist', playlist };
    }
  }
  return undefined;
}

export function shelfFromNode(node: unknown): Shelf | undefined {
  if (node instanceof YTNodes.MusicCarouselShelf) {
    const items = node.contents.map(shelfItem).filter((x): x is ShelfItem => x !== undefined);
    const title = text(node.header?.title);
    if (!title || items.length === 0) return undefined;
    return { title, subtitle: text(node.header?.strapline), items };
  }
  if (node instanceof YTNodes.MusicShelf) {
    const items = node.contents.map(shelfItem).filter((x): x is ShelfItem => x !== undefined);
    const title = text(node.title);
    if (!title || items.length === 0) return undefined;
    return { title, morePlaylistId: browseIdOf(node.endpoint), items };
  }
  return undefined;
}

/** Thẻ "Kết quả hàng đầu" của tìm kiếm tổng hợp. */
export function topResultFromCard(card: YTNodes.MusicCardShelf): TopResult | undefined {
  const title = text(card.title);
  if (!title) return undefined;
  const thumbnail = bestThumb(card.thumbnail?.contents);
  const videoId = videoIdOf(card.on_tap);
  if (videoId) {
    return { kind: 'song', track: { videoId, title, artists: artistsFromText(card.subtitle), thumbnail } };
  }
  const browseId = browseIdOf(card.on_tap);
  if (!browseId) return undefined;
  if (browseId.startsWith('UC')) {
    return { kind: 'artist', artist: { id: browseId, name: title, subtitle: text(card.subtitle), thumbnail } };
  }
  if (browseId.startsWith('MPRE')) {
    return { kind: 'album', album: { id: browseId, title, artists: artistsFromText(card.subtitle), thumbnail } };
  }
  if (browseId.startsWith('VL')) {
    return { kind: 'playlist', playlist: { id: browseId, title, subtitle: text(card.subtitle), thumbnail } };
  }
  return undefined;
}

export { text as textOf, browseIdOf };
