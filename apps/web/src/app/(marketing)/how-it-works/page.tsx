import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight, CheckCircle2, CircleAlert, FileCheck2, Gauge, KeyRound,
  ListChecks, LockKeyhole, Search, ShieldCheck, Target, Upload, UserRoundCheck,
} from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "How it works" };

const STEPS = [
  {
    icon: Upload,
    title: "1. Create your account and start onboarding",
    body: "Registration creates a server-side session and a CSRF token. Onboarding has 11 steps: goals, personal details, target roles, locations, experience, education, skills, projects, certifications and achievements, CV import, then review.",
    detail: "A CV import parses PDF or DOCX text and proposes structured fields. Nothing is written to your profile until you approve each item. Imports are marked as awaiting review, then applied-and-reviewed.",
  },
  {
    icon: UserRoundCheck,
    title: "2. Confirm what is true",
    body: "Every entity carries a provenance value and a verified flag. Expert-level skills require written evidence. Dates are validated, current roles cannot have an end date, and every record remains editable.",
    detail: "Documents are built only from verified records. AI suggestions are stored as AI-suggested or unverified and never silently promoted.",
  },
  {
    icon: Search,
    title: "3. Discover and import roles",
    body: "Add public Greenhouse or Lever boards, run saved searches, or import a job by URL or description. URL fetching is SSRF-protected: http/https only, standard ports, public IPs only, validated redirects and a size cap.",
    detail: "If a site cannot be fetched, the app asks for a pasted description instead of inventing a listing. Every saved job is deduplicated per user.",
  },
  {
    icon: Gauge,
    title: "4. Read the match, not just the number",
    body: "The matcher scores nine weighted categories from your confirmed profile and the extracted job requirements. You can expand each category to see its rationale and the skills that matched or are missing.",
    detail: "The deterministic score is authoritative. If AI is configured, it may add an explanation, but it cannot overwrite the score or the evidence.",
  },
  {
    icon: Target,
    title: "5. Approve an application strategy",
    body: "The strategy lists the experience, projects and skills to lead with, plus highlights, gaps and keywords. Edit anything, then approve it. Generation is blocked until the strategy is approved.",
    detail: "This prevents the common failure mode where a model picks impressive-sounding but irrelevant evidence.",
  },
  {
    icon: FileCheck2,
    title: "6. Draft → review → revise",
    body: "The draft is produced deterministically or by your configured provider. A separate review pass checks grounding, unsupported numbers, placeholders, structure and tone. Findings are stored with severity and location.",
    detail: "Critical findings — for example an unsupported metric or a missing section — block approval. Revision loops apply findings without adding new facts. Every version and review is retained.",
  },
  {
    icon: LockKeyhole,
    title: "7. Approve deliberately, export validated files",
    body: "Approval is an explicit action that records a timestamp. PDF and DOCX files are rendered, then validated (page count, text presence, ZIP structure for DOCX). Downloads use short-lived signed links or your authenticated session.",
    detail: "CareerPilot never submits an application for you. The tracker records what you did; it does not act on your behalf.",
  },
  {
    icon: ListChecks,
    title: "8. Run the search as a system",
    body: "Track applications through 11 statuses, set reminders, review weekly activity, practise interviews, and read insights only where sample sizes allow.",
    detail: "Background tasks report queued, running, completed, failed or cancelled — with progress only at real checkpoints.",
  },
];

const GUARANTEES = [
  ["No fabricated qualifications", "Documents use verified profile data. Unsupported numbers are flagged by the reviewer."],
  ["No silent master-CV overwrite", "Edits create versions; restores create a new version rather than rewriting history."],
  ["No automatic submission", "The product prepares materials and tracks your actions. It never applies on your behalf."],
  ["No hidden AI transmission", "A provider must be configured and the disclosure accepted before any prompt is sent."],
  ["No fake progress", "Task progress maps to named stages. Failures surface with an error and retry option."],
  ["No invented job listings", "Jobs come from your sources, imports, or manual entry — not synthetic inventory."],
];

export default function HowItWorksPage() {
  return (
    <div>
      <section className="border-b bg-[var(--surface)]">
        <div className="container py-14">
          <Badge tone="neon">End-to-end workflow</Badge>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Eight stages, each with a gate.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-[var(--muted)]">
            CareerPilot is intentionally slower at the points where speed creates risk: verification,
            strategy approval, document approval and export.
          </p>
        </div>
      </section>

      <div className="container grid gap-10 py-12 lg:grid-cols-[1fr_320px]">
        <ol className="space-y-5">
          {STEPS.map((step) => (
            <li key={step.title} className="cp-card p-5">
              <div className="flex gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]">
                  <step.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-base font-semibold">{step.title}</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{step.body}</p>
                  <p className="mt-2 rounded-lg bg-[var(--surface-2)] p-3 text-xs leading-relaxed text-[var(--muted)]">
                    {step.detail}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="cp-card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" /> Product guarantees
            </h2>
            <ul className="mt-3 space-y-3">
              {GUARANTEES.map(([title, body]) => (
                <li key={title} className="flex items-start gap-2 text-xs">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brand)]" aria-hidden="true" />
                  <span><strong className="font-semibold">{title}.</strong>{" "}
                    <span className="text-[var(--muted)]">{body}</span></span>
                </li>
              ))}
            </ul>
          </div>
          <div className="cp-card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <CircleAlert className="h-4 w-4 text-[var(--warning)]" aria-hidden="true" /> What needs configuration
            </h2>
            <ul className="mt-3 space-y-2 text-xs text-[var(--muted)]">
              <li><strong className="text-[var(--fg)]">Email:</strong> SMTP credentials. Without them, verification and reset links are shown in development mode only.</li>
              <li><strong className="text-[var(--fg)]">AI:</strong> a provider key or a reachable Ollama endpoint. Deterministic features work without either.</li>
              <li><strong className="text-[var(--fg)]">Job boards:</strong> a valid Greenhouse board token or Lever site name for the companies you want to follow.</li>
            </ul>
          </div>
          <div className="cp-card p-5">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <KeyRound className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" /> Independent by design
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              The product runs on your own FastAPI and PostgreSQL stack. It has no dependency on an
              external agent or hosted inference service.
            </p>
          </div>
        </aside>
      </div>

      <section className="container pb-14">
        <div className="cp-card flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-semibold">See it with your own history</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Install for Windows, macOS or Linux. Onboarding takes a few minutes and can be resumed.</p>
          </div>
          <Link href="/download" className={buttonStyles({ size: "lg" })}>
            Download CareerPilot <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
