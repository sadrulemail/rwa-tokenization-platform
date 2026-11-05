"use client";

import { CheckCircle2, Info, TriangleAlert, X, XCircle } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

type Tone = "success" | "error" | "warning" | "info";
type Toast = { id: number; tone: Tone; title: string; body?: string };

const ToastContext = createContext<{ push: (t: Omit<Toast, "id">) => void }>({ push: () => {} });

const ICONS = { success: CheckCircle2, error: XCircle, warning: TriangleAlert, info: Info };
const TONES: Record<Tone, string> = {
  success: "border-teal-200 bg-teal-50 text-teal-900",
  error: "border-rose-200 bg-rose-50 text-rose-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-slate-200 bg-white text-slate-900",
};

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = Date.now() + Math.random();
      setToasts((all) => [...all.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), t.tone === "error" ? 9_000 : 5_000);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:left-auto sm:w-96">
        {toasts.map((t) => {
          const Icon = ICONS[t.tone];
          return (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto flex w-full gap-3 rounded-xl border p-3 shadow-lg ${TONES[t.tone]}`}
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t.title}</p>
                {t.body && <p className="mt-0.5 break-words text-sm opacity-80">{t.body}</p>}
              </div>
              <button onClick={() => dismiss(t.id)} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
