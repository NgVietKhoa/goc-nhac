import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { currentItem, usePlayer, type PlayContext } from '../store/player.ts';
import { useUi } from '../store/ui.ts';
import type { ArtistRef, Track } from '../types.ts';
import { Icon } from './Icon.tsx';
import { Cover, PlayButton } from './ui.tsx';

/** Header của album / playlist: ảnh bìa, loại, tên, thông tin, các nút hành động. */
export function CollectionHeader({
  kind,
  title,
  artwork,
  cover,
  artists,
  meta,
  description,
}: {
  kind: string;
  title: string;
  artwork?: ReactNode;
  cover?: string;
  artists?: ArtistRef[];
  meta?: string;
  description?: string;
}) {
  return (
    <header className="flex flex-col items-center gap-5 pt-2 text-center md:flex-row md:items-end md:gap-7 md:text-left">
      {artwork ?? <Cover src={cover} size={220} className="h-[200px] w-[200px] shadow-[0_18px_40px_rgba(0,0,0,.5)] md:h-[220px] md:w-[220px]" rounded="rounded-lg" />}
      <div className="flex min-w-0 flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{kind}</span>
        <h1 className="font-display text-3xl font-extrabold leading-[1.05] tracking-tight md:text-5xl">{title}</h1>
        {artists && artists.length > 0 && (
          <span className="text-sm font-semibold">
            {artists.map((a, i) => (
              <span key={`${a.name}-${i}`}>
                {i > 0 && ', '}
                {a.id ? (
                  <Link to={`/artist/${a.id}`} className="hover:underline">
                    {a.name}
                  </Link>
                ) : (
                  a.name
                )}
              </span>
            ))}
          </span>
        )}
        {meta && <span className="text-sm text-muted">{meta}</span>}
        {description && <p className="line-clamp-3 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
    </header>
  );
}

/** Hàng nút: phát / phát ngẫu nhiên / thêm vào playlist / + các nút riêng. */
export function CollectionActions({ tracks, context, children }: { tracks: Track[]; context: PlayContext; children?: ReactNode }) {
  const playTracks = usePlayer((s) => s.playTracks);
  const isThis = usePlayer((s) => s.context?.href !== undefined && s.context.href === context.href && currentItem(s) !== undefined);
  const playing = usePlayer((s) => s.playing);
  const toggle = usePlayer((s) => s.toggle);
  const openAdd = useUi((s) => s.openAddToPlaylist);
  const disabled = tracks.length === 0;

  return (
    <div className="flex items-center justify-center gap-3 md:justify-start">
      <PlayButton
        playing={isThis && playing}
        onClick={() => (isThis ? toggle() : !disabled && playTracks(tracks, 0, context, false))}
      />
      <button
        type="button"
        aria-label="Phát ngẫu nhiên"
        disabled={disabled}
        onClick={() => playTracks(tracks, 0, context, true)}
        className="flex h-12 w-12 items-center justify-center rounded-full text-muted hover:text-ink disabled:opacity-40"
      >
        <Icon name="shuffle" size={24} />
      </button>
      <button
        type="button"
        aria-label="Thêm tất cả vào playlist"
        title="Thêm tất cả vào playlist"
        disabled={disabled}
        onClick={() => openAdd(tracks)}
        className="flex h-12 w-12 items-center justify-center rounded-full text-muted hover:text-ink disabled:opacity-40"
      >
        <Icon name="plus" size={24} />
      </button>
      {children}
    </div>
  );
}

export function HeaderSkeleton() {
  return (
    <div className="flex flex-col items-center gap-5 pt-2 md:flex-row md:items-end md:gap-7" aria-busy="true">
      <span className="skeleton h-[200px] w-[200px] rounded-lg md:h-[220px] md:w-[220px]" />
      <div className="flex w-full max-w-md flex-col items-center gap-3 md:items-start">
        <span className="skeleton h-3 w-20 rounded" />
        <span className="skeleton h-10 w-3/4 rounded" />
        <span className="skeleton h-3 w-1/2 rounded" />
      </div>
    </div>
  );
}
