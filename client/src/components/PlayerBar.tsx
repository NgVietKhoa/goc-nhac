import { Link } from 'react-router';
import { usePlayback, usePlayer } from '../store/player.ts';
import { useUi } from '../store/ui.ts';
import { Icon } from './Icon.tsx';
import { LikeButton, SeekBar, TransportControls, useCurrentTrack, VolumeControl } from './PlayerControls.tsx';
import { ArtistLinks } from './TrackList.tsx';
import { Cover, IconButton } from './ui.tsx';

/** Thanh phát nhạc cố định ở đáy (desktop/tablet). */
export function PlayerBar() {
  const track = useCurrentTrack();
  const queueOpen = useUi((s) => s.queueOpen);
  const toggleQueue = useUi((s) => s.toggleQueue);
  const setNowPlaying = useUi((s) => s.setNowPlaying);

  return (
    <footer
      aria-label="Trình phát"
      className="hidden h-[88px] shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] items-center gap-6 border-t border-line-strong bg-bar px-5 md:grid"
    >
      <div className="flex min-w-0 items-center gap-3.5">
        {track ? (
          <>
            <button type="button" aria-label="Mở màn hình Đang phát" onClick={() => setNowPlaying(true)} className="shrink-0">
              <Cover src={track.thumbnail} size={56} className="h-14 w-14" />
            </button>
            <div className="flex min-w-0 flex-col gap-0.5">
              <button type="button" onClick={() => setNowPlaying(true)} className="truncate text-left text-sm font-semibold hover:underline">
                {track.title}
              </button>
              <ArtistLinks track={track} className="text-[13px] text-muted" />
            </div>
            <LikeButton track={track} />
          </>
        ) : (
          <span className="text-sm text-muted">Chọn một bài để bắt đầu nghe</span>
        )}
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <TransportControls />
        <div className="w-full max-w-[600px]">
          <SeekBar />
        </div>
      </div>

      <div className="flex items-center justify-end gap-1">
        <IconButton icon="mic" label="Lời bài hát" onClick={() => setNowPlaying(true)} disabled={!track} />
        <IconButton icon="queue" label="Hàng đợi" active={queueOpen} onClick={toggleQueue} />
        <VolumeControl />
        <IconButton icon="expand" label="Mở màn hình Đang phát" size={18} onClick={() => setNowPlaying(true)} disabled={!track} />
      </div>
    </footer>
  );
}

/** Mini player trên điện thoại (nằm trên thanh điều hướng dưới). */
export function MiniPlayer() {
  const track = useCurrentTrack();
  const playing = usePlayer((s) => s.playing);
  const toggle = usePlayer((s) => s.toggle);
  const setNowPlaying = useUi((s) => s.setNowPlaying);
  const position = usePlayback((s) => s.position);
  const duration = usePlayback((s) => s.duration);
  if (!track) return null;
  const pct = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <div className="relative mx-2 mb-1 flex h-14 items-center gap-2.5 overflow-hidden rounded-lg bg-s3 pl-1.5 pr-1 md:hidden">
      <button type="button" onClick={() => setNowPlaying(true)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left" aria-label="Mở màn hình Đang phát">
        <Cover src={track.thumbnail} size={44} className="h-11 w-11" />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold">{track.title}</span>
          <span className="truncate text-xs text-muted">{track.artists.map((a) => a.name).join(', ')}</span>
        </span>
      </button>
      <LikeButton track={track} size={22} />
      <button type="button" aria-label={playing ? 'Tạm dừng' : 'Phát'} onClick={toggle} className="flex h-11 w-11 items-center justify-center">
        <Icon name={playing ? 'pause' : 'play'} size={24} />
      </button>
      <div className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-s4">
        <div className="h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function PlayerTitleLink({ className = '' }: { className?: string }) {
  const context = usePlayer((s) => s.context);
  if (!context) return null;
  return context.href ? (
    <Link to={context.href} className={className}>
      {context.label}
    </Link>
  ) : (
    <span className={className}>{context.label}</span>
  );
}
