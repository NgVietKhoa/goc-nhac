import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api.ts';
import { dominantColor } from '../lib/color.ts';
import { artistNames } from '../lib/format.ts';
import { useAsync } from '../lib/hooks.ts';
import { currentItem, usePlayer } from '../store/player.ts';
import { useUi } from '../store/ui.ts';
import type { Track } from '../types.ts';
import { Icon } from './Icon.tsx';
import { LikeButton, SeekBar, TransportControls, useCurrentTrack } from './PlayerControls.tsx';
import { openTrackMenu } from './TrackList.tsx';
import { Cover } from './ui.tsx';

type Tab = 'lyrics' | 'next' | 'related';

function Lyrics({ videoId }: { videoId: string }) {
  const { data, error, loading } = useAsync(() => api.lyrics(videoId), [videoId]);
  if (loading) {
    return (
      <div className="flex flex-col gap-5" aria-busy="true">
        {[70, 55, 80, 45, 65].map((w, i) => (
          <span key={i} className="skeleton h-7 rounded-md opacity-40" style={{ width: `${w}%` }} />
        ))}
      </div>
    );
  }
  if (error || !data) {
    return <p className="text-lg text-ink/75">{error?.message ?? 'Bài này chưa có lời.'}</p>;
  }
  return (
    <div className="flex flex-col gap-1">
      {data.lines.map((line, i) =>
        line.trim() === '' ? (
          <span key={i} className="h-5" />
        ) : (
          <p key={i} className="m-0 font-display text-2xl font-bold leading-snug tracking-tight text-ink/85 md:text-[30px]">
            {line}
          </p>
        ),
      )}
      {data.source && <span className="mt-6 text-xs text-ink/70">Lời bài hát do YouTube Music cung cấp · {data.source}</span>}
    </div>
  );
}

function MiniTrackList({ tracks, onPick }: { tracks: Track[]; onPick(i: number): void }) {
  return (
    <div className="flex flex-col gap-0.5">
      {tracks.map((t, i) => (
        <button
          key={`${t.videoId}-${i}`}
          type="button"
          onClick={() => onPick(i)}
          onContextMenu={(e) => openTrackMenu(e, t)}
          className="flex items-center gap-3 rounded-lg p-1.5 text-left hover:bg-black/20"
        >
          <Cover src={t.thumbnail} size={48} className="h-12 w-12" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[15px] font-medium">{t.title}</span>
            <span className="truncate text-sm text-ink/70">{artistNames(t.artists)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function Related({ videoId }: { videoId: string }) {
  const { data, loading } = useAsync(() => api.upNext(videoId), [videoId]);
  if (loading) return <p className="text-ink/70">Đang tải…</p>;
  if (!data?.length) return <p className="text-ink/70">Không có bài liên quan.</p>;
  return (
    <MiniTrackList
      tracks={data}
      onPick={(i) => usePlayer.getState().playTracks(data, i, { kind: 'Đang phát radio', label: 'Bài liên quan' })}
    />
  );
}

function UpNext() {
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const upcoming = queue.slice(index + 1);
  if (upcoming.length === 0) return <p className="text-ink/70">Không còn bài nào trong hàng đợi.</p>;
  return <MiniTrackList tracks={upcoming.map((i) => i.track)} onPick={(i) => usePlayer.getState().jumpTo(upcoming[i].uid)} />;
}

/** Màn hình "Đang phát" toàn màn hình: nền theo màu chủ đạo của ảnh bìa + lời bài hát. */
export function NowPlaying() {
  const open = useUi((s) => s.nowPlayingOpen);
  const setOpen = useUi((s) => s.setNowPlaying);
  const setQueueOpen = useUi((s) => s.setQueueOpen);
  const track = useCurrentTrack();
  const context = usePlayer((s) => s.context);
  const [color, setColor] = useState('#2a2622');
  const [tab, setTab] = useState<Tab>('lyrics');

  useEffect(() => {
    let alive = true;
    void dominantColor(track?.thumbnail).then((c) => alive && setColor(c));
    return () => {
      alive = false;
    };
  }, [track?.thumbnail]);

  useEffect(() => {
    if (open && !currentItem(usePlayer.getState())) setOpen(false);
  }, [open, track, setOpen]);

  if (!open || !track) return null;
  const artistId = track.artists.find((a) => a.id)?.id;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'lyrics', label: 'Lời bài hát' },
    { id: 'next', label: 'Tiếp theo' },
    { id: 'related', label: 'Liên quan' },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Đang phát"
      className="fixed inset-0 z-40 flex flex-col overflow-y-auto pt-safe pb-safe transition-colors duration-700 lg:overflow-hidden"
      style={{ background: `linear-gradient(180deg, ${color} 0%, color-mix(in srgb, ${color} 55%, #0c0b0a) 100%)` }}
    >
      <div className="grid grid-cols-[48px_minmax(0,1fr)_48px] items-center px-4 py-3 md:px-12 md:py-5">
        <button type="button" aria-label="Thu nhỏ" onClick={() => setOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-full bg-black/20 hover:bg-black/30">
          <Icon name="chevronDown" size={22} strokeWidth={2} />
        </button>
        <div className="flex min-w-0 flex-col items-center gap-0.5 text-center">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/80">{context?.kind ?? 'Đang phát'}</span>
          {context?.href ? (
            <Link to={context.href} onClick={() => setOpen(false)} className="max-w-full truncate text-sm font-semibold hover:underline">
              {context.label}
            </Link>
          ) : (
            <span className="max-w-full truncate text-sm font-semibold">{context?.label ?? track.title}</span>
          )}
        </div>
        <button type="button" aria-label="Tùy chọn khác" onClick={(e) => openTrackMenu(e, track)} className="flex h-11 w-11 items-center justify-center justify-self-end rounded-full bg-black/20 hover:bg-black/30">
          <Icon name="more" size={20} />
        </button>
      </div>

      <div className="mx-auto grid w-full max-w-[1280px] flex-1 grid-cols-1 gap-8 px-6 pb-8 md:px-12 lg:grid-cols-[minmax(0,500px)_minmax(0,1fr)] lg:items-center lg:gap-20 lg:overflow-hidden">
        <div className="mx-auto flex w-full max-w-[500px] flex-col gap-6">
          <Cover
            src={track.thumbnail}
            size={500}
            alt={`Ảnh bìa ${track.album?.name ?? track.title}`}
            className="aspect-square w-full shadow-[0_30px_60px_rgba(0,0,0,.45)]"
            rounded="rounded-[14px]"
          />
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate font-display text-2xl font-bold tracking-tight md:text-[32px]">{track.title}</span>
              <span className="truncate text-base text-ink/80">
                {artistId ? (
                  <Link to={`/artist/${artistId}`} onClick={() => setOpen(false)} className="hover:underline">
                    {artistNames(track.artists)}
                  </Link>
                ) : (
                  artistNames(track.artists)
                )}
                {track.album && (
                  <>
                    {' · '}
                    {track.album.id ? (
                      <Link to={`/album/${track.album.id}`} onClick={() => setOpen(false)} className="hover:underline">
                        {track.album.name}
                      </Link>
                    ) : (
                      track.album.name
                    )}
                  </>
                )}
              </span>
            </div>
            <LikeButton track={track} size={26} className="h-12 w-12" />
          </div>
          <SeekBar thick light />
          <TransportControls large />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setQueueOpen(true);
            }}
            className="flex items-center gap-2 self-center text-sm font-semibold text-ink/80 hover:text-ink lg:hidden"
          >
            <Icon name="queue" size={18} /> Hàng đợi
          </button>
        </div>

        <div className="flex min-h-0 flex-col gap-6 lg:h-[640px]">
          <div role="tablist" aria-label="Nội dung" className="flex gap-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`h-10 rounded-full px-[18px] text-sm font-semibold transition-colors ${tab === t.id ? 'bg-ink text-bg' : 'bg-black/20 hover:bg-black/30'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-2 scrollbar-thin">
            {tab === 'lyrics' && <Lyrics videoId={track.videoId} />}
            {tab === 'next' && <UpNext />}
            {tab === 'related' && <Related videoId={track.videoId} />}
          </div>
        </div>
      </div>
    </div>
  );
}
