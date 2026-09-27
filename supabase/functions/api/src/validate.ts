import { badRequest } from './errors.ts';
import type { ArtistRef, SearchType, Track } from './types.ts';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const BROWSE_ID = /^[A-Za-z0-9_-]{2,120}$/;

export function videoId(value: string | undefined): string {
  if (!value || !VIDEO_ID.test(value)) throw badRequest('Mã bài hát không hợp lệ.');
  return value;
}

export function browseId(value: string | undefined): string {
  if (!value || !BROWSE_ID.test(value)) throw badRequest('Mã không hợp lệ.');
  return value;
}

export function query(value: string | undefined, max = 200): string {
  const q = value?.trim() ?? '';
  if (q.length === 0) throw badRequest('Hãy nhập từ khóa tìm kiếm.');
  if (q.length > max) throw badRequest('Từ khóa quá dài.');
  return q;
}

const SEARCH_TYPES = new Set(['song', 'album', 'artist', 'playlist', 'all']);

export function searchType(value: string | undefined): SearchType | 'all' {
  const t = value ?? 'all';
  if (!SEARCH_TYPES.has(t)) throw badRequest('Loại tìm kiếm không hợp lệ.');
  return t as SearchType | 'all';
}

export function positiveInt(value: unknown, name: string): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) throw badRequest(`${name} không hợp lệ.`);
  return n;
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const optString = (x: unknown, max: number): string | undefined =>
  typeof x === 'string' && x.length > 0 ? x.slice(0, max) : undefined;

function artistRef(x: unknown): ArtistRef | undefined {
  if (!isObject(x) || typeof x.name !== 'string' || !x.name) return undefined;
  return { id: optString(x.id, 120), name: x.name.slice(0, 200) };
}

/** Kiểm tra object Track client gửi lên (khi thích / thêm vào playlist / ghi lịch sử). */
export function track(x: unknown): Track {
  if (!isObject(x)) throw badRequest('Thiếu thông tin bài hát.');
  const id = videoId(typeof x.videoId === 'string' ? x.videoId : undefined);
  if (typeof x.title !== 'string' || !x.title.trim()) throw badRequest('Thiếu tên bài hát.');
  const artists = Array.isArray(x.artists) ? x.artists.map(artistRef).filter((a): a is ArtistRef => !!a).slice(0, 20) : [];
  const album = isObject(x.album) && typeof x.album.name === 'string'
    ? { id: optString(x.album.id, 120), name: x.album.name.slice(0, 200) }
    : undefined;
  const duration = typeof x.durationSec === 'number' && x.durationSec > 0 && x.durationSec < 86_400 ? Math.round(x.durationSec) : undefined;
  const thumbnail = optString(x.thumbnail, 1000);
  return {
    videoId: id,
    title: x.title.slice(0, 300),
    artists,
    album,
    durationSec: duration,
    thumbnail: thumbnail && /^https:\/\//.test(thumbnail) ? thumbnail : undefined,
  };
}

export function trackList(x: unknown): Track[] {
  if (!Array.isArray(x) || x.length === 0) throw badRequest('Danh sách bài hát trống.');
  if (x.length > 500) throw badRequest('Tối đa 500 bài mỗi lần.');
  return x.map(track);
}

export function playlistName(x: unknown): string {
  if (typeof x !== 'string' || !x.trim()) throw badRequest('Tên playlist không được để trống.');
  const name = x.trim();
  if (name.length > 100) throw badRequest('Tên playlist tối đa 100 ký tự.');
  return name;
}
