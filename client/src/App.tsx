import { useEffect, useRef, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { engine } from './audio/engine.ts';
import { useShortcuts } from './audio/shortcuts.ts';
import { Logo } from './components/Icon.tsx';
import { BottomNav, Sidebar } from './components/Navigation.tsx';
import { NowPlaying } from './components/NowPlaying.tsx';
import { MiniPlayer, PlayerBar } from './components/PlayerBar.tsx';
import { QueuePanel } from './components/QueuePanel.tsx';
import { Toasts } from './components/Toasts.tsx';
import { AddToPlaylistDialog, TrackMenu } from './components/TrackMenu.tsx';
import { EmptyState } from './components/ui.tsx';
import { api, setUnauthorizedHandler } from './lib/api.ts';
import { useMediaQuery } from './lib/hooks.ts';
import { AlbumPage, ArtistPage, YtPlaylistPage } from './pages/Collections.tsx';
import { HomePage } from './pages/Home.tsx';
import { LoginPage } from './pages/Login.tsx';
import { LibraryPage, LikesPage, MyPlaylistPage } from './pages/MyLibrary.tsx';
import { SearchPage } from './pages/Search.tsx';
import { useUi } from './store/ui.ts';

let engineStarted = false;

function Shell() {
  const queueOpen = useUi((s) => s.queueOpen);
  const wide = useMediaQuery('(min-width: 1200px)');
  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();
  useShortcuts();

  useEffect(() => {
    if (!engineStarted) {
      engineStarted = true;
      engine.init();
    }
  }, []);

  // Về đầu trang khi chuyển trang.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto px-4 pb-8 pt-4 scrollbar-thin md:px-8 md:pt-7">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/likes" element={<LikesPage />} />
            <Route path="/me/playlist/:id" element={<MyPlaylistPage />} />
            <Route path="/album/:id" element={<AlbumPage />} />
            <Route path="/artist/:id" element={<ArtistPage />} />
            <Route path="/playlist/:id" element={<YtPlaylistPage />} />
            <Route path="*" element={<EmptyState icon="music" title="Không tìm thấy trang" />} />
          </Routes>
        </main>
        {queueOpen && wide && <QueuePanel variant="aside" />}
      </div>
      <PlayerBar />
      <div className="md:hidden">
        <MiniPlayer />
        <div className="pb-safe bg-sidebar">
          <BottomNav />
        </div>
      </div>
      {queueOpen && !wide && <QueuePanel variant="sheet" />}
      <NowPlaying />
      <TrackMenu />
      <AddToPlaylistDialog />
      <Toasts />
    </div>
  );
}

export function App() {
  const [auth, setAuth] = useState<'checking' | 'in' | 'out'>('checking');

  useEffect(() => {
    setUnauthorizedHandler(() => setAuth('out'));
    api
      .me()
      .then((r) => {
        useUi.setState({ authRequired: r.authRequired });
        setAuth(r.authenticated ? 'in' : 'out');
      })
      // Không hỏi được server thì vẫn mở app; từng trang sẽ tự báo lỗi.
      .catch(() => setAuth('in'));
  }, []);

  if (auth === 'checking') {
    return (
      <div className="flex h-full items-center justify-center" aria-busy="true">
        <span className="animate-pulse">
          <Logo size={48} hole="#121110" />
        </span>
      </div>
    );
  }
  if (auth === 'out') return <LoginPage onSuccess={() => setAuth('in')} />;
  return <Shell />;
}
