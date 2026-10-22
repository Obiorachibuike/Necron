import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-[var(--muted)]">
      <Loader2 className={cn("h-4 w-4 animate-spin", className)} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulsebar rounded-lg bg-[var(--surface-2)]", className)} />;
}

export function Alert({
  tone = "info", title, children, className,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = tone === "danger" || tone === "warning" ? AlertTriangle
    : tone === "success" ? CheckCircle2 : Info;
  const toneClass = {
    info: "border-[var(--info)]/40 bg-[var(--info)]/10",
    warning: "border-[var(--warning)]/40 bg-[var(--warning)]/10",
    danger: "border-[var(--danger)]/40 bg-[var(--danger)]/10",
    success: "border-[var(--success)]/40 bg-[var(--success)]/10",
  }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-xl border p-4", toneClass, className)}>
      <div className="flex gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 text-sm">
          {title ? <p className="font-semibold">{title}</p> : null}
          <div className={cn(title && "mt-1", "text-[var(--muted)]")}>{children}</div>
        </div>
      </div>
    </div>
  );
}

export function Progress({
  value, label, indeterminate = false,
}: { value?: number | null; label?: string; indeterminate?: boolean }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
        <span>{label ?? "Progress"}</span>
        {!indeterminate && value !== null && value !== undefined ? <span>{value}%</span> : null}
      </div>
      <div
        role="progressbar"
        aria-label={label ?? "Progress"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : value ?? undefined}
        className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]"
      >
        <div
          className={cn(
            "h-full rounded-full bg-neon transition-[width] duration-500",
            indeterminate && "w-1/3 animate-pulsebar"
          )}
          style={indeterminate ? undefined : { width: `${Math.max(0, Math.min(100, value ?? 0))}%` }}
        />
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon, title, description, action,
}: { icon?: React.ElementType; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-10 text-center">
      {Icon ? <Icon className="mb-3 h-8 w-8 text-[var(--muted)]" aria-hidden="true" /> : null}
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-[var(--muted)]">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function StatCard({
  label, value, hint, icon: Icon, tone,
}: {
  label: string; value: React.ReactNode; hint?: string; icon?: React.ElementType;
  tone?: "neon" | "info" | "warning" | "success";
}) {
  const toneClass = tone === "neon" ? "text-[var(--brand)]"
    : tone === "info" ? "text-[var(--info)]"
    : tone === "warning" ? "text-[var(--warning)]"
    : tone === "success" ? "text-[var(--success)]" : "text-[var(--muted)]";
  return (
    <div className="cp-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
        {Icon ? <Icon className={cn("h-4 w-4", toneClass)} aria-hidden="true" /> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p> : null}
    </div>
  );
}

export function PageHeader({
  title, description, actions, eyebrow,
}: { title: string; description?: string; actions?: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? (
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--brand)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Section({
  title, description, children, actions, className,
}: {
  title: string; description?: string; children: React.ReactNode;
  actions?: React.ReactNode; className?: string;
}) {
  return (
    <section className={cn("cp-card p-5", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? <p className="mt-1 text-sm text-[var(--muted)]">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
