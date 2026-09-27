import { useToasts } from '../store/toast.ts';
import { Icon } from './Icon.tsx';

/** Thông báo dạng toast, nằm trên thanh player. */
export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[152px] z-50 flex flex-col items-center gap-2 px-4 md:bottom-[104px]">
      {toasts.map((t) =>
        t.kind === 'error' ? (
          <div
            key={t.id}
            role="alert"
            className="pointer-events-auto flex w-full max-w-[440px] items-start gap-3 rounded-xl border border-danger-line bg-[#2a1a14] p-4 shadow-2xl"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {t.title && <span className="text-sm font-semibold">{t.title}</span>}
              <span className="text-[13px] leading-relaxed text-danger">{t.message}</span>
            </div>
            <button type="button" aria-label="Đóng thông báo" onClick={() => dismiss(t.id)} className="-m-1 flex h-8 w-8 items-center justify-center text-muted hover:text-ink">
              <Icon name="close" size={16} />
            </button>
          </div>
        ) : (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex max-w-[440px] items-center gap-4 rounded-lg bg-ink py-3 pl-4 pr-2 text-sm font-medium text-bg shadow-2xl"
          >
            <span className="min-w-0 flex-1">{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.run();
                  dismiss(t.id);
                }}
                className="h-8 shrink-0 rounded-md px-3 font-bold text-[#8a5a10] hover:bg-black/5"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ),
      )}
    </div>
  );
}
