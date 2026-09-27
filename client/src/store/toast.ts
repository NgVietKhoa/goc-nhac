import { create } from 'zustand';

export interface Toast {
  id: number;
  title?: string;
  message: string;
  kind: 'info' | 'error';
  action?: { label: string; run: () => void };
}

interface ToastState {
  toasts: Toast[];
  show(toast: Omit<Toast, 'id'>, durationMs?: number): void;
  dismiss(id: number): void;
}

let nextId = 1;

export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],
  show(toast, durationMs = 4500) {
    const id = nextId++;
    set({ toasts: [...get().toasts.slice(-2), { ...toast, id }] });
    window.setTimeout(() => get().dismiss(id), durationMs);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  info: (message: string, action?: Toast['action']) => useToasts.getState().show({ kind: 'info', message, action }),
  error: (message: string, title?: string) => useToasts.getState().show({ kind: 'error', message, title }, 6000),
};

/** Hiện lỗi từ một thao tác bất kỳ. */
export function toastError(err: unknown, fallback = 'Có lỗi xảy ra, thử lại sau.'): void {
  const message = err instanceof Error && err.message ? err.message : fallback;
  toast.error(message);
}
