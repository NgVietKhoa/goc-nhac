// Mọi lời gọi youtubei.js cho phần đọc dữ liệu (tìm kiếm, album, nghệ sĩ…) nằm ở đây.
import { YTNodes } from 'youtubei.js';
import { AppError, notFound } from '../errors.ts';
import { TtlCache } from '../lib/ttlCache.ts';
import type {
  Album,
  AlbumSummary,
  Artist,
  HomeFeed,
  Lyrics,
  Playlist,
  PlaylistSummary,
  SearchAllResult,
  SearchResult,
  SearchSuggestions,
  SearchType,
  Shelf,
  ShelfItem,
  Track,
} from '../types.ts';
import { getYT } from './client.ts';
import {
  artistsFromText,
  bestThumb,
  shelfFromNode,
  shelfItem,
  textOf,
  topResultFromCard,
  trackFromListItem,
  trackFromPanel,
} from './normalize.ts';

const MIN = 60_000;
const cache = new TtlCache<unknown>(300);

function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  return cache.wrap(key, ttlMs, load) as Promise<T>;
}

/** youtubei.js ném lỗi chung chung khi id sai → đổi thành 404 tiếng Việt. */
async function guard<T>(what: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    if (/404|not found|invalid|does not exist|unavailable/i.test(message)) throw notFound(`Không tìm thấy ${what}.`);
    throw new AppError('UPSTREAM', `YouTube Music không phản hồi (${what}). Thử lại sau.`, 502);
  }
}

const isTrack = (t: Track | undefined): t is Track => t !== undefined;

// ---------- Tìm kiếm ----------

export async function search(query: string, type: SearchType | 'all'): Promise<SearchResult> {
  const yt = await getYT();
  return guard('kết quả tìm kiếm', async () => {
    const res = await yt.music.search(query, { type });
    const shelves = res.contents ?? [];

    if (type === 'all') {
      const result: SearchAllResult = { songs: [], albums: [], artists: [], playlists: [] };
      const seen = new Set<string>();
      const push = (item: ShelfItem | undefined) => {
        if (!item) return;
        const key =
          item.kind === 'song' ? item.track.videoId
          : item.kind === 'album' ? item.album.id
          : item.kind === 'artist' ? item.artist.id
          : item.playlist.id;
        if (seen.has(key)) return;
        seen.add(key);
        if (item.kind === 'song') result.songs.push(item.track);
        else if (item.kind === 'album') result.albums.push(item.album);
        else if (item.kind === 'artist') result.artists.push(item.artist);
        else result.playlists.push(item.playlist);
      };
      for (const shelf of shelves) {
        if (shelf instanceof YTNodes.MusicCardShelf) {
          const top = topResultFromCard(shelf);
          result.top ??= top;
          // Bài trong thẻ nghệ sĩ thường không ghi tên nghệ sĩ → dùng nghệ sĩ của thẻ.
          const owner = top?.kind === 'artist' ? [{ id: top.artist.id, name: top.artist.name }] : [];
          for (const node of shelf.contents ?? []) {
            const item = shelfItem(node);
            if (item?.kind === 'song' && item.track.artists.length === 0) item.track.artists = owner;
            push(item);
          }
        } else {
          for (const node of shelf.contents ?? []) push(shelfItem(node));
        }
      }
      return { type: 'all', result };
    }

    let items = shelves.flatMap((s) => [...(s.contents ?? [])]).map(shelfItem).filter((x): x is ShelfItem => !!x);
    if (items.length === 0) {
      // Từ một số IP/khu vực, YouTube trả trang lọc với cấu trúc khác → lấy từ kết quả tổng hợp.
      const all = await yt.music.search(query, { type: 'all' });
      items = (all.contents ?? []).flatMap((s) => [...(s.contents ?? [])]).map(shelfItem).filter((x): x is ShelfItem => !!x);
    }
    switch (type) {
      case 'song':
        return { type, items: items.flatMap((i) => (i.kind === 'song' ? [i.track] : [])) };
      case 'album':
        return { type, items: items.flatMap((i) => (i.kind === 'album' ? [i.album] : [])) };
      case 'artist':
        return { type, items: items.flatMap((i) => (i.kind === 'artist' ? [i.artist] : [])) };
      case 'playlist':
        return { type, items: items.flatMap((i) => (i.kind === 'playlist' ? [i.playlist] : [])) };
    }
  });
}

export async function suggestions(query: string): Promise<SearchSuggestions> {
  const yt = await getYT();
  return cached(`sugg:${query}`, 30 * MIN, () =>
    guard('gợi ý', async () => {
      const sections = await yt.music.getSearchSuggestions(query);
      const queries: string[] = [];
      const items: ShelfItem[] = [];
      for (const section of sections) {
        for (const node of section.contents) {
          if (node instanceof YTNodes.SearchSuggestion) {
            const q = textOf(node.suggestion);
            if (q) queries.push(q);
          } else {
            const item = shelfItem(node);
            if (item) items.push(item);
          }
        }
      }
      return { queries, items };
    }),
  );
}

// ---------- Bài hát ----------

function panelTracks(contents: readonly unknown[]): Track[] {
  const tracks: Track[] = [];
  for (const node of contents) {
    if (node instanceof YTNodes.PlaylistPanelVideo) tracks.push(...[trackFromPanel(node)].filter(isTrack));
    else if (node instanceof YTNodes.PlaylistPanelVideoWrapper && node.primary) {
      tracks.push(...[trackFromPanel(node.primary)].filter(isTrack));
    }
  }
  return tracks;
}

async function upNextRaw(videoId: string): Promise<Track[]> {
  const yt = await getYT();
  return cached(`upnext:${videoId}`, 30 * MIN, async () => {
    const panel = await yt.music.getUpNext(videoId, true);
    return panelTracks(panel.contents);
  });
}

export async function track(videoId: string): Promise<Track> {
  return cached(`track:${videoId}`, 6 * 60 * MIN, () =>
    guard('bài hát', async () => {
      // Danh sách "tiếp theo" chứa đủ nghệ sĩ + album cho bài hiện tại.
      try {
        const list = await upNextRaw(videoId);
        const self = list.find((t) => t.videoId === videoId);
        if (self) return self;
      } catch {
        // Không có danh sách tiếp theo → dùng thông tin cơ bản.
      }
      const yt = await getYT();
      const info = await yt.music.getInfo(videoId);
      const b = info.basic_info;
      if (!b.id || !b.title) throw notFound('Không tìm thấy bài hát.');
      return {
        videoId: b.id,
        title: b.title,
        artists: b.author ? [{ id: b.channel_id, name: b.author }] : [],
        durationSec: b.duration,
        thumbnail: bestThumb(b.thumbnail),
      };
    }),
  );
}

export async function upNext(videoId: string): Promise<Track[]> {
  return guard('danh sách phát tiếp', async () => (await upNextRaw(videoId)).filter((t) => t.videoId !== videoId));
}

export async function lyrics(videoId: string): Promise<Lyrics> {
  const yt = await getYT();
  const result = await cached(`lyrics:${videoId}`, 24 * 60 * MIN, async () => {
    try {
      const shelf = await yt.music.getLyrics(videoId);
      const body = textOf(shelf?.description);
      if (!body) return null;
      return { lines: body.split(/\r?\n/), source: textOf(shelf?.footer) } satisfies Lyrics;
    } catch {
      return null;
    }
  });
  if (!result) throw notFound('Bài này chưa có lời trên YouTube Music.');
  return result;
}

// ---------- Album / Nghệ sĩ / Playlist ----------

export async function album(id: string): Promise<Album> {
  const yt = await getYT();
  return cached(`album:${id}`, 6 * 60 * MIN, () =>
    guard('album', async () => {
      const res = await yt.music.getAlbum(id);
      const h = res.header;
      let summary: AlbumSummary & { subtitle?: string; info?: string };
      if (h instanceof YTNodes.MusicResponsiveHeader) {
        summary = {
          id,
          title: textOf(h.title) ?? '',
          artists: artistsFromText(h.strapline_text_one),
          subtitle: textOf(h.subtitle),
          info: textOf(h.second_subtitle),
          thumbnail: bestThumb(h.thumbnail?.contents),
        };
        if (summary.artists.length === 0 && textOf(h.strapline_text_one)) {
          summary.artists = [{ name: textOf(h.strapline_text_one) ?? '' }];
        }
      } else if (h instanceof YTNodes.MusicDetailHeader) {
        summary = {
          id,
          title: textOf(h.title) ?? '',
          artists: h.author ? [{ id: h.author.channel_id, name: h.author.name }] : [],
          year: h.year,
          subtitle: textOf(h.subtitle),
          info: textOf(h.second_subtitle),
          thumbnail: bestThumb(h.thumbnails),
        };
      } else {
        throw notFound('Không tìm thấy album.');
      }
      summary.year ??= summary.subtitle?.match(/\b(19|20)\d{2}\b/)?.[0];
      const albumRef = { id, name: summary.title };
      const tracks = res.contents
        .map(trackFromListItem)
        .filter(isTrack)
        .map((t) => ({
          ...t,
          artists: t.artists.length > 0 ? t.artists : summary.artists,
          album: albumRef,
          thumbnail: summary.thumbnail ?? t.thumbnail,
        }));
      return { ...summary, tracks };
    }),
  );
}

export async function artist(id: string): Promise<Artist> {
  const yt = await getYT();
  return cached(`artist:${id}`, 6 * 60 * MIN, () =>
    guard('nghệ sĩ', async () => {
      const res = await yt.music.getArtist(id);
      const h = res.header;
      let name = '';
      let description: string | undefined;
      let thumbnail: string | undefined;
      if (h instanceof YTNodes.MusicImmersiveHeader) {
        name = textOf(h.title) ?? '';
        description = textOf(h.description);
        thumbnail = bestThumb(h.thumbnail?.contents, 1080);
      } else if (h instanceof YTNodes.MusicVisualHeader) {
        name = textOf(h.title) ?? '';
        thumbnail = bestThumb(h.thumbnail, 1080);
      } else if (h && 'title' in h) {
        name = textOf(h.title as never) ?? '';
      }
      const shelves = res.sections.map(shelfFromNode).filter((s): s is Shelf => s !== undefined);
      return { id, name, description, thumbnail, shelves };
    }),
  );
}

export async function playlist(id: string): Promise<Playlist> {
  const yt = await getYT();
  return cached(`playlist:${id}`, 60 * MIN, () =>
    guard('playlist', async () => {
      let res = await yt.music.getPlaylist(id);
      let h = res.header;
      if (h instanceof YTNodes.MusicEditablePlaylistDetailHeader) h = h.header as typeof h;
      const summary: PlaylistSummary & { info?: string; description?: string } = { id, title: '' };
      if (h instanceof YTNodes.MusicResponsiveHeader) {
        summary.title = textOf(h.title) ?? '';
        summary.author = textOf(h.strapline_text_one);
        summary.subtitle = textOf(h.subtitle);
        summary.info = textOf(h.second_subtitle);
        summary.thumbnail = bestThumb(h.thumbnail?.contents);
        summary.description = textOf(h.description?.description);
      } else if (h instanceof YTNodes.MusicDetailHeader) {
        summary.title = textOf(h.title) ?? '';
        summary.author = h.author?.name;
        summary.subtitle = textOf(h.subtitle);
        summary.info = textOf(h.second_subtitle);
        summary.thumbnail = bestThumb(h.thumbnails);
        summary.description = textOf(h.description);
      }

      const tracks: Track[] = [];
      const collect = (items: readonly unknown[]) => {
        for (const node of items) {
          if (node instanceof YTNodes.MusicResponsiveListItem) {
            const t = trackFromListItem(node);
            if (t) tracks.push(t);
          }
        }
      };
      collect(res.items);
      // Lấy thêm tối đa 4 trang (khoảng 500 bài) để không quá chậm.
      for (let page = 0; page < 4 && res.has_continuation; page++) {
        res = await res.getContinuation();
        collect(res.items);
      }
      if (!summary.title && tracks.length === 0) throw notFound('Không tìm thấy playlist.');
      return { ...summary, tracks };
    }),
  );
}

// ---------- Trang chủ ----------

export async function home(filter?: string): Promise<HomeFeed> {
  const yt = await getYT();
  return cached(`home:${filter ?? ''}`, 15 * MIN, () =>
    guard('trang chủ', async () => {
      let feed = await yt.music.getHomeFeed();
      const filters = feed.filters;
      if (filter && filters.includes(filter)) feed = await feed.applyFilter(filter);
      const shelves: Shelf[] = [];
      const collect = () => {
        for (const s of feed.sections ?? []) {
          const shelf = shelfFromNode(s);
          if (shelf) shelves.push(shelf);
        }
      };
      collect();
      if (shelves.length < 6 && feed.has_continuation) {
        feed = await feed.getContinuation();
        collect();
      }
      return { filters, activeFilter: filter && filters.includes(filter) ? filter : undefined, shelves };
    }),
  );
}
