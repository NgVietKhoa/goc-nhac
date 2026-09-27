import { useState } from 'react';
import { Logo } from '../components/Icon.tsx';
import { api, ApiError } from '../lib/api.ts';

export function LoginPage({ onSuccess }: { onSuccess(): void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.login(password);
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không đăng nhập được, thử lại sau.');
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-full items-center justify-center bg-bg p-4">
      <form onSubmit={submit} className="flex w-full max-w-[400px] flex-col gap-7 rounded-[18px] border border-line-strong bg-s1 p-8 md:p-10">
        <div className="flex flex-col items-center gap-3.5 text-center">
          <Logo size={56} hole="#1a1815" />
          <h1 className="font-display text-[30px] font-bold tracking-tight">Góc Nhạc</h1>
          <span className="text-sm text-muted">Nhập mật khẩu để mở khóa trình phát của bạn.</span>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="pw" className="text-[13px] font-semibold">
            Mật khẩu
          </label>
          <input
            id="pw"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'pw-error' : undefined}
            className={`h-12 rounded-[10px] border-[1.5px] bg-bg px-3.5 text-base outline-none ${error ? 'border-danger-line' : 'border-s4 focus:border-accent'}`}
          />
          {error && (
            <span id="pw-error" role="alert" className="text-[13px] text-danger">
              {error}
            </span>
          )}
        </div>
        <button type="submit" disabled={busy || !password} className="h-12 rounded-[10px] bg-accent text-[15px] font-bold text-accent-ink disabled:opacity-60">
          {busy ? 'Đang mở khóa…' : 'Mở khóa'}
        </button>
        <span className="text-center text-xs leading-relaxed text-muted">Trình duyệt này sẽ được ghi nhớ, bạn không cần nhập lại mỗi lần mở.</span>
      </form>
    </main>
  );
}
