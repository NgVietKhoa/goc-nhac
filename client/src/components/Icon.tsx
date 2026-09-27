// Bộ icon nét (stroke) lấy từ canvas thiết kế.
import type { SVGProps } from 'react';

const PATHS = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  library: <path d="M5 4v16M10 4v16M14.5 4.5l5 15" />,
  heart: <path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  shuffle: (
    <path d="M3 7h3.5c2 0 3.3 1 4.5 2.8l2 3.4C14.2 15 15.5 17 17.5 17H21M3 17h3.5c1.3 0 2.3-.5 3.1-1.3M13.9 8.3C14.7 7.5 15.7 7 17 7h4M18 4l3 3-3 3M18 14l3 3-3 3" />
  ),
  repeat: <path d="M4 11V9a3 3 0 0 1 3-3h13M17 3l3 3-3 3M20 13v2a3 3 0 0 1-3 3H4M7 21l-3-3 3-3" />,
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  queue: <path d="M4 6h12M4 12h12M4 18h7M16 15v6l5-3z" />,
  volume: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
    </>
  ),
  volumeLow: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7" />
    </>
  ),
  mute: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9z" />
      <path d="m16 9 5 6M21 9l-5 6" />
    </>
  ),
  expand: <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  pencil: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  arrowUpLeft: <path d="M17 17 7 7M7 15V7h8" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  radio: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8" />
    </>
  ),
  album: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  save: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  music: (
    <>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="16" r="2.5" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS | 'play' | 'pause' | 'prev' | 'next' | 'more' | 'grip' | 'heartFill';

interface Props extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 20, strokeWidth = 1.8, ...rest }: Props) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true as const, ...rest };
  switch (name) {
    case 'play':
      return (
        <svg {...common}>
          <path d="M7.5 4.5v15l12-7.5z" fill="currentColor" />
        </svg>
      );
    case 'pause':
      return (
        <svg {...common}>
          <rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" />
          <rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" />
        </svg>
      );
    case 'prev':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M18 5v14L8 12z" fill="currentColor" stroke="none" />
          <path d="M6 5v14" />
        </svg>
      );
    case 'next':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M6 5v14l10-7z" fill="currentColor" stroke="none" />
          <path d="M18 5v14" />
        </svg>
      );
    case 'more':
      return (
        <svg {...common}>
          <circle cx="5" cy="12" r="1.6" fill="currentColor" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
          <circle cx="19" cy="12" r="1.6" fill="currentColor" />
        </svg>
      );
    case 'grip':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round">
          <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />
        </svg>
      );
    case 'heartFill':
      return (
        <svg {...common}>
          <path d={'M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z'} fill="currentColor" />
        </svg>
      );
    default:
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
          {PATHS[name]}
        </svg>
      );
  }
}

/** Logo Góc Nhạc (đĩa than màu nhấn). */
export function Logo({ size = 28, hole = '#0c0b0a' }: { size?: number; hole?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="14" cy="14" r="12" fill="var(--color-accent)" />
      <circle cx="14" cy="14" r="4" fill={hole} />
      <path d="M14 5.5a8.5 8.5 0 0 1 8.5 8.5" stroke={hole} strokeWidth="1.6" strokeLinecap="round" opacity="0.45" />
    </svg>
  );
}

/** Biểu tượng cột sóng nhạc cho bài đang phát. */
export function EqBars({ playing, size = 16 }: { playing: boolean; size?: number }) {
  const bars = [
    { x: 1, delay: '0s' },
    { x: 6.5, delay: '-0.3s' },
    { x: 12, delay: '-0.6s' },
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-label="Đang phát" className="text-accent">
      {bars.map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y={2}
          width={3}
          height={13}
          rx={1}
          fill="currentColor"
          className={playing ? 'eq-bar' : undefined}
          style={{ animationDelay: b.delay, transform: playing ? undefined : `scaleY(${[0.6, 1, 0.45][i]})`, transformOrigin: 'bottom' }}
        />
      ))}
    </svg>
  );
}
