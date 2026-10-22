import { cn } from "@/lib/utils";

const CATEGORY_LABEL: Record<string, string> = {
  strong_match: "Strong match",
  worth_considering: "Worth considering",
  stretch: "Stretch",
  low_alignment: "Low alignment",
};

const CATEGORY_TONE: Record<string, string> = {
  strong_match: "text-[var(--success)]",
  worth_considering: "text-[var(--brand)]",
  stretch: "text-[var(--warning)]",
  low_alignment: "text-[var(--muted)]",
};

export function MatchScore({
  score, category, size = "md", showBar = true,
}: {
  score: number | null | undefined;
  category?: string | null;
  size?: "sm" | "md" | "lg";
  showBar?: boolean;
}) {
  if (score === null || score === undefined) {
    return <span className="text-xs text-[var(--muted)]">Not scored yet</span>;
  }
  const label = CATEGORY_LABEL[category ?? ""] ?? "Match score";
  const tone = CATEGORY_TONE[category ?? ""] ?? "text-[var(--fg)]";
  const textSize = size === "lg" ? "text-3xl" : size === "sm" ? "text-sm" : "text-xl";
  return (
    <div className="w-full max-w-[190px]">
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn("font-semibold tabular-nums", textSize)}>
          {Math.round(score)}<span className="text-xs font-normal text-[var(--muted)]">/100</span>
        </span>
        <span className={cn("text-[10px] font-semibold uppercase tracking-wide", tone)}>{label}</span>
      </div>
      {showBar ? (
        <div
          role="img"
          aria-label={`${label}: ${Math.round(score)} out of 100`}
          className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]"
        >
          <div className="h-full rounded-full bg-current"
               style={{ width: `${Math.max(2, Math.min(100, score))}%` }} />
        </div>
      ) : null}
    </div>
  );
}

export function ScoreBreakdown({ breakdown }: {
  breakdown: { category: string; label: string; weight: number; score: number | null;
    rationale: string }[];
}) {
  return (
    <ul className="space-y-3">
      {breakdown.map((item) => (
        <li key={item.category}>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-medium">{item.label}</span>
            <span className="text-[var(--muted)]">
              {item.weight}% weight · {item.score === null ? "not enough data" : `${Math.round(item.score)}/100`}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]"
               role="img"
               aria-label={`${item.label}: ${item.score === null ? "not enough data" : `${Math.round(item.score)} out of 100`}, weight ${item.weight} percent`}>
            <div className={cn("h-full rounded-full", item.score === null ? "bg-[var(--muted)]/30" : "bg-[#39FF14]")}
                 style={{ width: `${item.score === null ? 4 : Math.max(2, Math.min(100, item.score))}%` }} />
          </div>
          {item.rationale ? <p className="mt-1 text-xs text-[var(--muted)]">{item.rationale}</p> : null}
        </li>
      ))}
    </ul>
  );
}
