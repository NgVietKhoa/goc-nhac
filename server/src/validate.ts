import { badRequest } from './errors.ts';
import type { SearchType } from './types.ts';

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
