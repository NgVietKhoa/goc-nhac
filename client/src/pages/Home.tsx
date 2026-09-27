import { useState } from 'react';
import { Link } from 'react-router';
import { CardsSkeleton, ShelfView } from '../components/Cards.tsx';
import { Icon, Logo } from '../components/Icon.tsx';
import { lockApp } from '../components/Navigation.tsx';
import { PlaylistMosaic } from '../components/TrackMenu.tsx';
import { Chip, ErrorState, Skeleton } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { greeting } from '../lib/format.ts';
import { useAsync } from '../lib/hooks.ts';
import { useLibrary } from '../store/library.ts';

function QuickLinks() {
  const playlists = useLibrary((s) => s.playlists);
  const likedCount = useLibrary((s) => s.liked.size);
  const items = [
    { to: '/likes', name: 'Bài hát đã thích', art: <span className="flex h-16 w-16 shrink-0 items-center justify-center bg-gradient-to-br from-[#8a6a2f] to-[#4a3f6b]"><Icon name="heartFill" size={24} /></span>, show: likedCount > 0 },
    ...playlists.slice(0, 5).map((p) => ({ to: `/me/playlist/${p.id}`, name: p.name, art: <PlaylistMosaic covers={p.covers} size={64} className="!rounded-none" />, show: true })),
  ].filter((i) => i.show);
  if (items.length === 0) return null;
  return (
    <section aria-label="Lối tắt" className="grid grid-cols-2 gap-2 lg:grid-cols-3 lg:gap-3">
      {items.slice(0, 6).map((i) => (
        <Link key={i.to} to={i.to} className="flex h-16 items-center gap-3 overflow-hidden rounded-lg bg-s2 pr-3 text-[13px] font-semibold transition-colors hover:bg-s3 md:gap-3.5 md:text-sm">
          {i.art}
          <span className="line-clamp-2">{i.name}</span>
        </Link>
      ))}
    </section>
  );
}

export function HomePage() {
  const [filter, setFilter] = useState<string>();
  const { data, error, loading, reload } = useAsync(() => api.home(filter), [filter]);
  const filters = data?.filters ?? [];

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="md:hidden">
            <Logo size={30} hole="#121110" />
          </span>
          <h1 className="font-display text-[28px] font-bold tracking-tight md:text-[34px]">{greeting()}</h1>
        </div>
        <Link to="/search" className="hidden h-10 items-center gap-2.5 rounded-full bg-s2 px-4 text-sm text-muted hover:text-ink md:flex">
          <Icon name="search" size={18} />
          Bạn muốn nghe gì?
        </Link>
        <button type="button" aria-label="Khóa ứng dụng" onClick={() => void lockApp()} className="flex h-10 w-10 items-center justify-center text-muted md:hidden">
          <Icon name="lock" size={20} />
        </button>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar md:mx-0 md:px-0">
        <Chip active={!filter} onClick={() => setFilter(undefined)}>
          Tất cả
        </Chip>
        {filters.map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(filter === f ? undefined : f)}>
            {f}
          </Chip>
        ))}
        {loading && filters.length === 0 && [1, 2, 3, 4].map((k) => <Skeleton key={k} className="h-9 w-24 shrink-0 rounded-full" />)}
      </div>

      {!filter && <QuickLinks />}

      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && (
        <div className="flex flex-col gap-8">
          {[1, 2].map((k) => (
            <div key={k} className="flex flex-col gap-3">
              <Skeleton className="h-6 w-56 rounded" />
              <CardsSkeleton count={5} />
            </div>
          ))}
        </div>
      )}
      <div className={`flex flex-col gap-9 transition-opacity ${loading && data ? 'opacity-50' : ''}`}>
        {data?.shelves.map((shelf, i) => <ShelfView key={`${shelf.title}-${i}`} shelf={shelf} />)}
      </div>
    </div>
  );
}
