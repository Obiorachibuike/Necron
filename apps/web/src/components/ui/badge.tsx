import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeStyles = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      tone: {
        neutral: "border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]",
        neon: "border-[#39FF14]/40 bg-[#39FF14]/10 text-[var(--brand)]",
        success: "border-[var(--success)]/40 bg-[var(--success)]/10 text-[var(--success)]",
        warning: "border-[var(--warning)]/40 bg-[var(--warning)]/10 text-[var(--warning)]",
        danger: "border-[var(--danger)]/40 bg-[var(--danger)]/10 text-[var(--danger)]",
        info: "border-[var(--info)]/40 bg-[var(--info)]/10 text-[var(--info)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export function Badge({
  className, tone, children, ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeStyles>) {
  return (
    <span className={cn(badgeStyles({ tone }), className)} {...props}>
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, VariantProps<typeof badgeStyles>["tone"]> = {
  approved: "success", exported: "success", completed: "success", offer: "success",
  connected: "success", ready_for_approval: "neon", queued: "info", running: "info",
  under_review: "info", applied: "info", interview: "info", assessment: "info",
  draft: "neutral", saved: "neutral", planning: "neutral", closed: "neutral",
  needs_user_confirmation: "warning", revision_required: "warning", warning: "warning",
  ready_to_apply: "neon", failed: "danger", rejected: "danger", cancelled: "neutral",
  withdrawn: "neutral", critical: "danger", error: "danger", in_progress: "info",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const text = label ?? status.replace(/_/g, " ");
  return (
    <Badge tone={STATUS_TONES[status] ?? "neutral"}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      <span className="capitalize">{text}</span>
    </Badge>
  );
}
