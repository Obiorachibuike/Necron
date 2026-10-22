import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight, BriefcaseBusiness, CalendarClock, FileCheck2, FileText, Gauge,
  Globe2, GraduationCap, KeyRound, Layers, ListChecks, MessagesSquare, Route,
  Search, ShieldCheck, Sparkles, Target, Users, Wand2,
} from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Features" };

const GROUPS = [
  {
    title: "Career knowledge base",
    icon: Layers,
    intro: "One structured source of truth for every claim you make about yourself.",
    points: [
      "Profile, work experience, education, skills, projects, certifications and achievements",
      "Provenance on every record: user-confirmed, imported, document-extracted, AI-suggested or unverified",
      "Per-entity verification controls and a 'verified skills' view",
      "Completeness scoring that tells you what is missing, not a vanity percentage",
      "Optional fields for phone and location in documents",
    ],
  },
  {
    title: "Job discovery",
    icon: Search,
    intro: "Collect roles from sources you choose — no invented listings or hidden scraping.",
    points: [
      "Greenhouse public board adapter (boards-api.greenhouse.io)",
      "Lever public postings adapter (api.lever.co)",
      "Manual job entry with structured requirements",
      "URL import with SSRF-safe fetching and manual-description fallback",
      "Saved searches, scheduled discovery, and per-source health status",
    ],
  },
  {
    title: "Explainable matching",
    icon: Gauge,
    intro: "A score you can audit, with a deterministic implementation that never requires AI.",
    points: [
      "Nine categories with fixed weights: skills 30, experience 18, location 12, education 8, projects 8, employment type 5, salary 5, certifications 4, industry 3",
      "Strong match ≥80, worth considering ≥60, stretch ≥40, below that low alignment",
      "Matched and missing skills derived from the job and confirmed profile skills",
      "Rationale text per category, plus strengths and gaps",
      "Optional AI explanation that is clearly labelled and cannot change the deterministic score",
    ],
  },
  {
    title: "Application Studio",
    icon: Route,
    intro: "A gated pipeline from evidence to export, with human approval at every irreversible step.",
    points: [
      "Select experience, projects and skills; edit positioning, highlights, gaps and keywords",
      "Strategy approval is required before generation",
      "Multi-stage drafting: deterministic or AI, then an independent review pass",
      "Severity-ranked findings: critical, warning, info — critical findings block approval",
      "Revision applies findings without introducing new facts; every version is preserved",
      "Exports: PDF, DOCX, TXT and TeX, validated after rendering",
    ],
  },
  {
    title: "Cover letters",
    icon: FileText,
    intro: "Specific, evidence-backed letters that are not a restatement of the CV.",
    points: [
      "Structure: opening, evidence paragraphs, motivation, closing",
      "Grounded sentence selection from verified experience and projects",
      "Unsupported-number detection and placeholder checks",
      "Separate tone and length controls from the CV",
      "Same review, approval and export gates as the CV",
    ],
  },
  {
    title: "Interview coach",
    icon: MessagesSquare,
    intro: "Practice deliberately, with rubrics rather than vague encouragement.",
    points: [
      "Eight question categories: introduction, behavioural, technical, role-specific, motivation, culture, problem solving, questions to ask",
      "STAR-aware scoring with deterministic feedback",
      "Technical accuracy is left unscored unless an AI evaluator is configured",
      "Follow-up prompts, session notes and a completion summary",
      "No claims of real interviews or recruiter feedback",
    ],
  },
  {
    title: "Application tracker",
    icon: BriefcaseBusiness,
    intro: "Track reality, not aspirations.",
    points: [
      "Eleven statuses from saved through offer, rejected, withdrawn and closed",
      "Kanban, table and calendar views with accessible status changes",
      "Reminders with due dates, overdue detection and a notification ledger",
      "Response rate calculated from recorded events, with the denominator shown",
      "Source breakdown and eight-week activity chart from real timestamps",
    ],
  },
  {
    title: "Career insights",
    icon: Sparkles,
    intro: "Insights appear only when the sample is large enough to mean something.",
    points: [
      "Demand for your verified skills across saved and matched jobs",
      "Common gap patterns by job title, industry and source",
      "Review-finding patterns across your documents",
      "Sample size, calculation and confidence shown for every insight",
      "Minimum sample thresholds instead of fabricated percentages",
    ],
  },
  {
    title: "AI provider settings",
    icon: Wand2,
    intro: "Bring an OpenAI-compatible endpoint or run a local model. Or use no AI at all.",
    points: [
      "OpenAI-compatible and Ollama adapters with configurable base URL and model",
      "Keys encrypted with Fernet; only a hint is ever returned",
      "Per-task model routing and fallback model",
      "Connection tests with latency and sanitised error messages",
      "Per-request usage ledger with token counts, latency and optional estimated cost",
      "Daily token cap, monthly limit and request limits",
    ],
  },
  {
    title: "Privacy and account control",
    icon: ShieldCheck,
    intro: "Data portability and deletion are product features, not support tickets.",
    points: [
      "One-click JSON export of profile, jobs, documents, applications, interviews and usage",
      "Account deletion requiring password plus an explicit DELETE confirmation",
      "Session list with individual revocation and revoke-all-others",
      "Theme preference persisted in a cookie, never used for tracking",
      "No third-party analytics or advertising scripts",
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div>
      <section className="border-b bg-[var(--surface)]">
        <div className="container py-14">
          <Badge tone="neon">Product capabilities</Badge>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Ten modules. One evidence chain.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-[var(--muted)]">
            Everything below is implemented in this codebase. Nothing is described as available
            unless the matching API, UI and persistence layer exist. Integrations that need
            credentials (SMTP, AI providers) are marked as such in the settings screens.
          </p>
        </div>
      </section>
      <div className="container space-y-10 py-12">
        {GROUPS.map((group) => (
          <section key={group.title} className="grid gap-6 lg:grid-cols-[0.4fr_0.6fr]">
            <div>
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]">
                <group.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="mt-3 text-xl font-semibold">{group.title}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{group.intro}</p>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {group.points.map((point) => (
                <li key={point} className="flex items-start gap-2 rounded-xl border bg-[var(--surface)] p-3 text-sm">
                  <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand)]" aria-hidden="true" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className="border-y bg-[var(--surface)]">
        <div className="container py-12">
          <h2 className="text-2xl font-semibold tracking-tight">Interface and accessibility</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Layers, title: "Light, dark and system themes", body: "Persisted server-readable cookie, no flash, and reduced-motion support." },
              { icon: Globe2, title: "Responsive layouts", body: "Mobile drawers, stacked forms, horizontal tables and keyboard-readable navigation." },
              { icon: Users, title: "Multi-user isolation", body: "Every query is scoped to the authenticated user; cross-user access returns 404." },
              { icon: KeyRound, title: "Accessible by construction", body: "Visible focus, labels, error text, ARIA status announcements, no colour-only statuses." },
            ].map((item) => (
              <div key={item.title} className="cp-card p-4">
                <item.icon className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" />
                <p className="mt-2 text-sm font-semibold">{item.title}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container py-12">
        <div className="cp-card flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-semibold">Ready to see your own evidence chain?</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Start with the free workspace. No provider required.</p>
          </div>
          <Link href="/sign-up" className={buttonStyles({ size: "lg" })}>
            Create account <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
