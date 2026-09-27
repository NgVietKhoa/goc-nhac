import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { CollectionActions, CollectionHeader } from '../components/CollectionHeader.tsx';
import { Icon } from '../components/Icon.tsx';
import { TrackList } from '../components/TrackList.tsx';
import { PlaylistMosaic } from '../components/TrackMenu.tsx';
import { EmptyState } from '../components/ui.tsx';
import { dayLabel, formatDate, formatTotal } from '../lib/format.ts';
import { useLibrary, usePlaylistDetail, usePlaylists } from '../store/library.ts';
import { usePlayer } from '../store/player.ts';
import { toast, toastError } from '../store/toast.ts';
import type { HistoryEntry } from '../types.ts';

// ---------- Bài hát đã thích ----------

export function LikesPage() {
  const likes = useLibrary((s) => s.likes);
  const context = { kind: 'Đang phát từ', label: 'Bài hát đã thích', href: '/likes' };
  const total = likes.reduce((s, t) => s + (t.durationSec ?? 0), 0);
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
        meta={[`${likes.length} bài`, total ? formatTotal(total) : ''].filter(Boolean).join(' · ')}
      />
      <CollectionActions tracks={likes} context={context} />
      {likes.length === 0 ? (
        <EmptyState icon="heart" title="Chưa có bài hát nào">
          Bấm vào hình trái tim (hoặc phím L) để lưu bài bạn thích vào đây.
        </EmptyState>
      ) : (
        <TrackList tracks={likes.map((t) => ({ ...t, addedAt: t.likedAt }))} context={context} showAlbum showAdded />
      )}
    </div>
  );
}

// ---------- Playlist của tôi ----------

export function MyPlaylistPage() {
  const { id: rawId = '' } = useParams();
  const id = Number(rawId);
  const navigate = useNavigate();
  const data = usePlaylistDetail(id);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  if (!data) return <EmptyState icon="music" title="Không tìm thấy playlist">Playlist có thể đã bị xóa.</EmptyState>;
  const context = { kind: 'Đang phát từ playlist', label: data.name, href: `/me/playlist/${id}` };

  const rename = (e: React.FormEvent) => {
    e.preventDefault();
    const next = name.trim();
    setEditing(false);
    if (next && next !== data.name) useLibrary.getState().renamePlaylist(id, next);
  };

  const remove = () => {
    if (!window.confirm(`Xóa playlist “${data.name}”? Không thể hoàn tác.`)) return;
    useLibrary.getState().deletePlaylist(id);
    toast.info(`Đã xóa playlist “${data.name}”`);
    navigate('/library');
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
          <button type="button" aria-label="Xóa playlist" title="Xóa playlist" onClick={remove} className="flex h-12 w-12 items-center justify-center rounded-full text-muted hover:text-danger">
            <Icon name="trash" size={22} />
          </button>
        </CollectionActions>
      )}
      {data.tracks.length === 0 ? (
        <EmptyState icon="music" title="Playlist còn trống">
          Tìm bài hát rồi chọn “Thêm vào playlist” trong menu “…” hoặc chuột phải.
        </EmptyState>
      ) : (
        <TrackList
          tracks={data.tracks}
          context={context}
          showAlbum
          showAdded
          playlistId={id}
          onReorder={(ids) => useLibrary.getState().reorderPlaylist(id, ids)}
        />
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
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        const created = useLibrary.getState().createPlaylist(name.trim());
        setName('');
        navigate(`/me/playlist/${created.id}`);
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

const PAGE = 50;

function History() {
  const history = useLibrary((s) => s.history);
  const [shown, setShown] = useState(PAGE);
  const playTracks = usePlayer((s) => s.playTracks);
  const entries = history.slice(0, shown);

  if (history.length === 0) {
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
          <TrackList tracks={g.items.map((e) => e.track)} context={{ kind: 'Đang phát từ', label: 'Lịch sử nghe' }} />
        </section>
      ))}
      <div className="flex flex-wrap gap-3">
        {shown < history.length && (
          <button type="button" onClick={() => setShown((n) => n + PAGE)} className="h-10 rounded-full border border-s4 px-4 text-sm font-semibold hover:border-ink">
            Xem thêm
          </button>
        )}
        <button
          type="button"
          onClick={() => playTracks(history.map((e) => e.track), 0, { kind: 'Đang phát từ', label: 'Lịch sử nghe' })}
          className="h-10 rounded-full px-4 text-sm font-semibold text-muted hover:text-ink"
        >
          Phát lại tất cả
        </button>
        <button
          type="button"
          onClick={() => window.confirm('Xóa toàn bộ lịch sử nghe?') && useLibrary.getState().clearHistory()}
          className="h-10 rounded-full px-4 text-sm font-semibold text-muted hover:text-danger"
        >
          Xóa lịch sử
        </button>
      </div>
    </div>
  );
}

/** Sao lưu / khôi phục vì dữ liệu chỉ nằm trong trình duyệt này. */
function Backup() {
  const fileRef = useRef<HTMLInputElement>(null);

  const exportFile = () => {
    const blob = new Blob([useLibrary.getState().exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `goc-nhac-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File) => {
    if (!window.confirm('Khôi phục sẽ THAY THẾ toàn bộ playlist, bài đã thích và lịch sử hiện tại. Tiếp tục?')) return;
    try {
      useLibrary.getState().importData(await file.text());
      toast.info('Đã khôi phục dữ liệu từ file sao lưu');
    } catch (err) {
      toastError(err, 'File sao lưu không hợp lệ.');
    }
  };

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-line-strong bg-s1 p-4">
      <span className="text-sm font-semibold">Sao lưu dữ liệu</span>
      <span className="text-xs leading-relaxed text-muted">
        Playlist, bài đã thích và lịch sử chỉ được lưu trong trình duyệt này. Xuất ra file để giữ lại, hoặc chuyển sang máy khác.
      </span>
      <div className="mt-1 flex gap-2">
        <button type="button" onClick={exportFile} className="flex h-9 items-center gap-1.5 rounded-full border border-s4 px-4 text-sm font-semibold hover:border-ink">
          <Icon name="save" size={16} /> Xuất file
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className="h-9 rounded-full px-4 text-sm font-semibold text-muted hover:text-ink">
          Nhập từ file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void importFile(file);
          }}
        />
      </div>
    </section>
  );
}

export function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'lich-su' ? 'history' : 'playlists';
  const playlists = usePlaylists();
  const likedCount = useLibrary((s) => s.likes.length);

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
          {playlists.length === 0 && <p className="text-sm text-muted">Bạn chưa tạo playlist nào. Đặt tên ở ô phía trên để bắt đầu.</p>}
          <Backup />
        </div>
      )}
    </div>
  );
}
