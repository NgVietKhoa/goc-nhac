import { useNavigate, useParams } from 'react-router';
import { ShelfView } from '../components/Cards.tsx';
import { CollectionActions, CollectionHeader, HeaderSkeleton } from '../components/CollectionHeader.tsx';
import { Icon } from '../components/Icon.tsx';
import { TrackList, TrackListSkeleton } from '../components/TrackList.tsx';
import { ErrorState, PlayButton, Skeleton } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { formatTotal, img } from '../lib/format.ts';
import { useAsync } from '../lib/hooks.ts';
import { useLibrary } from '../store/library.ts';
import { usePlayer } from '../store/player.ts';
import { toastError } from '../store/toast.ts';

export function AlbumPage() {
  const { id = '' } = useParams();
  const { data, error, loading, reload } = useAsync(() => api.album(id), [id]);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !data) {
    return (
      <div className="flex flex-col gap-8">
        <HeaderSkeleton />
        <TrackListSkeleton />
      </div>
    );
  }
  const total = data.tracks.reduce((sum, t) => sum + (t.durationSec ?? 0), 0);
  const kind = data.subtitle?.split('•')[0]?.trim() || 'Album';
  const context = { kind: 'Đang phát từ album', label: data.title, href: `/album/${id}` };
  return (
    <div className="flex flex-col gap-7">
      <CollectionHeader
        kind={kind}
        title={data.title}
        cover={data.thumbnail}
        artists={data.artists}
        meta={[data.year, `${data.tracks.length} bài`, total ? formatTotal(total) : ''].filter(Boolean).join(' · ')}
      />
      <CollectionActions tracks={data.tracks} context={context} />
      <TrackList tracks={data.tracks} context={context} numbered showAlbum={false} />
    </div>
  );
}

export function ArtistPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useAsync(() => api.artist(id), [id]);
  const playTracks = usePlayer((s) => s.playTracks);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !data) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-[260px] w-full rounded-2xl" />
        <TrackListSkeleton rows={5} />
      </div>
    );
  }
  const top = data.shelves[0];
  const topSongs = top?.items.flatMap((i) => (i.kind === 'song' ? [i.track] : [])) ?? [];
  const context = { kind: 'Đang phát từ nghệ sĩ', label: data.name, href: `/artist/${id}` };

  const playAll = async (shuffle: boolean) => {
    try {
      // "Bài hát hàng đầu" có playlist đầy đủ → phát cả playlist.
      const tracks = top?.morePlaylistId ? (await api.playlist(top.morePlaylistId)).tracks : topSongs;
      playTracks(tracks.length ? tracks : topSongs, 0, context, shuffle);
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="relative -mx-4 -mt-4 flex min-h-[260px] flex-col justify-end gap-3 overflow-hidden bg-s2 px-4 pb-6 md:-mx-8 md:-mt-7 md:min-h-[320px] md:px-8">
        {data.thumbnail && (
          <img src={img(data.thumbnail, 1080)} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover object-[center_30%]" />
        )}
        <span className="absolute inset-0 bg-gradient-to-b from-bg/10 to-bg/95" aria-hidden="true" />
        <span className="relative text-xs font-semibold uppercase tracking-[0.08em] text-ink/80">Nghệ sĩ</span>
        <h1 className="relative font-display text-4xl font-extrabold tracking-tight md:text-6xl">{data.name}</h1>
        {data.description && <p className="relative line-clamp-2 max-w-2xl text-sm text-ink/80">{data.description}</p>}
      </header>
      <div className="flex items-center gap-3">
        <PlayButton label={`Phát nhạc của ${data.name}`} onClick={() => void playAll(false)} />
        <button type="button" aria-label="Phát ngẫu nhiên" onClick={() => void playAll(true)} className="flex h-12 w-12 items-center justify-center text-muted hover:text-ink">
          <Icon name="shuffle" size={24} />
        </button>
        {topSongs[0] && (
          <button
            type="button"
            onClick={async () => {
              try {
                const related = await api.upNext(topSongs[0].videoId);
                playTracks([topSongs[0], ...related], 0, { kind: 'Đang phát radio', label: data.name });
              } catch (err) {
                toastError(err);
              }
            }}
            className="flex h-10 items-center gap-2 rounded-full border border-s4 px-4 text-sm font-semibold hover:border-ink"
          >
            <Icon name="radio" size={18} /> Radio
          </button>
        )}
      </div>
      {top && topSongs.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-[22px] font-bold">{top.title}</h2>
          <TrackList tracks={topSongs} context={context} showAlbum={false} />
          {top.morePlaylistId && (
            <button type="button" onClick={() => navigate(`/playlist/${top.morePlaylistId}`)} className="w-fit px-2 text-sm font-semibold text-muted hover:text-ink">
              Xem tất cả
            </button>
          )}
        </section>
      )}
      {data.shelves.slice(topSongs.length > 0 ? 1 : 0).map((shelf, i) => (
        <ShelfView key={`${shelf.title}-${i}`} shelf={shelf} />
      ))}
    </div>
  );
}

export function YtPlaylistPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useAsync(() => api.playlist(id), [id]);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !data) {
    return (
      <div className="flex flex-col gap-8">
        <HeaderSkeleton />
        <TrackListSkeleton />
      </div>
    );
  }
  const context = { kind: 'Đang phát từ playlist', label: data.title, href: `/playlist/${id}` };
  const save = async () => {
    const created = useLibrary.getState().createPlaylist(data.title, data.tracks.slice(0, 500));
    navigate(`/me/playlist/${created.id}`);
  };
  return (
    <div className="flex flex-col gap-7">
      <CollectionHeader
        kind="Playlist"
        title={data.title}
        cover={data.thumbnail}
        meta={[data.author, data.info ?? `${data.tracks.length} bài`].filter(Boolean).join(' · ')}
        description={data.description}
      />
      <CollectionActions tracks={data.tracks} context={context}>
        <button
          type="button"
          onClick={() => void save()}
          disabled={data.tracks.length === 0}
          className="flex h-10 items-center gap-2 rounded-full border border-s4 px-4 text-sm font-semibold hover:border-ink disabled:opacity-40"
        >
          <Icon name="save" size={18} /> Lưu vào thư viện
        </button>
      </CollectionActions>
      <TrackList tracks={data.tracks} context={context} showAlbum />
    </div>
  );
}
