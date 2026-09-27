import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../lib/api.ts';
import { useLibrary, usePlaylists } from '../store/library.ts';
import { usePlayer } from '../store/player.ts';
import { toast, toastError } from '../store/toast.ts';
import { useUi } from '../store/ui.ts';
import { Icon } from './Icon.tsx';
import { Cover } from './ui.tsx';

interface Item {
  label: string;
  hint?: string;
  divider?: boolean;
  danger?: boolean;
  run(): void;
}

/** Menu chuột phải / nút "..." của một bài hát. */
export function TrackMenu() {
  const menu = useUi((s) => s.menu);
  const close = useUi((s) => s.closeMenu);
  const openAdd = useUi((s) => s.openAddToPlaylist);
  const liked = useLibrary((s) => (menu ? Boolean(s.likedIds[menu.track.videoId]) : false));
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    const pad = 8;
    const left = Math.min(Math.max(pad, menu.x - (menu.x + width > window.innerWidth ? width : 0)), window.innerWidth - width - pad);
    const top = Math.min(Math.max(pad, menu.y), window.innerHeight - height - pad);
    setPos({ left, top });
    ref.current.querySelector<HTMLButtonElement>('button')?.focus();
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onScroll = () => close();
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('resize', onScroll);
    window.addEventListener('wheel', onScroll, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('wheel', onScroll);
    };
  }, [menu, close]);

  if (!menu) return null;
  const { track } = menu;
  const player = usePlayer.getState();

  const items: Item[] = [
    { label: 'Phát', run: () => player.playTracks([track]) },
    { label: 'Phát tiếp theo', run: () => { player.playNext([track]); toast.info(`Sẽ phát “${track.title}” tiếp theo`); } },
    { label: 'Thêm vào hàng đợi', run: () => { player.addToQueue([track]); toast.info(`Đã thêm “${track.title}” vào hàng đợi`); } },
    { label: 'Thêm vào playlist', hint: '›', run: () => openAdd([track]) },
    { label: liked ? 'Bỏ thích' : 'Thích', hint: 'L', run: () => useLibrary.getState().toggleLike(track) },
    {
      label: 'Phát radio từ bài này',
      run: async () => {
        try {
          const related = await api.upNext(track.videoId);
          player.playTracks([track, ...related], 0, { kind: 'Đang phát radio', label: track.title });
        } catch (err) {
          toastError(err);
        }
      },
    },
  ];
  if (menu.queueUid) {
    items.push({ label: 'Xóa khỏi hàng đợi', danger: true, run: () => player.removeFromQueue(menu.queueUid ?? '') });
  }
  if (menu.playlistId !== undefined) {
    const playlistId = menu.playlistId;
    items.push({
      label: 'Xóa khỏi playlist này',
      danger: true,
      run: () => {
        useLibrary.getState().removeFromPlaylist(playlistId, track.videoId);
        toast.info(`Đã xóa “${track.title}” khỏi playlist`);
      },
    });
  }
  const albumId = track.album?.id;
  const artistId = track.artists.find((a) => a.id)?.id;
  if (albumId) items.push({ label: 'Đi tới album', divider: true, run: () => navigate(`/album/${albumId}`) });
  if (artistId) items.push({ label: 'Đi tới nghệ sĩ', divider: !albumId, run: () => navigate(`/artist/${artistId}`) });

  const onKeyDown = (e: React.KeyboardEvent) => {
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      buttons[(i + 1) % buttons.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      buttons[(i - 1 + buttons.length) % buttons.length]?.focus();
    } else if (e.key === 'Tab') {
      close();
    }
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Tùy chọn cho ${track.title}`}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-50 flex w-[248px] flex-col rounded-[10px] border border-s4 bg-s3 p-1.5 shadow-[0_20px_50px_rgba(0,0,0,.6)]"
    >
      <div className="truncate px-3 pb-1.5 pt-1 text-xs font-semibold text-muted">{track.title}</div>
      {items.map((item) => (
        <div key={item.label}>
          {item.divider && <div className="mx-2 my-1 h-px bg-s4" />}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              item.run();
            }}
            className={`flex h-10 w-full items-center justify-between rounded-md px-3 text-left text-sm font-medium outline-none hover:bg-s4 focus-visible:bg-s4 ${
              item.danger ? 'text-danger' : 'text-ink'
            }`}
          >
            <span>{item.label}</span>
            {item.hint && <span className="text-xs text-muted">{item.hint}</span>}
          </button>
        </div>
      ))}
    </div>
  );
}

/** Hộp thoại chọn playlist để thêm bài (hoặc tạo playlist mới). */
export function AddToPlaylistDialog() {
  const tracks = useUi((s) => s.addToPlaylist);
  const close = useUi((s) => s.closeAddToPlaylist);
  const playlists = usePlaylists();
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tracks) {
      setName('');
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [tracks]);

  if (!tracks) return null;
  const title = tracks.length === 1 ? `“${tracks[0].title}”` : `${tracks.length} bài`;

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    useLibrary.getState().createPlaylist(name.trim(), tracks);
    close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 md:items-center md:p-6" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Thêm vào playlist"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-[420px] flex-col gap-4 rounded-t-2xl border border-line-strong bg-s1 p-5 pb-safe md:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="font-display text-xl font-bold">Thêm vào playlist</h2>
            <span className="truncate text-sm text-muted">{title}</span>
          </div>
          <button type="button" aria-label="Đóng" onClick={close} className="-m-2 flex h-10 w-10 items-center justify-center text-muted hover:text-ink">
            <Icon name="close" size={18} />
          </button>
        </div>
        <form onSubmit={create} className="flex gap-2">
          <label htmlFor="new-playlist" className="sr-only">
            Tên playlist mới
          </label>
          <input
            id="new-playlist"
            ref={inputRef}
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tạo playlist mới…"
            className="h-11 min-w-0 flex-1 rounded-lg border border-s4 bg-bg px-3 text-[15px] outline-none placeholder:text-dim focus:border-accent"
          />
          <button type="submit" disabled={!name.trim()} className="h-11 rounded-lg bg-accent px-4 text-sm font-bold text-accent-ink disabled:opacity-40">
            Tạo
          </button>
        </form>
        <div className="-mx-2 flex flex-col overflow-y-auto scrollbar-thin">
          {playlists.length === 0 && <span className="px-2 py-4 text-sm text-muted">Bạn chưa có playlist nào.</span>}
          {playlists.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                close();
                useLibrary.getState().addToPlaylist(p, tracks);
              }}
              className="flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-s3"
            >
              <PlaylistMosaic covers={p.covers} size={44} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{p.name}</span>
                <span className="text-xs text-muted">{p.trackCount} bài</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Ảnh playlist ghép từ tối đa 4 ảnh bìa. */
export function PlaylistMosaic({ covers, size, className = '' }: { covers: string[]; size: number; className?: string }) {
  const style = { width: size, height: size };
  if (covers.length === 0) {
    return (
      <span style={style} className={`flex shrink-0 items-center justify-center rounded-md bg-s3 text-dim ${className}`}>
        <Icon name="music" size={Math.round(size / 2.6)} />
      </span>
    );
  }
  if (covers.length < 4) {
    return (
      <span style={style} className={`block shrink-0 overflow-hidden rounded-md ${className}`}>
        <Cover src={covers[0]} size={size} className="h-full w-full" rounded="" />
      </span>
    );
  }
  return (
    <span style={style} className={`grid shrink-0 grid-cols-2 overflow-hidden rounded-md ${className}`} aria-hidden="true">
      {covers.slice(0, 4).map((c, i) => (
        <Cover key={i} src={c} size={Math.round(size / 2)} className="h-full w-full" rounded="" />
      ))}
    </span>
  );
}
