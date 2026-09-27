import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { img } from '../lib/format.ts';
import { Icon, type IconName } from './Icon.tsx';

/** Ảnh bìa có nền dự phòng khi thiếu ảnh hoặc ảnh lỗi. */
export function Cover({
  src,
  size,
  alt = '',
  className = '',
  rounded = 'rounded-md',
  icon = 'music',
}: {
  src?: string;
  size: number;
  alt?: string;
  className?: string;
  rounded?: string;
  icon?: IconName;
}) {
  // Máy chủ ảnh của Google đôi khi từ chối khi tải nhiều ảnh cùng lúc → thử lại 2 lần
  // với kích thước lệch 1px (URL khác nên trình duyệt không dùng lại kết quả lỗi).
  const [attempt, setAttempt] = useState(0);
  const base = Math.min(1080, Math.round(size * (window.devicePixelRatio > 1 ? 2 : 1)));
  const url = img(src, base + attempt);
  if (!url || attempt > 2) {
    return (
      <span className={`flex shrink-0 items-center justify-center bg-s3 text-dim ${rounded} ${className}`} aria-hidden={!alt}>
        <Icon name={icon} size={Math.max(16, Math.round(size / 3))} />
      </span>
    );
  }
  return (
    <img
      key={attempt}
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => {
        const canRetry = /googleusercontent|ggpht/.test(url) && attempt < 2;
        if (canRetry) window.setTimeout(() => setAttempt((a) => a + 1), 400 + Math.random() * 800);
        else setAttempt(3);
      }}
      className={`shrink-0 bg-s3 object-cover ${rounded} ${className}`}
    />
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`skeleton block ${className}`} aria-hidden="true" />;
}

export function IconButton({
  icon,
  label,
  size = 20,
  active = false,
  dot = false,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; size?: number; active?: boolean; dot?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
        active ? 'text-accent' : 'text-muted hover:text-ink'
      } ${className}`}
      {...rest}
    >
      <Icon name={icon} size={size} />
      {dot && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" />}
    </button>
  );
}

export function PlayButton({ onClick, label = 'Phát', size = 56, playing = false }: { onClick(): void; label?: string; size?: number; playing?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={playing ? 'Tạm dừng' : label}
      className="flex shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink shadow-lg transition-transform hover:scale-105 active:scale-95"
      style={{ width: size, height: size }}
    >
      <Icon name={playing ? 'pause' : 'play'} size={Math.round(size * 0.42)} />
    </button>
  );
}

export function Chip({ active, children, onClick }: { active: boolean; children: ReactNode; onClick(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-9 shrink-0 rounded-full px-4 text-sm font-medium transition-colors ${
        active ? 'bg-ink text-bg' : 'bg-s2 text-ink hover:bg-s3'
      }`}
    >
      {children}
    </button>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="font-display text-[22px] font-bold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?(): void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-line-strong bg-s1 p-6">
      <span className="font-semibold">Không tải được nội dung</span>
      <span className="text-sm text-muted">{error.message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="h-9 rounded-full bg-s3 px-4 text-sm font-semibold hover:bg-s4">
          Thử lại
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-s2 text-muted">
        <Icon name={icon} size={28} />
      </span>
      <span className="font-display text-xl font-bold">{title}</span>
      {children && <div className="max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}
