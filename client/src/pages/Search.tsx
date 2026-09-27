import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AlbumCard, ArtistCard, CardGrid, CardsSkeleton, PlaylistCard } from '../components/Cards.tsx';
import { Icon } from '../components/Icon.tsx';
import { TrackList, TrackListSkeleton } from '../components/TrackList.tsx';
import { Chip, Cover, EmptyState, ErrorState, PlayButton, SectionTitle } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { artistNames } from '../lib/format.ts';
import { useAsync, useDebounced } from '../lib/hooks.ts';
import { usePlayer } from '../store/player.ts';
import type { SearchAllResult, SearchType, ShelfItem, TopResult } from '../types.ts';

type Tab = SearchType | 'all';
const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'song', label: 'Bài hát' },
  { id: 'album', label: 'Album' },
  { id: 'artist', label: 'Nghệ sĩ' },
  { id: 'playlist', label: 'Playlist' },
];

// ---- Tìm kiếm gần đây (lưu localStorage) ----
const RECENT_KEY = 'gocnhac.recentSearches';
function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}
function saveRecent(q: string): void {
  const list = [q, ...loadRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 12);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

function Highlight({ text, typed }: { text: string; typed: string }) {
  const i = text.toLowerCase().indexOf(typed.toLowerCase());
  if (!typed || i < 0) return <span className="text-muted">{text}</span>;
  return (
    <span>
      <span className="text-muted">{text.slice(0, i)}</span>
      <span className="font-semibold text-ink">{text.slice(i, i + typed.length)}</span>
      <span className="text-muted">{text.slice(i + typed.length)}</span>
    </span>
  );
}

function suggestionLink(item: ShelfItem): { to: string; title: string; sub: string; thumb?: string; round: boolean } | undefined {
  switch (item.kind) {
    case 'artist':
      return { to: `/artist/${item.artist.id}`, title: item.artist.name, sub: 'Nghệ sĩ', thumb: item.artist.thumbnail, round: true };
    case 'album':
      return { to: `/album/${item.album.id}`, title: item.album.title, sub: `Album · ${artistNames(item.album.artists)}`, thumb: item.album.thumbnail, round: false };
    case 'playlist':
      return { to: `/playlist/${item.playlist.id}`, title: item.playlist.title, sub: 'Playlist', thumb: item.playlist.thumbnail, round: false };
    default:
      return undefined;
  }
}

function TopCard({ top }: { top: TopResult }) {
  const playTracks = usePlayer((s) => s.playTracks);
  const base = 'group relative flex flex-col gap-4 rounded-xl bg-s1 p-5 transition-colors hover:bg-s2';
  if (top.kind === 'song') {
    const t = top.track;
    return (
      <div className={base}>
        <Cover src={t.thumbnail} size={96} className="h-24 w-24 shadow-lg" />
        <span className="font-display text-[28px] font-bold leading-tight tracking-tight">{t.title}</span>
        <span className="flex items-center gap-2 text-sm text-muted">
          <span className="rounded-full bg-bg px-2.5 py-1 text-xs font-semibold text-ink">Bài hát</span>
          {artistNames(t.artists)}
        </span>
        <span className="absolute bottom-5 right-5">
          <PlayButton size={52} label={`Phát ${t.title}`} onClick={() => playTracks([t])} />
        </span>
      </div>
    );
  }
  const info =
    top.kind === 'artist'
      ? { to: `/artist/${top.artist.id}`, title: top.artist.name, thumb: top.artist.thumbnail, label: 'Nghệ sĩ', round: true }
      : top.kind === 'album'
        ? { to: `/album/${top.album.id}`, title: top.album.title, thumb: top.album.thumbnail, label: 'Album', round: false }
        : { to: `/playlist/${top.playlist.id}`, title: top.playlist.title, thumb: top.playlist.thumbnail, label: 'Playlist', round: false };
  return (
    <Link to={info.to} className={base}>
      <Cover src={info.thumb} size={96} className="h-24 w-24 shadow-lg" rounded={info.round ? 'rounded-full' : 'rounded-md'} />
      <span className="font-display text-[28px] font-bold leading-tight tracking-tight">{info.title}</span>
      <span className="w-fit rounded-full bg-bg px-2.5 py-1 text-xs font-semibold">{info.label}</span>
    </Link>
  );
}

function AllResults({ result, query }: { result: SearchAllResult; query: string }) {
  const context = { kind: 'Kết quả tìm kiếm', label: `“${query}”` };
  const empty = !result.top && !result.songs.length && !result.albums.length && !result.artists.length && !result.playlists.length;
  if (empty) return <EmptyState icon="search" title="Không tìm thấy kết quả">Thử từ khóa khác hoặc kiểm tra chính tả.</EmptyState>;
  return (
    <div className="flex flex-col gap-9">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {result.top && (
          <section className="flex flex-col gap-3">
            <SectionTitle>Kết quả hàng đầu</SectionTitle>
            <TopCard top={result.top} />
          </section>
        )}
        {result.songs.length > 0 && (
          <section className="flex min-w-0 flex-col gap-3">
            <SectionTitle>Bài hát</SectionTitle>
            <TrackList tracks={result.songs.slice(0, 5)} context={context} compact />
          </section>
        )}
      </div>
      {result.artists.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle>Nghệ sĩ</SectionTitle>
          <CardGrid>{result.artists.slice(0, 6).map((a) => <ArtistCard key={a.id} artist={a} />)}</CardGrid>
        </section>
      )}
      {result.albums.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle>Album</SectionTitle>
          <CardGrid>{result.albums.slice(0, 6).map((a) => <AlbumCard key={a.id} album={a} />)}</CardGrid>
        </section>
      )}
      {result.playlists.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle>Playlist</SectionTitle>
          <CardGrid>{result.playlists.slice(0, 6).map((p) => <PlaylistCard key={p.id} playlist={p} />)}</CardGrid>
        </section>
      )}
    </div>
  );
}

function Results({ query, type }: { query: string; type: Tab }) {
  const { data, error, loading, reload } = useAsync((signal) => api.search(query, type, signal), [query, type]);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !data) return type === 'song' || type === 'all' ? <TrackListSkeleton /> : <CardsSkeleton count={10} round={type === 'artist'} />;
  const context = { kind: 'Kết quả tìm kiếm', label: `“${query}”` };
  const none = <EmptyState icon="search" title="Không tìm thấy kết quả">Thử từ khóa khác hoặc kiểm tra chính tả.</EmptyState>;
  switch (data.type) {
    case 'all':
      return <AllResults result={data.result} query={query} />;
    case 'song':
      return data.items.length ? <TrackList tracks={data.items} context={context} showAlbum /> : none;
    case 'album':
      return data.items.length ? <CardGrid>{data.items.map((a) => <AlbumCard key={a.id} album={a} />)}</CardGrid> : none;
    case 'artist':
      return data.items.length ? <CardGrid>{data.items.map((a) => <ArtistCard key={a.id} artist={a} />)}</CardGrid> : none;
    case 'playlist':
      return data.items.length ? <CardGrid>{data.items.map((p) => <PlaylistCard key={p.id} playlist={p} />)}</CardGrid> : none;
  }
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const committed = params.get('q') ?? '';
  const type = (params.get('type') as Tab | null) ?? 'all';
  const [input, setInput] = useState(committed);
  const [focused, setFocused] = useState(false);
  const [recent, setRecent] = useState(loadRecent);
  const typed = useDebounced(input.trim(), 300);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setInput(committed), [committed]);
  useEffect(() => {
    if (!committed) inputRef.current?.focus();
  }, [committed]);

  // Tự tìm khi ngừng gõ 300ms.
  useEffect(() => {
    if (typed && typed !== committed) setParams({ q: typed, type }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);

  const showSuggestions = focused && typed.length > 0;
  const suggestions = useAsync(
    (signal) => (showSuggestions ? api.suggestions(typed, signal) : Promise.resolve(undefined)),
    [typed, showSuggestions],
  );

  const commit = (q: string) => {
    const query = q.trim();
    if (!query) return;
    saveRecent(query);
    setRecent(loadRecent());
    setInput(query);
    setParams({ q: query, type });
    inputRef.current?.blur();
  };

  const clearRecent = () => {
    localStorage.removeItem(RECENT_KEY);
    setRecent([]);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="relative z-20 max-w-[560px]">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            commit(input);
          }}
          className="flex h-12 items-center gap-3 rounded-full border-2 border-transparent bg-s2 px-4 focus-within:border-ink"
        >
          <Icon name="search" size={20} className="shrink-0 text-muted" />
          <input
            ref={inputRef}
            type="search"
            aria-label="Tìm bài hát, album, nghệ sĩ, playlist"
            placeholder="Bạn muốn nghe gì?"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => window.setTimeout(() => setFocused(false), 150)}
            enterKeyHint="search"
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
          />
          {input && (
            <button type="button" aria-label="Xóa nội dung tìm kiếm" onClick={() => { setInput(''); setParams({}); inputRef.current?.focus(); }} className="-mr-2 flex h-9 w-9 items-center justify-center text-muted hover:text-ink">
              <Icon name="close" size={18} />
            </button>
          )}
        </form>

        {showSuggestions && suggestions.data && (suggestions.data.queries.length > 0 || suggestions.data.items.length > 0) && (
          <div className="absolute inset-x-0 top-14 flex flex-col overflow-hidden rounded-xl border border-s4 bg-s1 py-1.5 shadow-[0_20px_50px_rgba(0,0,0,.6)]">
            <ul aria-label="Gợi ý tìm kiếm">
              {suggestions.data.queries.map((q) => (
                <li key={q} className="flex items-center">
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => commit(q)} className="flex h-11 flex-1 items-center gap-3 px-4 text-left text-[15px] hover:bg-s3">
                    <Icon name="search" size={16} className="shrink-0 text-dim" />
                    <Highlight text={q} typed={typed} />
                  </button>
                  <button type="button" aria-label="Điền gợi ý vào ô tìm kiếm" onMouseDown={(e) => e.preventDefault()} onClick={() => { setInput(q); inputRef.current?.focus(); }} className="flex h-11 w-11 items-center justify-center text-dim hover:text-ink">
                    <Icon name="arrowUpLeft" size={16} />
                  </button>
                </li>
              ))}
            </ul>
            {suggestions.data.items.length > 0 && <div className="mx-4 my-1 h-px bg-s3" />}
            {suggestions.data.items.map((item, i) => {
              const s = suggestionLink(item);
              if (!s) return null;
              return (
                <button key={i} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { saveRecent(s.title); navigate(s.to); }} className="flex items-center gap-3 px-4 py-2 text-left hover:bg-s3">
                  <Cover src={s.thumb} size={40} className="h-10 w-10" rounded={s.round ? 'rounded-full' : 'rounded-md'} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{s.title}</span>
                    <span className="truncate text-xs text-muted">{s.sub}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {committed ? (
        <>
          <div role="tablist" aria-label="Lọc theo loại" className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar md:mx-0 md:px-0">
            {TABS.map((t) => (
              <Chip key={t.id} active={type === t.id} onClick={() => setParams({ q: committed, type: t.id })}>
                {t.label}
              </Chip>
            ))}
          </div>
          <Results query={committed} type={type} />
        </>
      ) : recent.length > 0 ? (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Tìm kiếm gần đây</h2>
            <button type="button" onClick={clearRecent} className="h-9 px-2 text-sm font-semibold text-muted hover:text-ink">
              Xóa tất cả
            </button>
          </div>
          <div className="flex flex-col">
            {recent.map((q) => (
              <div key={q} className="flex items-center rounded-lg hover:bg-s1">
                <button type="button" onClick={() => commit(q)} className="flex h-12 flex-1 items-center gap-3 px-2 text-left">
                  <Icon name="clock" size={18} className="text-dim" />
                  <span className="truncate">{q}</span>
                </button>
                <button
                  type="button"
                  aria-label="Xóa khỏi lịch sử tìm kiếm"
                  onClick={() => {
                    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.filter((x) => x !== q)));
                    setRecent(loadRecent());
                  }}
                  className="flex h-11 w-11 items-center justify-center text-dim hover:text-ink"
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <EmptyState icon="search" title="Tìm bài hát yêu thích">
          Gõ tên bài hát, nghệ sĩ, album hoặc playlist. Kết quả lấy từ YouTube Music.
        </EmptyState>
      )}
    </div>
  );
}
