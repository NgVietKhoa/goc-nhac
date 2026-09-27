import { useState } from 'react';
import { engine } from '../audio/engine.ts';
import { formatTime } from '../lib/format.ts';
import { useLibrary } from '../store/library.ts';
import { currentItem, usePlayback, usePlayer } from '../store/player.ts';
import type { Track } from '../types.ts';
import { Icon } from './Icon.tsx';
import { IconButton } from './ui.tsx';

/** Thanh tua; khi đang kéo thì chỉ tua lúc thả tay. */
export function SeekBar({ thick = false, light = false, showTimes = true }: { thick?: boolean; light?: boolean; showTimes?: boolean }) {
  const position = usePlayback((s) => s.position);
  const duration = usePlayback((s) => s.duration);
  const hasTrack = usePlayer((s) => s.index >= 0);
  const [drag, setDrag] = useState<number | null>(null);
  const value = drag ?? position;
  const pct = duration > 0 ? Math.min(100, (value / duration) * 100) : 0;

  const input = (
    <input
      type="range"
      aria-label="Tua bài hát"
      aria-valuetext={`${formatTime(value)} / ${formatTime(duration)}`}
      min={0}
      max={duration || 1}
      step={0.1}
      value={value}
      disabled={!hasTrack}
      onChange={(e) => setDrag(Number(e.target.value))}
      onPointerUp={() => {
        if (drag !== null) engine.seek(drag);
        setDrag(null);
      }}
      onKeyUp={() => {
        if (drag !== null) engine.seek(drag);
        setDrag(null);
      }}
      onBlur={() => setDrag(null)}
      className={`slider ${thick ? 'thick always-thumb' : ''}`}
      style={
        {
          '--pct': `${pct}%`,
          ...(light ? { '--fill': '#f3efe8', '--track': 'rgba(243,239,232,.25)' } : {}),
        } as React.CSSProperties
      }
    />
  );

  if (!showTimes) return input;
  return (
    <div className="flex w-full items-center gap-2.5">
      <span className={`w-10 text-right text-xs tabular ${light ? 'text-ink/80' : 'text-muted'}`}>{formatTime(value)}</span>
      {input}
      <span className={`w-10 text-xs tabular ${light ? 'text-ink/80' : 'text-muted'}`}>{duration > 0 ? formatTime(duration) : '–:––'}</span>
    </div>
  );
}

export function VolumeControl() {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleMute = usePlayer((s) => s.toggleMute);
  const effective = muted ? 0 : volume;
  return (
    <div className="flex items-center gap-1">
      <IconButton
        icon={effective === 0 ? 'mute' : effective < 0.5 ? 'volumeLow' : 'volume'}
        label={muted ? 'Bật tiếng' : 'Tắt tiếng'}
        onClick={toggleMute}
      />
      <input
        type="range"
        aria-label="Âm lượng"
        aria-valuetext={`${Math.round(effective * 100)}%`}
        min={0}
        max={1}
        step={0.01}
        value={effective}
        onChange={(e) => setVolume(Number(e.target.value))}
        className="slider w-24"
        style={{ '--pct': `${effective * 100}%` } as React.CSSProperties}
      />
    </div>
  );
}

export function LikeButton({ track, size = 20, className = '' }: { track: Track | undefined; size?: number; className?: string }) {
  const liked = useLibrary((s) => (track ? s.liked.has(track.videoId) : false));
  const toggle = useLibrary((s) => s.toggleLike);
  if (!track) return null;
  return (
    <button
      type="button"
      aria-label={liked ? 'Bỏ thích' : 'Thích'}
      aria-pressed={liked}
      onClick={(e) => {
        e.stopPropagation();
        void toggle(track);
      }}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${liked ? 'text-accent' : 'text-muted hover:text-ink'} ${className}`}
    >
      <Icon name={liked ? 'heartFill' : 'heart'} size={size} />
    </button>
  );
}

/** Cụm nút trộn / trước / phát / sau / lặp. */
export function TransportControls({ large = false }: { large?: boolean }) {
  const playing = usePlayer((s) => s.playing);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const hasTrack = usePlayer((s) => s.index >= 0);
  const buffering = usePlayback((s) => s.buffering);
  const toggle = usePlayer((s) => s.toggle);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);
  const btn = large ? 'h-14 w-14' : 'h-10 w-10';
  const icon = large ? 30 : 22;
  const repeatLabel = repeat === 'off' ? 'Lặp lại: tắt' : repeat === 'all' ? 'Lặp lại: tất cả' : 'Lặp lại một bài';

  return (
    <div className={`flex items-center ${large ? 'w-full justify-between' : 'gap-3.5'}`}>
      <button
        type="button"
        aria-label={shuffle ? 'Trộn bài: đang bật' : 'Trộn bài: đang tắt'}
        aria-pressed={shuffle}
        onClick={toggleShuffle}
        className={`relative flex ${large ? 'h-12 w-12' : 'h-10 w-10'} items-center justify-center ${shuffle ? 'text-accent' : large ? 'text-ink/80' : 'text-muted hover:text-ink'}`}
      >
        <Icon name="shuffle" size={large ? 24 : 20} />
        {shuffle && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" />}
      </button>
      <button type="button" aria-label="Bài trước" disabled={!hasTrack} onClick={() => engine.previous()} className={`flex ${btn} items-center justify-center disabled:opacity-40`}>
        <Icon name="prev" size={icon} />
      </button>
      <button
        type="button"
        aria-label={playing ? 'Tạm dừng' : 'Phát'}
        disabled={!hasTrack}
        onClick={toggle}
        className={`relative flex items-center justify-center rounded-full bg-ink text-bg transition-transform hover:scale-105 active:scale-95 disabled:opacity-40 ${
          large ? 'h-[76px] w-[76px]' : 'h-11 w-11'
        }`}
      >
        <Icon name={playing ? 'pause' : 'play'} size={large ? 30 : 20} />
        {buffering && playing && (
          <span className="absolute inset-[-3px] animate-spin rounded-full border-2 border-transparent border-t-accent" aria-hidden="true" />
        )}
      </button>
      <button type="button" aria-label="Bài tiếp theo" disabled={!hasTrack} onClick={() => void engine.next()} className={`flex ${btn} items-center justify-center disabled:opacity-40`}>
        <Icon name="next" size={icon} />
      </button>
      <button
        type="button"
        aria-label={repeatLabel}
        title={repeatLabel}
        onClick={cycleRepeat}
        className={`relative flex ${large ? 'h-12 w-12' : 'h-10 w-10'} items-center justify-center ${repeat !== 'off' ? 'text-accent' : large ? 'text-ink/80' : 'text-muted hover:text-ink'}`}
      >
        <Icon name="repeat" size={large ? 24 : 20} />
        {repeat === 'one' && (
          <span className="absolute right-0.5 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-ink">1</span>
        )}
        {repeat === 'all' && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" />}
      </button>
    </div>
  );
}

export function useCurrentTrack(): Track | undefined {
  return usePlayer((s) => currentItem(s)?.track);
}
