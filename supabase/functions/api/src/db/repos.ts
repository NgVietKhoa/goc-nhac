import type postgres from 'postgres';
import { AppError, notFound } from '../errors.ts';
import type { HistoryEntry, LikedTrack, MyPlaylist, MyPlaylistDetail, Track } from '../types.ts';
import { sql } from './sql.ts';

type Tx = postgres.TransactionSql | postgres.Sql;

interface TrackRow {
  video_id: string;
  title: string;
  artists: Track['artists'];
  album: Track['album'] | null;
  duration_sec: number | null;
  thumbnail: string | null;
}

const toTrack = (r: TrackRow): Track => ({
  videoId: r.video_id,
  title: r.title,
  artists: r.artists,
  album: r.album ?? undefined,
  durationSec: r.duration_sec ?? undefined,
  thumbnail: r.thumbnail ?? undefined,
});

const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : d);

// ---------- Bài hát ----------

export async function upsertTracks(tracks: Track[], db: Tx = sql()): Promise<void> {
  if (tracks.length === 0) return;
  // Bỏ trùng videoId, nếu không ON CONFLICT sẽ lỗi khi cập nhật một dòng hai lần.
  const unique = [...new Map(tracks.map((t) => [t.videoId, t])).values()];
  const rows = unique.map((t) => ({
    video_id: t.videoId,
    title: t.title,
    artists: t.artists,
    album: t.album ?? null,
    duration_sec: t.durationSec ? Math.round(t.durationSec) : null,
    thumbnail: t.thumbnail ?? null,
  }));
  await db`
    insert into goc_nhac.tracks (video_id, title, artists, album, duration_sec, thumbnail)
    select video_id, title, coalesce(artists, '[]'::jsonb), album, duration_sec, thumbnail
    from jsonb_to_recordset(${db.json(rows as unknown as postgres.JSONValue)})
      as x(video_id text, title text, artists jsonb, album jsonb, duration_sec integer, thumbnail text)
    on conflict (video_id) do update set
      title = excluded.title,
      artists = excluded.artists,
      album = coalesce(excluded.album, goc_nhac.tracks.album),
      duration_sec = coalesce(excluded.duration_sec, goc_nhac.tracks.duration_sec),
      thumbnail = coalesce(excluded.thumbnail, goc_nhac.tracks.thumbnail),
      updated_at = now()
  `;
}

// ---------- Playlist ----------

interface PlaylistRow {
  id: string;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
  track_count: number;
  duration_sec: number;
  covers: string[] | null;
}

const toPlaylist = (r: PlaylistRow): MyPlaylist => ({
  id: Number(r.id),
  name: r.name,
  description: r.description ?? undefined,
  trackCount: r.track_count,
  durationSec: r.duration_sec,
  covers: r.covers ?? [],
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

export async function listPlaylists(): Promise<MyPlaylist[]> {
  const rows = await sql()<PlaylistRow[]>`
    select p.id, p.name, p.description, p.created_at, p.updated_at,
      (select count(*)::int from goc_nhac.playlist_tracks pt where pt.playlist_id = p.id) as track_count,
      (select coalesce(sum(t.duration_sec), 0)::int from goc_nhac.playlist_tracks pt
         join goc_nhac.tracks t using (video_id) where pt.playlist_id = p.id) as duration_sec,
      (select array_agg(thumbnail) from (
         select t.thumbnail from goc_nhac.playlist_tracks pt join goc_nhac.tracks t using (video_id)
         where pt.playlist_id = p.id and t.thumbnail is not null order by pt.position limit 4) c) as covers
    from goc_nhac.playlists p
    order by p.updated_at desc
  `;
  return rows.map(toPlaylist);
}

async function getPlaylistRow(id: number): Promise<MyPlaylist> {
  const all = await listPlaylists();
  const found = all.find((p) => p.id === id);
  if (!found) throw notFound('Không tìm thấy playlist.');
  return found;
}

export async function getPlaylist(id: number): Promise<MyPlaylistDetail> {
  const base = await getPlaylistRow(id);
  const rows = await sql()<(TrackRow & { added_at: Date })[]>`
    select t.*, pt.added_at from goc_nhac.playlist_tracks pt
    join goc_nhac.tracks t using (video_id)
    where pt.playlist_id = ${id}
    order by pt.position
  `;
  return { ...base, tracks: rows.map((r) => ({ ...toTrack(r), addedAt: iso(r.added_at) })) };
}

export async function createPlaylist(name: string, description?: string): Promise<MyPlaylist> {
  const [row] = await sql()<{ id: string }[]>`
    insert into goc_nhac.playlists (name, description) values (${name}, ${description ?? null}) returning id
  `;
  return getPlaylistRow(Number(row.id));
}

export async function updatePlaylist(id: number, patch: { name?: string; description?: string | null }): Promise<MyPlaylist> {
  const result = await sql()`
    update goc_nhac.playlists set
      name = coalesce(${patch.name ?? null}, name),
      description = case when ${patch.description !== undefined} then ${patch.description ?? null} else description end,
      updated_at = now()
    where id = ${id}
  `;
  if (result.count === 0) throw notFound('Không tìm thấy playlist.');
  return getPlaylistRow(id);
}

export async function deletePlaylist(id: number): Promise<void> {
  const result = await sql()`delete from goc_nhac.playlists where id = ${id}`;
  if (result.count === 0) throw notFound('Không tìm thấy playlist.');
}

/** Thêm bài vào cuối playlist; bài đã có thì bỏ qua. Trả về số bài được thêm mới. */
export async function addToPlaylist(id: number, tracks: Track[]): Promise<number> {
  return sql().begin(async (tx) => {
    const [pl] = await tx`select id from goc_nhac.playlists where id = ${id} for update`;
    if (!pl) throw notFound('Không tìm thấy playlist.');
    await upsertTracks(tracks, tx);
    const ids = [...new Set(tracks.map((t) => t.videoId))];
    const inserted = await tx`
      insert into goc_nhac.playlist_tracks (playlist_id, video_id, position)
      select ${id}, v.video_id,
        coalesce((select max(position) from goc_nhac.playlist_tracks where playlist_id = ${id}), -1) + v.ord
      from unnest(${ids}::text[]) with ordinality as v(video_id, ord)
      on conflict do nothing
    `;
    await tx`update goc_nhac.playlists set updated_at = now() where id = ${id}`;
    return inserted.count;
  });
}

export async function removeFromPlaylist(id: number, videoId: string): Promise<void> {
  const result = await sql()`
    delete from goc_nhac.playlist_tracks where playlist_id = ${id} and video_id = ${videoId}
  `;
  if (result.count === 0) throw notFound('Bài này không có trong playlist.');
  await sql()`update goc_nhac.playlists set updated_at = now() where id = ${id}`;
}

/** Sắp xếp lại theo thứ tự videoIds gửi lên (phải chứa đúng các bài đang có). */
export async function reorderPlaylist(id: number, videoIds: string[]): Promise<void> {
  await sql().begin(async (tx) => {
    const current = await tx<{ video_id: string }[]>`
      select video_id from goc_nhac.playlist_tracks where playlist_id = ${id} for update
    `;
    const have = new Set(current.map((r) => r.video_id));
    if (have.size !== videoIds.length || !videoIds.every((v) => have.has(v))) {
      throw new AppError('CONFLICT', 'Danh sách bài không khớp với playlist hiện tại, hãy tải lại trang.', 409);
    }
    await tx`
      update goc_nhac.playlist_tracks pt set position = v.ord - 1
      from unnest(${videoIds}::text[]) with ordinality as v(video_id, ord)
      where pt.playlist_id = ${id} and pt.video_id = v.video_id
    `;
    await tx`update goc_nhac.playlists set updated_at = now() where id = ${id}`;
  });
}

// ---------- Yêu thích ----------

export async function listLikes(): Promise<LikedTrack[]> {
  const rows = await sql()<(TrackRow & { liked_at: Date })[]>`
    select t.*, l.liked_at from goc_nhac.likes l join goc_nhac.tracks t using (video_id)
    order by l.liked_at desc
  `;
  return rows.map((r) => ({ ...toTrack(r), likedAt: iso(r.liked_at) }));
}

export async function like(track: Track): Promise<void> {
  await sql().begin(async (tx) => {
    await upsertTracks([track], tx);
    await tx`insert into goc_nhac.likes (video_id) values (${track.videoId}) on conflict do nothing`;
  });
}

export async function unlike(videoId: string): Promise<void> {
  await sql()`delete from goc_nhac.likes where video_id = ${videoId}`;
}

// ---------- Lịch sử ----------

export async function addHistory(track: Track, listenedSec: number): Promise<void> {
  await sql().begin(async (tx) => {
    await upsertTracks([track], tx);
    await tx`insert into goc_nhac.history (video_id, listened_sec) values (${track.videoId}, ${listenedSec})`;
  });
}

export async function listHistory(limit: number, before?: number): Promise<HistoryEntry[]> {
  const rows = await sql()<(TrackRow & { id: string; played_at: Date; listened_sec: number })[]>`
    select h.id, h.played_at, h.listened_sec, t.video_id, t.title, t.artists, t.album, t.duration_sec, t.thumbnail
    from goc_nhac.history h join goc_nhac.tracks t using (video_id)
    where ${before ?? null}::bigint is null or h.id < ${before ?? null}::bigint
    order by h.id desc
    limit ${limit}
  `;
  return rows.map((r) => ({ id: Number(r.id), playedAt: iso(r.played_at), listenedSec: r.listened_sec, track: toTrack(r) }));
}

export async function clearHistory(): Promise<void> {
  await sql()`delete from goc_nhac.history`;
}

// ---------- Cache stream ----------

export interface CachedStream {
  url: string;
  mimeType: string;
  contentLength?: number;
  expiresAt: number;
}

export async function getStreamCache(key: string): Promise<CachedStream | undefined> {
  const [row] = await sql()<{ url: string; mime_type: string; content_length: string | null; expires_at: Date }[]>`
    select url, mime_type, content_length, expires_at from goc_nhac.stream_cache
    where cache_key = ${key} and expires_at > now()
  `;
  if (!row) return undefined;
  return {
    url: row.url,
    mimeType: row.mime_type,
    contentLength: row.content_length === null ? undefined : Number(row.content_length),
    expiresAt: row.expires_at.getTime(),
  };
}

export async function setStreamCache(key: string, value: CachedStream): Promise<void> {
  await sql()`
    insert into goc_nhac.stream_cache (cache_key, url, mime_type, content_length, expires_at)
    values (${key}, ${value.url}, ${value.mimeType}, ${value.contentLength ?? null}, ${new Date(value.expiresAt)})
    on conflict (cache_key) do update set url = excluded.url, mime_type = excluded.mime_type,
      content_length = excluded.content_length, expires_at = excluded.expires_at
  `;
  // Dọn bớt bản ghi hết hạn thỉnh thoảng.
  if (Math.random() < 0.05) await sql()`delete from goc_nhac.stream_cache where expires_at < now()`;
}

export async function deleteStreamCache(key: string): Promise<void> {
  await sql()`delete from goc_nhac.stream_cache where cache_key = ${key}`;
}

// ---------- Rate limit ----------

/** Tăng bộ đếm của bucket trong cửa sổ hiện tại, trả về số lần đã gọi. */
export async function hitRateLimit(bucket: string, windowMs: number): Promise<number> {
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const [row] = await sql()<{ hits: number }[]>`
    insert into goc_nhac.rate_limits (bucket, window_start, hits) values (${bucket}, ${windowStart}, 1)
    on conflict (bucket) do update set
      hits = case when goc_nhac.rate_limits.window_start = excluded.window_start
                  then goc_nhac.rate_limits.hits + 1 else 1 end,
      window_start = excluded.window_start
    returning hits
  `;
  return row.hits;
}
