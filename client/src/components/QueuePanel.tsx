import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useState } from 'react';
import { engine } from '../audio/engine.ts';
import { artistNames } from '../lib/format.ts';
import { currentItem, usePlayer, type QueueItem } from '../store/player.ts';
import { useUi } from '../store/ui.ts';
import type { Track } from '../types.ts';
import { EqBars, Icon } from './Icon.tsx';
import { openTrackMenu } from './TrackList.tsx';
import { Cover } from './ui.tsx';

function QueueRow({ item }: { item: QueueItem }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.uid });
  const jumpTo = usePlayer((s) => s.jumpTo);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onContextMenu={(e) => openTrackMenu(e, item.track, { queueUid: item.uid })}
      className={`group flex items-center gap-2 rounded-lg py-1 pl-0 pr-1.5 ${
        isDragging ? 'relative z-10 -rotate-1 bg-s3 shadow-[0_14px_30px_rgba(0,0,0,.55)]' : 'hover:bg-s1'
      }`}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label="Kéo để sắp xếp"
        className="flex h-11 w-7 shrink-0 cursor-grab touch-none items-center justify-center text-dim hover:text-ink"
        {...attributes}
        {...listeners}
      >
        <Icon name="grip" size={14} />
      </button>
      <button type="button" onClick={() => jumpTo(item.uid)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left" aria-label={`Phát ${item.track.title}`}>
        <Cover src={item.track.thumbnail} size={40} className="h-10 w-10" />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{item.track.title}</span>
          <span className="truncate text-xs text-muted">{artistNames(item.track.artists)}</span>
        </span>
      </button>
      <button
        type="button"
        aria-label="Tùy chọn khác"
        onClick={(e) => openTrackMenu(e, item.track, { queueUid: item.uid })}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:text-ink"
      >
        <Icon name="more" size={18} />
      </button>
    </div>
  );
}

function useRelated(videoId: string | undefined, enabled: boolean): Track[] {
  const [related, setRelated] = useState<Track[]>([]);
  useEffect(() => {
    if (!videoId || !enabled) {
      setRelated([]);
      return;
    }
    let alive = true;
    void engine.radioFor(videoId).then((list) => alive && setRelated(list.slice(0, 5)));
    return () => {
      alive = false;
    };
  }, [videoId, enabled]);
  return related;
}

export function QueuePanel({ variant }: { variant: 'aside' | 'sheet' }) {
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const playing = usePlayer((s) => s.playing);
  const context = usePlayer((s) => s.context);
  const autoplay = usePlayer((s) => s.autoplay);
  const repeat = usePlayer((s) => s.repeat);
  const setAutoplay = usePlayer((s) => s.setAutoplay);
  const clearUpcoming = usePlayer((s) => s.clearUpcoming);
  const moveInQueue = usePlayer((s) => s.moveInQueue);
  const setQueueOpen = useUi((s) => s.setQueueOpen);
  const current = currentItem({ queue, index });
  const upcoming = queue.slice(index + 1);
  const last = queue[queue.length - 1];
  const related = useRelated(last?.track.videoId, autoplay && repeat === 'off');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id) moveInQueue(String(e.active.id), String(e.over.id));
  };

  const shell =
    variant === 'aside'
      ? 'w-[340px] shrink-0 border-l border-line bg-panel'
      : 'fixed inset-0 z-40 bg-panel pt-safe md:inset-y-0 md:left-auto md:w-[380px] md:border-l md:border-line md:shadow-2xl';

  return (
    <aside aria-label="Hàng đợi" className={`flex flex-col overflow-hidden ${shell}`}>
      <div className="flex items-center justify-between py-3 pl-5 pr-3">
        <h2 className="font-display text-xl font-bold">Hàng đợi</h2>
        <button type="button" aria-label="Đóng hàng đợi" onClick={() => setQueueOpen(false)} className="flex h-10 w-10 items-center justify-center text-muted hover:text-ink">
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3.5 pb-6 scrollbar-thin">
        {!current && <p className="px-1.5 py-6 text-sm text-muted">Hàng đợi đang trống. Chọn một bài để bắt đầu.</p>}
        {current && (
          <>
            <span className="px-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Đang phát</span>
            <div className="flex items-center gap-2.5 rounded-lg bg-s1 p-1.5">
              <Cover src={current.track.thumbnail} size={44} className="h-11 w-11" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold text-accent">{current.track.title}</span>
                <span className="truncate text-xs text-muted">{artistNames(current.track.artists)}</span>
              </span>
              <span className="mr-2">
                <EqBars playing={playing} />
              </span>
            </div>
          </>
        )}

        {upcoming.length > 0 && (
          <>
            <div className="mt-1 flex items-center justify-between gap-2 pl-1.5">
              <span className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                Tiếp theo{context ? ` · ${context.label}` : ''}
              </span>
              <button type="button" onClick={clearUpcoming} className="h-8 shrink-0 px-2 text-xs font-semibold text-muted hover:text-ink">
                Xóa hết
              </button>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={upcoming.map((i) => i.uid)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-0.5">
                  {upcoming.map((item) => (
                    <QueueRow key={item.uid} item={item} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </>
        )}

        <div className="mt-1 flex flex-col gap-1 rounded-[10px] bg-s1 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold" id="autoplay-label">
              Tự động phát
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={autoplay}
              aria-labelledby="autoplay-label"
              onClick={() => setAutoplay(!autoplay)}
              className={`relative h-[26px] w-11 rounded-full transition-colors ${autoplay ? 'bg-accent' : 'bg-s4'}`}
            >
              <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-bg transition-all ${autoplay ? 'right-[3px]' : 'left-[3px]'}`} />
            </button>
          </div>
          <span className="text-xs leading-relaxed text-muted">
            {autoplay
              ? repeat === 'off'
                ? 'Hết hàng đợi sẽ phát tiếp các bài liên quan dưới đây.'
                : 'Đang bật lặp lại nên sẽ không tự phát bài liên quan.'
              : 'Hết hàng đợi thì dừng phát.'}
          </span>
        </div>
        {related.length > 0 && (
          <div className="flex flex-col gap-0.5">
            {related.map((t) => (
              <div key={t.videoId} className="flex items-center gap-2.5 py-1 pl-[34px] pr-1.5">
                <Cover src={t.thumbnail} size={40} className="h-10 w-10 opacity-80" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-ink-soft">{t.title}</span>
                  <span className="truncate text-xs text-muted">{artistNames(t.artists)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
