import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { CollectionActions, CollectionHeader, HeaderSkeleton } from '../components/CollectionHeader.tsx';
import { Icon } from '../components/Icon.tsx';
import { TrackList, TrackListSkeleton } from '../components/TrackList.tsx';
import { PlaylistMosaic } from '../components/TrackMenu.tsx';
import { EmptyState, ErrorState } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { dayLabel, formatDate, formatTotal } from '../lib/format.ts';
import { useAsync } from '../lib/hooks.ts';
import { useLibrary } from '../store/library.ts';
import { usePlayer } from '../store/player.ts';
import { toast, toastError } from '../store/toast.ts';
import type { HistoryEntry, MyPlaylistDetail } from '../types.ts';

// ---------- Bài hát đã thích ----------

export function LikesPage() {
  const version = useLibrary((s) => s.version);
  const liked = useLibrary((s) => s.liked);
  const { data, error, loading, reload } = useAsync(() => api.likes(), [version]);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  // Ẩn ngay bài vừa bỏ thích mà không chờ tải lại.
  const tracks = (data ?? []).filter((t) => liked.has(t.videoId));
  const context = { kind: 'Đang phát từ', label: 'Bài hát đã thích', href: '/likes' };
  const total = tracks.reduce((s, t) => s + (t.durationSec ?? 0), 0);
  return (
    <div className="flex flex-col gap-7">
      <CollectionHeader
        kind="Playlist"
        title="Bài hát đã thích"
        artwork={
          <span className="flex h-[200px] w-[200px] shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#8a6a2f] via-[#6b3f5e] to-[#3d5a6c] shadow-[0_18px_40px_rgba(0,0,0,.5)] md:h-[220px] md:w-[220px]">
            <Icon name="heartFill" size={72} />
          </span>
        }
        meta={loading && !data ? 'Đang tải…' : [`${tracks.length} bài`, total ? formatTotal(total) : ''].filter(Boolean).join(' · ')}
      />
      <CollectionActions tracks={tracks} context={context} />
      {loading && !data ? (
        <TrackListSkeleton />
      ) : tracks.length === 0 ? (
        <EmptyState icon="heart" title="Chưa có bài hát nào">
          Bấm vào hình trái tim (hoặc phím L) để lưu bài bạn thích vào đây.
        </EmptyState>
      ) : (
        <TrackList tracks={tracks.map((t) => ({ ...t, addedAt: t.likedAt }))} context={context} showAlbum showAdded />
      )}
    </div>
  );
}

// ---------- Playlist của tôi ----------

export function MyPlaylistPage() {
  const { id: rawId = '' } = useParams();
  const id = Number(rawId);
  const navigate = useNavigate();
  const version = useLibrary((s) => s.version);
  const { data, error, loading, reload, setData } = useAsync(() => api.myPlaylist(id), [id, version]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) {
    return (
      <div className="flex flex-col gap-8">
        <HeaderSkeleton />
        <TrackListSkeleton />
      </div>
    );
  }
  if (!data) return null;
  const context = { kind: 'Đang phát từ playlist', label: data.name, href: `/me/playlist/${id}` };

  const rename = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = name.trim();
    setEditing(false);
    if (!next || next === data.name) return;
    try {
      await api.updatePlaylist(id, { name: next });
      setData((d) => d && { ...d, name: next });
      await useLibrary.getState().refreshPlaylists();
    } catch (err) {
      toastError(err);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Xóa playlist “${data.name}”? Không thể hoàn tác.`)) return;
    try {
      await api.deletePlaylist(id);
      await useLibrary.getState().refreshPlaylists();
      toast.info(`Đã xóa playlist “${data.name}”`);
      navigate('/library');
    } catch (err) {
      toastError(err);
    }
  };

  const reorder = async (videoIds: string[]) => {
    const before = data;
    const byId = new Map(data.tracks.map((t) => [t.videoId, t]));
    const tracks = videoIds.map((v) => byId.get(v)).filter((t): t is MyPlaylistDetail['tracks'][number] => !!t);
    setData((d) => d && { ...d, tracks, covers: tracks.slice(0, 4).flatMap((t) => (t.thumbnail ? [t.thumbnail] : [])) });
    try {
      await api.reorderPlaylist(id, videoIds);
      void useLibrary.getState().refreshPlaylists();
    } catch (err) {
      setData(() => before);
      toastError(err);
    }
  };

  return (
    <div className="flex flex-col gap-7">
      <CollectionHeader
        kind="Playlist của tôi"
        title={data.name}
        artwork={<PlaylistMosaic covers={data.covers} size={220} className="!h-[200px] !w-[200px] shadow-[0_18px_40px_rgba(0,0,0,.5)] md:!h-[220px] md:!w-[220px]" />}
        meta={[`${data.trackCount} bài`, data.durationSec ? formatTotal(data.durationSec) : '', `Tạo ngày ${formatDate(data.createdAt)}`].filter(Boolean).join(' · ')}
        description={data.description}
      />
      {editing ? (
        <form onSubmit={rename} className="flex max-w-md gap-2">
          <label htmlFor="rename" className="sr-only">
            Tên playlist
          </label>
          <input
            id="rename"
            autoFocus
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
            className="h-11 min-w-0 flex-1 rounded-lg border border-s4 bg-bg px-3 text-[15px] outline-none focus:border-accent"
          />
          <button type="submit" className="h-11 rounded-lg bg-accent px-4 text-sm font-bold text-accent-ink">
            Lưu
          </button>
          <button type="button" onClick={() => setEditing(false)} className="h-11 rounded-lg px-3 text-sm font-semibold text-muted hover:text-ink">
            Hủy
          </button>
        </form>
      ) : (
        <CollectionActions tracks={data.tracks} context={context}>
          <button
            type="button"
            aria-label="Đổi tên playlist"
            title="Đổi tên playlist"
            onClick={() => {
              setName(data.name);
              setEditing(true);
            }}
            className="flex h-12 w-12 items-center justify-center rounded-full text-muted hover:text-ink"
          >
            <Icon name="pencil" size={22} />
          </button>
          <button type="button" aria-label="Xóa playlist" title="Xóa playlist" onClick={() => void remove()} className="flex h-12 w-12 items-center justify-center rounded-full text-muted hover:text-danger">
            <Icon name="trash" size={22} />
          </button>
        </CollectionActions>
      )}
      {data.tracks.length === 0 ? (
        <EmptyState icon="music" title="Playlist còn trống">
          Tìm bài hát rồi chọn “Thêm vào playlist” trong menu “…” hoặc chuột phải.
        </EmptyState>
      ) : (
        <TrackList tracks={data.tracks} context={context} showAlbum showAdded playlistId={id} onReorder={(ids) => void reorder(ids)} />
      )}
    </div>
  );
}

// ---------- Thư viện: playlist + lịch sử ----------

function CreatePlaylistForm({ autoFocus }: { autoFocus: boolean }) {
  const [name, setName] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        const created = await useLibrary.getState().createPlaylist(name.trim());
        setName('');
        if (created) navigate(`/me/playlist/${created.id}`);
      }}
      className="flex max-w-md gap-2"
    >
      <label htmlFor="create-playlist" className="sr-only">
        Tên playlist mới
      </label>
      <input
        id="create-playlist"
        ref={ref}
        value={name}
        maxLength={100}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tên playlist mới…"
        className="h-11 min-w-0 flex-1 rounded-lg border border-s4 bg-bg px-3 text-[15px] outline-none placeholder:text-dim focus:border-accent"
      />
      <button type="submit" disabled={!name.trim()} className="flex h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-bold text-accent-ink disabled:opacity-40">
        <Icon name="plus" size={18} /> Tạo
      </button>
    </form>
  );
}

function History() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [done, setDone] = useState(false);
  const { error, loading, reload } = useAsync(async () => {
    const first = await api.history();
    setEntries(first);
    setDone(first.length < 50);
    return first;
  }, []);
  const playTracks = usePlayer((s) => s.playTracks);

  const more = async () => {
    try {
      const next = await api.history(entries[entries.length - 1]?.id);
      setEntries((e) => [...e, ...next]);
      setDone(next.length < 50);
    } catch (err) {
      toastError(err);
    }
  };

  const clear = async () => {
    if (!window.confirm('Xóa toàn bộ lịch sử nghe?')) return;
    try {
      await api.clearHistory();
      setEntries([]);
    } catch (err) {
      toastError(err);
    }
  };

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && entries.length === 0) return <TrackListSkeleton rows={6} />;
  if (entries.length === 0) {
    return (
      <EmptyState icon="clock" title="Chưa có lịch sử nghe">
        Bài bạn nghe quá 30 giây sẽ được ghi lại ở đây.
      </EmptyState>
    );
  }

  const groups: { label: string; items: HistoryEntry[] }[] = [];
  for (const e of entries) {
    const label = dayLabel(e.playedAt);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(e);
    else groups.push({ label, items: [e] });
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.label} className="flex flex-col gap-2">
          <h3 className="px-2 text-sm font-semibold capitalize text-muted">{g.label}</h3>
          <TrackList
            tracks={g.items.map((e) => e.track)}
            context={{ kind: 'Đang phát từ', label: 'Lịch sử nghe' }}
          />
        </section>
      ))}
      <div className="flex gap-3">
        {!done && (
          <button type="button" onClick={() => void more()} className="h-10 rounded-full border border-s4 px-4 text-sm font-semibold hover:border-ink">
            Xem thêm
          </button>
        )}
        <button
          type="button"
          onClick={() => playTracks(entries.map((e) => e.track), 0, { kind: 'Đang phát từ', label: 'Lịch sử nghe' })}
          className="h-10 rounded-full px-4 text-sm font-semibold text-muted hover:text-ink"
        >
          Phát lại tất cả
        </button>
        <button type="button" onClick={() => void clear()} className="h-10 rounded-full px-4 text-sm font-semibold text-muted hover:text-danger">
          Xóa lịch sử
        </button>
      </div>
    </div>
  );
}

export function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'lich-su' ? 'history' : 'playlists';
  const playlists = useLibrary((s) => s.playlists);
  const loaded = useLibrary((s) => s.playlistsLoaded);
  const likedCount = useLibrary((s) => s.liked.size);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-[28px] font-bold tracking-tight md:text-[34px]">Thư viện</h1>
      <div role="tablist" className="flex gap-2">
        {[
          { id: 'playlists', label: 'Playlist' },
          { id: 'history', label: 'Lịch sử nghe' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setParams(t.id === 'history' ? { tab: 'lich-su' } : {})}
            className={`h-9 rounded-full px-4 text-sm font-medium ${tab === t.id ? 'bg-ink text-bg' : 'bg-s2 hover:bg-s3'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'history' ? (
        <History />
      ) : (
        <div className="flex flex-col gap-5">
          <CreatePlaylistForm autoFocus={params.get('tao') === '1'} />
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
            <Link to="/likes" className="flex flex-col gap-1.5 rounded-xl p-2 hover:bg-s1">
              <span className="flex aspect-square w-full items-center justify-center rounded-lg bg-gradient-to-br from-[#8a6a2f] via-[#6b3f5e] to-[#3d5a6c]">
                <Icon name="heartFill" size={48} />
              </span>
              <span className="mt-1 text-sm font-semibold">Bài hát đã thích</span>
              <span className="text-xs text-muted">{likedCount} bài</span>
            </Link>
            {playlists.map((p) => (
              <Link key={p.id} to={`/me/playlist/${p.id}`} className="flex min-w-0 flex-col gap-1.5 rounded-xl p-2 hover:bg-s1">
                <PlaylistMosaic covers={p.covers} size={200} className="!aspect-square !h-auto !w-full rounded-lg" />
                <span className="mt-1 truncate text-sm font-semibold">{p.name}</span>
                <span className="text-xs text-muted">
                  {p.trackCount} bài{p.durationSec ? ` · ${formatTotal(p.durationSec)}` : ''}
                </span>
              </Link>
            ))}
          </div>
          {loaded && playlists.length === 0 && <p className="text-sm text-muted">Bạn chưa tạo playlist nào. Đặt tên ở ô phía trên để bắt đầu.</p>}
        </div>
      )}
    </div>
  );
}
