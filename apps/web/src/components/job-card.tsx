import Link from "next/link";
import { ArrowUpRight, Building2, MapPin, Wallet } from "lucide-react";
import type { Job } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { MatchScore } from "@/components/match-score";
import { formatDate, formatMoney, relativeTime } from "@/lib/utils";

export function JobCard({ job, compact = false }: { job: Job; compact?: boolean }) {
  return (
    <article className="cp-card group flex flex-col p-4 transition-colors hover:border-[#39FF14]/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/jobs/${job.id}`} className="block truncate text-sm font-semibold hover:underline">
            {job.title}
          </Link>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-[var(--muted)]">
            <Building2 className="h-3 w-3 shrink-0" aria-hidden="true" />
            {job.company || "Company not stated"}
          </p>
        </div>
        {job.has_match || job.match ? (
          <MatchScore score={job.match?.overall_score ?? job.match_score} category={job.match?.category ?? job.match_category} size="sm" />
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-[var(--muted)]">
        {job.location ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" aria-hidden="true" /> {job.location}
          </span>
        ) : null}
        {job.work_arrangement && job.work_arrangement !== "unknown" ? (
          <Badge>{job.work_arrangement}</Badge>
        ) : null}
        {job.employment_type && job.employment_type !== "unknown" ? (
          <Badge>{job.employment_type.replace(/_/g, " ")}</Badge>
        ) : null}
      </div>

      {!compact && job.skills.length ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {job.skills.slice(0, 5).map((skill) => (
            <Badge key={skill} tone={job.match?.matched_skills?.includes(skill) ? "neon" : "neutral"}>
              {skill}
            </Badge>
          ))}
          {job.skills.length > 5 ? <Badge>+{job.skills.length - 5}</Badge> : null}
        </div>
      ) : null}

      <div className="mt-4 flex items-end justify-between gap-2 border-t pt-3">
        <div className="text-xs text-[var(--muted)]">
          {job.salary_min || job.salary_max ? (
            <span className="flex items-center gap-1">
              <Wallet className="h-3 w-3" aria-hidden="true" />
              {job.salary_min ? formatMoney(job.salary_min, job.salary_currency) : "—"}
              {" – "}
              {job.salary_max ? formatMoney(job.salary_max, job.salary_currency) : "—"}
            </span>
          ) : (
            <span>Salary not stated</span>
          )}
          <span className="mt-1 block">
            {job.posted_at ? `Posted ${formatDate(job.posted_at)}` : `Added ${relativeTime(job.created_at)}`}
          </span>
        </div>
        <Link href={`/jobs/${job.id}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand)] hover:underline">
          Review <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
