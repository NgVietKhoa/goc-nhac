import { Link } from 'react-router';
import { api } from '../lib/api.ts';
import { artistNames } from '../lib/format.ts';
import { usePlayer } from '../store/player.ts';
import { toastError } from '../store/toast.ts';
import type { AlbumSummary, ArtistSummary, PlaylistSummary, Shelf, ShelfItem, Track } from '../types.ts';
import { Icon } from './Icon.tsx';
import { openTrackMenu } from './TrackList.tsx';
import { Cover, SectionTitle, Skeleton } from './ui.tsx';

function HoverPlay({ onPlay, label }: { onPlay(): void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onPlay();
      }}
      className="absolute bottom-2 right-2 flex h-11 w-11 translate-y-2 items-center justify-center rounded-full bg-accent text-accent-ink opacity-0 shadow-xl transition-all group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100"
    >
      <Icon name="play" size={20} />
    </button>
  );
}

async function playAlbum(id: string, title: string) {
  try {
    const album = await api.album(id);
    usePlayer.getState().playTracks(album.tracks, 0, { kind: 'Đang phát từ album', label: title, href: `/album/${id}` });
  } catch (err) {
    toastError(err);
  }
}

async function playPlaylist(id: string, title: string) {
  try {
    const pl = await api.playlist(id);
    usePlayer.getState().playTracks(pl.tracks, 0, { kind: 'Đang phát từ playlist', label: title, href: `/playlist/${id}` });
  } catch (err) {
    toastError(err);
  }
}

export function AlbumCard({ album }: { album: AlbumSummary }) {
  return (
    <Link to={`/album/${album.id}`} className="group flex min-w-0 flex-col gap-1.5 rounded-xl p-2 transition-colors hover:bg-s1">
      <span className="relative block">
        <Cover src={album.thumbnail} size={180} className="aspect-square w-full" rounded="rounded-lg" icon="album" />
        <HoverPlay label={`Phát ${album.title}`} onPlay={() => void playAlbum(album.id, album.title)} />
      </span>
      <span className="mt-1 truncate text-sm font-semibold">{album.title}</span>
      <span className="truncate text-xs leading-snug text-muted">
        {[album.year, artistNames(album.artists)].filter(Boolean).join(' · ') || 'Album'}
      </span>
    </Link>
  );
}

export function PlaylistCard({ playlist }: { playlist: PlaylistSummary }) {
  return (
    <Link to={`/playlist/${playlist.id}`} className="group flex min-w-0 flex-col gap-1.5 rounded-xl p-2 transition-colors hover:bg-s1">
      <span className="relative block">
        <Cover src={playlist.thumbnail} size={180} className="aspect-square w-full" rounded="rounded-lg" />
        <HoverPlay label={`Phát ${playlist.title}`} onPlay={() => void playPlaylist(playlist.id, playlist.title)} />
      </span>
      <span className="mt-1 line-clamp-2 text-sm font-semibold">{playlist.title}</span>
      <span className="line-clamp-2 text-xs leading-snug text-muted">{playlist.subtitle ?? playlist.author ?? 'Playlist'}</span>
    </Link>
  );
}

export function ArtistCard({ artist }: { artist: ArtistSummary }) {
  return (
    <Link to={`/artist/${artist.id}`} className="group flex min-w-0 flex-col items-center gap-2 rounded-xl p-2 text-center transition-colors hover:bg-s1">
      <Cover src={artist.thumbnail} size={160} className="aspect-square w-full" rounded="rounded-full" icon="user" />
      <span className="mt-1 w-full truncate text-sm font-semibold">{artist.name}</span>
      <span className="w-full truncate text-xs text-muted">Nghệ sĩ</span>
    </Link>
  );
}

export function SongCard({ track, onPlay }: { track: Track; onPlay(): void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPlay}
      onKeyDown={(e) => e.key === 'Enter' && onPlay()}
      onContextMenu={(e) => openTrackMenu(e, track)}
      className="group flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-xl p-2 text-left transition-colors hover:bg-s1"
    >
      <span className="relative block">
        <Cover src={track.thumbnail} size={180} className="aspect-square w-full" rounded="rounded-lg" />
        <HoverPlay label={`Phát ${track.title}`} onPlay={onPlay} />
      </span>
      <span className="mt-1 truncate text-sm font-semibold">{track.title}</span>
      <span className="truncate text-xs text-muted">{artistNames(track.artists)}</span>
    </div>
  );
}

/** Hàng bài hát gọn dạng lưới (kiểu "Chọn nhanh"). */
function QuickSong({ track, onPlay }: { track: Track; onPlay(): void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPlay}
      onKeyDown={(e) => e.key === 'Enter' && onPlay()}
      onContextMenu={(e) => openTrackMenu(e, track)}
      className="group flex min-w-0 cursor-pointer items-center gap-3 rounded-lg p-1.5 hover:bg-s1"
    >
      <span className="relative shrink-0">
        <Cover src={track.thumbnail} size={48} className="h-12 w-12" />
        <span className="absolute inset-0 hidden items-center justify-center rounded-md bg-black/50 group-hover:flex">
          <Icon name="play" size={18} />
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{track.title}</span>
        <span className="truncate text-xs text-muted">{artistNames(track.artists)}</span>
      </span>
      <button
        type="button"
        aria-label="Tùy chọn khác"
        onClick={(e) => openTrackMenu(e, track)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted opacity-0 hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Icon name="more" size={18} />
      </button>
    </div>
  );
}

export function ShelfItemCard({ item, onPlaySong }: { item: ShelfItem; onPlaySong(): void }) {
  switch (item.kind) {
    case 'song':
      return <SongCard track={item.track} onPlay={onPlaySong} />;
    case 'album':
      return <AlbumCard album={item.album} />;
    case 'artist':
      return <ArtistCard artist={item.artist} />;
    case 'playlist':
      return <PlaylistCard playlist={item.playlist} />;
  }
}

/** Một hàng nội dung: bài hát → lưới danh sách gọn; còn lại → thẻ cuộn ngang. */
export function ShelfView({ shelf, action }: { shelf: Shelf; action?: React.ReactNode }) {
  const songs = shelf.items.flatMap((i) => (i.kind === 'song' ? [i.track] : []));
  const allSongs = songs.length === shelf.items.length;
  const context = { kind: 'Đang phát', label: shelf.title };
  const playSong = (track: Track) => {
    const start = songs.indexOf(track);
    usePlayer.getState().playTracks(songs, Math.max(0, start), context);
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="px-2">
        {shelf.subtitle && <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{shelf.subtitle}</span>}
        <SectionTitle action={action}>{shelf.title}</SectionTitle>
      </div>
      {allSongs && songs.length > 6 ? (
        <div className="grid grid-flow-col grid-rows-4 gap-x-4 overflow-x-auto no-scrollbar [grid-auto-columns:minmax(260px,1fr)] lg:[grid-auto-columns:minmax(300px,1fr)]">
          {songs.map((t) => (
            <QuickSong key={t.videoId} track={t} onPlay={() => playSong(t)} />
          ))}
        </div>
      ) : (
        <div className="-mx-2 flex gap-1 overflow-x-auto px-2 pb-1 no-scrollbar">
          {shelf.items.map((item, i) => (
            <div key={i} className="w-[150px] shrink-0 md:w-[176px]">
              <ShelfItemCard item={item} onPlaySong={() => item.kind === 'song' && playSong(item.track)} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">{children}</div>;
}

export function CardsSkeleton({ count = 6, round = false }: { count?: number; round?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-[repeat(auto-fill,minmax(160px,1fr))]" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 p-2">
          <Skeleton className={`aspect-square w-full ${round ? 'rounded-full' : 'rounded-lg'}`} />
          <Skeleton className="h-3 w-3/4 rounded" />
          <Skeleton className="h-2.5 w-1/2 rounded" />
        </div>
      ))}
    </div>
  );
}
