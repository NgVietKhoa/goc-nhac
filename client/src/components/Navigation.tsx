import { NavLink, useNavigate } from 'react-router';
import { api } from '../lib/api.ts';
import { useLibrary } from '../store/library.ts';
import { Icon, Logo, type IconName } from './Icon.tsx';
import { PlaylistMosaic } from './TrackMenu.tsx';

const LINKS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Trang chủ', icon: 'home', end: true },
  { to: '/search', label: 'Tìm kiếm', icon: 'search' },
  { to: '/library', label: 'Thư viện', icon: 'library' },
  { to: '/likes', label: 'Yêu thích', icon: 'heart' },
];

export async function lockApp(): Promise<void> {
  await api.logout().catch(() => {});
  window.location.reload();
}

export function Sidebar() {
  const playlists = useLibrary((s) => s.playlists);
  const navigate = useNavigate();

  const create = () => navigate('/library?tao=1');

  return (
    <nav aria-label="Điều hướng chính" className="hidden w-[240px] shrink-0 flex-col gap-7 bg-sidebar px-3 pb-4 pt-[22px] md:flex">
      <NavLink to="/" className="flex items-center gap-2.5 px-3">
        <Logo />
        <span className="font-display text-[22px] font-bold tracking-tight">Góc Nhạc</span>
      </NavLink>

      <div className="flex flex-col gap-0.5">
        {LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              `flex h-11 items-center gap-3.5 rounded-[10px] px-3 text-[15px] font-semibold transition-colors ${
                isActive ? 'bg-s2 text-ink' : 'text-muted hover:text-ink'
              }`
            }
          >
            <Icon name={l.icon} size={22} />
            {l.label}
          </NavLink>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 border-t border-line pt-5">
        <div className="flex items-center justify-between pl-3 pr-1">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Playlist của tôi</span>
          <button type="button" aria-label="Tạo playlist mới" onClick={create} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-s2 hover:text-ink">
            <Icon name="plus" size={20} />
          </button>
        </div>
        <div className="-mx-1 flex min-h-0 flex-col gap-0.5 overflow-y-auto px-1 scrollbar-thin">
          {playlists.length === 0 && <span className="px-3 py-2 text-sm text-dim">Chưa có playlist nào</span>}
          {playlists.map((p) => (
            <NavLink
              key={p.id}
              to={`/me/playlist/${p.id}`}
              className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-1.5 ${isActive ? 'bg-s1' : 'hover:bg-s1'}`}
            >
              <PlaylistMosaic covers={p.covers} size={40} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">{p.name}</span>
                <span className="text-xs text-muted">{p.trackCount} bài</span>
              </span>
            </NavLink>
          ))}
        </div>
      </div>

      <button type="button" onClick={() => void lockApp()} className="flex h-11 items-center gap-3 rounded-[10px] px-3 text-sm font-medium text-muted hover:text-ink">
        <Icon name="lock" size={20} />
        Khóa ứng dụng
      </button>
    </nav>
  );
}

export function BottomNav() {
  return (
    <nav aria-label="Điều hướng chính" className="flex h-16 shrink-0 items-stretch border-t border-line bg-sidebar/95 backdrop-blur md:hidden">
      {LINKS.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.end}
          className={({ isActive }) => `flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${isActive ? 'text-ink' : 'text-muted'}`}
        >
          <Icon name={l.icon} size={22} />
          {l.label}
        </NavLink>
      ))}
    </nav>
  );
}
