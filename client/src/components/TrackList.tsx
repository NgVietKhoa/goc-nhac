import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CSSProperties, HTMLAttributes, MouseEvent } from 'react';
import { Link } from 'react-router';
import { formatShortDate, formatTime } from '../lib/format.ts';
import { useMediaQuery } from '../lib/hooks.ts';
import { useLibrary } from '../store/library.ts';
import { currentItem, usePlayback, usePlayer, type PlayContext } from '../store/player.ts';
import { useUi } from '../store/ui.ts';
import type { Track } from '../types.ts';
import { EqBars, Icon } from './Icon.tsx';
import { Cover } from './ui.tsx';

type Row = Track & { addedAt?: string };

interface ListProps {
  tracks: Row[];
  context?: PlayContext | null;
  /** Hiện số thứ tự thay cho ảnh bìa ở cột đầu (album). */
  numbered?: boolean;
  showCover?: boolean;
  showAlbum?: boolean;
  showAdded?: boolean;
  /** Bỏ cột số thứ tự (danh sách ngắn trong không gian hẹp). */
  compact?: boolean;
  /** Playlist của tôi: bật kéo-thả sắp xếp và mục "Xóa khỏi playlist". */
  playlistId?: number;
  onReorder?(videoIds: string[]): void;
}

export function ArtistLinks({ track, className = '' }: { track: Track; className?: string }) {
  if (track.artists.length === 0) return <span className={className}>Không rõ nghệ sĩ</span>;
  return (
    <span className={`truncate ${className}`}>
      {track.artists.map((a, i) => (
        <span key={`${a.name}-${i}`}>
          {i > 0 && ', '}
          {a.id ? (
            <Link to={`/artist/${a.id}`} onClick={(e) => e.stopPropagation()} className="hover:text-ink hover:underline">
              {a.name}
            </Link>
          ) : (
            a.name
          )}
        </span>
      ))}
    </span>
  );
}

export function openTrackMenu(e: MouseEvent, track: Track, extra?: { playlistId?: number; queueUid?: string }): void {
  e.preventDefault();
  e.stopPropagation();
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const fromButton = e.type === 'click';
  useUi.getState().openMenu({
    x: fromButton ? rect.right : e.clientX,
    y: fromButton ? rect.bottom : e.clientY,
    track,
    ...extra,
  });
}

interface RowProps {
  track: Row;
  index: number;
  props: ListProps;
  layout: Layout;
  onPlay(): void;
  handle?: HTMLAttributes<HTMLButtonElement>;
  style?: CSSProperties;
  setRef?(el: HTMLDivElement | null): void;
  dragging?: boolean;
}

function TrackRow({ track, index, props, layout, onPlay, handle, style, setRef, dragging }: RowProps) {
  const isCurrent = usePlayer((s) => currentItem(s)?.track.videoId === track.videoId);
  const playing = usePlayer((s) => s.playing);
  const failed = usePlayback((s) => s.failed[track.videoId]);
  const liked = useLibrary((s) => Boolean(s.likedIds[track.videoId]));
  const toggleLike = useLibrary((s) => s.toggleLike);
  const { numbered, showCover = true, showAlbum, showAdded, playlistId } = props;

  return (
    <div
      ref={setRef}
      style={{ ...style, gridTemplateColumns: layout.columns }}
      role="row"
      onClick={onPlay}
      onContextMenu={(e) => openTrackMenu(e, track, { playlistId })}
      className={`group grid cursor-default select-none items-center gap-3 rounded-lg px-2 py-1.5 md:gap-4 ${
        dragging ? 'relative z-10 bg-s3 shadow-[0_14px_30px_rgba(0,0,0,.55)]' : isCurrent ? 'bg-s1' : 'hover:bg-line'
      } ${failed ? 'opacity-55' : ''}`}
    >
      {handle && layout.md && (
        <button
          type="button"
          aria-label="Kéo để sắp xếp"
          onClick={(e) => e.stopPropagation()}
          className="-mr-2 flex h-10 w-6 cursor-grab touch-none items-center justify-center text-dim hover:text-ink"
          {...handle}
        >
          <Icon name="grip" size={14} />
        </button>
      )}
      {layout.md && !layout.compact && (
        <span className="flex w-8 justify-center text-sm text-muted tabular">
          {isCurrent ? (
            <EqBars playing={playing} />
          ) : (
            <>
              <span className="group-hover:hidden">{index + 1}</span>
              <Icon name="play" size={16} className="hidden text-ink group-hover:block" />
            </>
          )}
        </span>
      )}
      <span className="flex min-w-0 items-center gap-3">
        {(!layout.md || layout.compact) && isCurrent && <EqBars playing={playing} />}
        {showCover && !numbered && <Cover src={track.thumbnail} size={40} className="h-10 w-10" />}
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className={`truncate text-sm font-medium ${isCurrent ? 'text-accent' : 'text-ink'}`}>{track.title}</span>
          <span className="flex min-w-0 items-center gap-2 text-xs text-muted">
            {failed && <span className="shrink-0 rounded bg-s3 px-1.5 py-0.5 text-[11px] font-semibold text-danger">Không khả dụng</span>}
            <ArtistLinks track={track} />
          </span>
        </span>
      </span>
      {showAlbum && layout.lg && (
        <span className="truncate text-sm text-muted">
          {track.album?.id ? (
            <Link to={`/album/${track.album.id}`} onClick={(e) => e.stopPropagation()} className="hover:text-ink hover:underline">
              {track.album.name}
            </Link>
          ) : (
            track.album?.name
          )}
        </span>
      )}
      {showAdded && layout.xl && <span className="text-sm text-muted">{track.addedAt ? formatShortDate(track.addedAt) : ''}</span>}
      {layout.md && (
      <button
        type="button"
        aria-label={liked ? 'Bỏ thích' : 'Thích'}
        onClick={(e) => {
          e.stopPropagation();
          void toggleLike(track);
        }}
        className={`flex h-9 w-9 items-center justify-center rounded-full ${
          liked ? 'text-accent' : 'text-dim opacity-0 hover:text-ink group-hover:opacity-100 focus-visible:opacity-100'
        }`}
      >
        <Icon name={liked ? 'heartFill' : 'heart'} size={18} />
      </button>
      )}
      {layout.md && <span className="text-right text-sm text-muted tabular">{track.durationSec ? formatTime(track.durationSec) : ""}</span>}
      <button
        type="button"
        aria-label="Tùy chọn khác"
        onClick={(e) => openTrackMenu(e, track, { playlistId })}
        className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-s4 hover:text-ink"
      >
        <Icon name="more" size={18} />
      </button>
    </div>
  );
}

interface Layout {
  compact: boolean;
  md: boolean;
  lg: boolean;
  xl: boolean;
  columns: string;
}

function useLayout({ showAlbum, showAdded, playlistId, compact }: ListProps): Layout {
  const md = useMediaQuery('(min-width: 768px)');
  const lg = useMediaQuery('(min-width: 1024px)');
  const xl = useMediaQuery('(min-width: 1280px)');
  const cols = md
    ? [
        playlistId !== undefined ? '24px' : '',
        compact ? '' : '32px',
        'minmax(0,1fr)',
        showAlbum && lg ? 'minmax(0,0.8fr)' : '',
        showAdded && xl ? '96px' : '',
        '36px',
        '52px',
        '36px',
      ]
    : ['minmax(0,1fr)', '36px'];
  return { md, lg, xl, compact: Boolean(compact), columns: cols.filter(Boolean).join(' ') };
}

function SortableRow(p: RowProps & { id: string }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: p.id });
  return (
    <TrackRow
      {...p}
      setRef={setNodeRef}
      dragging={isDragging}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      handle={{ ...attributes, ...listeners, ref: setActivatorNodeRef } as HTMLAttributes<HTMLButtonElement>}
    />
  );
}

export function TrackList(props: ListProps) {
  const { tracks, context, playlistId, onReorder } = props;
  const playTracks = usePlayer((s) => s.playTracks);
  const layout = useLayout(props);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const play = (i: number) => {
    const s = usePlayer.getState();
    const cur = currentItem(s);
    if (cur?.track.videoId === tracks[i].videoId && s.context?.href === context?.href) {
      s.toggle();
      return;
    }
    playTracks(tracks, i, context ?? null);
  };

  const header = layout.md && (
    <div
      role="row"
      style={{ gridTemplateColumns: layout.columns }}
      className="grid items-center gap-4 border-b border-line px-2 pb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted"
    >
      {playlistId !== undefined && <span />}
      <span className="text-center">#</span>
      <span>Tiêu đề</span>
      {props.showAlbum && layout.lg && <span>Album</span>}
      {props.showAdded && layout.xl && <span>Ngày thêm</span>}
      <span />
      <span className="flex justify-end">
        <Icon name="clock" size={16} aria-label="Thời lượng" />
      </span>
      <span />
    </div>
  );

  if (playlistId !== undefined && onReorder) {
    const ids = tracks.map((t) => t.videoId);
    const onDragEnd = (e: DragEndEvent) => {
      if (!e.over || e.active.id === e.over.id) return;
      const from = ids.indexOf(String(e.active.id));
      const to = ids.indexOf(String(e.over.id));
      const next = [...ids];
      next.splice(to, 0, ...next.splice(from, 1));
      onReorder(next);
    };
    return (
      <div role="table" className="flex flex-col gap-0.5">
        {header}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {tracks.map((t, i) => (
              <SortableRow key={t.videoId} id={t.videoId} track={t} index={i} props={props} layout={layout} onPlay={() => play(i)} />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    );
  }

  return (
    <div role="table" className="flex flex-col gap-0.5">
      {props.showAlbum !== undefined && header}
      {tracks.map((t, i) => (
        <TrackRow key={`${t.videoId}-${i}`} track={t} index={i} props={props} layout={layout} onPlay={() => play(i)} />
      ))}
    </div>
  );
}

export function TrackListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Đang tải">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-1.5">
          <span className="skeleton h-10 w-10 rounded-md" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="skeleton h-3 w-1/3 rounded" />
            <span className="skeleton h-2.5 w-1/5 rounded" />
          </span>
        </div>
      ))}
    </div>
  );
}
