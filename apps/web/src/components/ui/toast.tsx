"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "success" | "error" | "info" | "warning";
type ToastItem = { id: string; title: string; description?: string; tone: Tone };

type ToastContextValue = {
  toast: (input: { title: string; description?: string; tone?: Tone; duration?: number }) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}

const ICONS: Record<Tone, React.ElementType> = {
  success: CheckCircle2,
  error: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
};

const TONES: Record<Tone, string> = {
  success: "border-[var(--success)]/50",
  error: "border-[var(--danger)]/60",
  warning: "border-[var(--warning)]/60",
  info: "border-[var(--info)]/50",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = React.useCallback(
    ({ title, description, tone = "info", duration = 6000 }: {
      title: string; description?: string; tone?: Tone; duration?: number;
    }) => {
      const id = crypto.randomUUID();
      setItems((current) => [...current.slice(-4), { id, title, description, tone }]);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss]
  );

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[80] flex flex-col items-end gap-2 sm:left-auto sm:w-full sm:max-w-sm"
      >
        {items.map((item) => {
          const Icon = ICONS[item.tone];
          return (
            <div
              key={item.id}
              role="status"
              className={cn(
                "pointer-events-auto w-full animate-fade-in rounded-xl border bg-[var(--surface)] p-4 shadow-lg",
                TONES[item.tone]
              )}
            >
              <div className="flex gap-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{item.title}</p>
                  {item.description ? (
                    <p className="mt-1 text-sm text-[var(--muted)]">{item.description}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  aria-label="Dismiss notification"
                  className="rounded p-1 text-[var(--muted)] hover:text-[var(--fg)]"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
