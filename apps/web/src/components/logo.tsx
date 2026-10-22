import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Link href="/" aria-label="CareerPilot AI home"
          className={cn("group inline-flex items-center gap-2.5 rounded-lg", className)}>
      <span className="relative grid h-8 w-8 place-items-center rounded-lg bg-neon text-neon-ink shadow-glow">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none">
          <path d="M4 18 12 4l8 14-8-4-8 4Z" fill="currentColor" />
          <path d="M12 10v8" stroke="#061007" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      {!compact ? (
        <span className="text-[15px] font-semibold tracking-tight">
          CareerPilot <span className="text-[var(--brand)]">AI</span>
        </span>
      ) : null}
    </Link>
  );
}
