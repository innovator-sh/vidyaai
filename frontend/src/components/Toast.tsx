import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, Warning, X } from 'phosphor-react';

export type ToastKind = 'error' | 'success';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const AUTO_DISMISS_MS = 6000;
const MAX_TOASTS = 4;

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-(MAX_TOASTS - 1)), { id, kind, message }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS),
      );
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  return { toasts, push, dismiss };
}

export function ToastRegion({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  const { t } = useTranslation();
  return (
    <div className="toast-region" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          {toast.kind === 'error' ? <Warning size={18} weight="fill" /> : <CheckCircle size={18} weight="fill" />}
          <span className="toast-message">{toast.message}</span>
          <button type="button" className="toast-close" onClick={() => onDismiss(toast.id)} aria-label={t('kb.dismissToast')}>
            <X size={14} weight="bold" />
          </button>
        </div>
      ))}
    </div>
  );
}
