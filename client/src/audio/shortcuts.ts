import { useEffect } from 'react';
import { currentItem, usePlayer } from '../store/player.ts';
import { useLibrary } from '../store/library.ts';
import { useUi } from '../store/ui.ts';
import { engine } from './engine.ts';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Phím tắt: Space (phát/dừng), ←/→ (tua 10s), Shift+←/→ (bài trước/sau),
 * ↑/↓ (âm lượng), L (thích), Esc (đóng màn hình Đang phát).
 */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const player = usePlayer.getState();
      switch (e.key) {
        case ' ':
          // Để nút đang focus tự xử lý Space/Enter.
          if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) return;
          e.preventDefault();
          player.toggle();
          break;
        case 'ArrowLeft':
          if (e.target instanceof HTMLInputElement) return;
          e.preventDefault();
          if (e.shiftKey) engine.previous();
          else engine.seekBy(-10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey) void engine.next();
          else engine.seekBy(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          player.setVolume(player.volume + 0.05);
          break;
        case 'ArrowDown':
          e.preventDefault();
          player.setVolume(player.volume - 0.05);
          break;
        case 'l':
        case 'L': {
          const item = currentItem(player);
          if (item) void useLibrary.getState().toggleLike(item.track);
          break;
        }
        case 'Escape': {
          const ui = useUi.getState();
          if (ui.menu) ui.closeMenu();
          else if (ui.addToPlaylist) ui.closeAddToPlaylist();
          else if (ui.nowPlayingOpen) ui.setNowPlaying(false);
          break;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
