import Link from "next/link";
import {
  ArrowRight, BadgeCheck, BrainCircuit, BriefcaseBusiness, CalendarClock,
  FileCheck2, FileText, Gauge, KeyRound, Layers, ListChecks, LockKeyhole,
  MessagesSquare, Route, Search, ShieldCheck, Sparkles, Target, Wand2,
} from "lucide-react";
import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import { buttonStyles } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const FEATURES = [
  {
    icon: Layers,
    title: "A career knowledge base, not a text box",
    body: "Structured experience, education, projects, skills, certifications and preferences. Each claim carries provenance and a verification state.",
  },
  {
    icon: Search,
    title: "Job discovery with real adapters",
    body: "Connect public Greenhouse or Lever boards, import a posting by URL with SSRF-safe fetching, or paste a description. Nothing is scraped beyond what you ask for.",
  },
  {
    icon: Gauge,
    title: "Explainable matching",
    body: "Nine weighted categories produce a score and a written rationale. You see matched skills, missing skills, and the exact evidence behind every point.",
  },
  {
    icon: Route,
    title: "Application strategy before drafting",
    body: "Choose which experience and projects to lead with. Review gaps and keywords, then approve the strategy that will constrain the draft.",
  },
  {
    icon: FileCheck2,
    title: "Draft → independent review → revision",
    body: "A separate reviewer checks grounding, unsupported numbers, placeholders and structure. Critical findings block approval until resolved.",
  },
  {
    icon: FileText,
    title: "Eight genuinely different CV templates",
    body: "ATS, modern developer, full-stack, backend, AI, mobile, graduate and academic layouts rendered to PDF and DOCX, with validated exports.",
  },
  {
    icon: MessagesSquare,
    title: "Interview practice with a rubric",
    body: "Question banks across eight categories, STAR-based feedback, follow-up prompts, and session summaries that separate practice from real interviews.",
  },
  {
    icon: BriefcaseBusiness,
    title: "A tracker that tells the truth",
    body: "Kanban, table and calendar views, reminders, deadlines, and statistics calculated from your actual application events.",
  },
  {
    icon: Wand2,
    title: "Bring your own AI — or none",
    body: "OpenAI-compatible or local Ollama endpoints, encrypted keys, per-task model routing, usage logs and monthly token limits.",
  },
];

const TEMPLATES = [
  ["ATS", "Single column, conventional headings, maximum parser compatibility."],
  ["Modern developer", "Clean two-column with a technical skills rail."],
  ["Full-stack engineer", "Project-forward layout for end-to-end builders."],
  ["Backend engineer", "Experience-led with APIs, data and reliability emphasis."],
  ["AI engineer", "Research and applied ML framing with model tooling."],
  ["Mobile developer", "Store releases and platform skills up front."],
  ["Graduate", "Education-first for early-career applicants."],
  ["Academic", "Publications-friendly, measured and formal."],
];

const STEPS = [
  ["Build your source of truth", "Import or enter your history once. Mark what is verified; unverified items never become facts in a document."],
  ["Find and understand roles", "Discover jobs, read the structured requirements, and see an explainable match before you spend time applying."],
  ["Approve a strategy", "Select the evidence that fits. The strategy is editable and must be approved before drafting."],
  ["Draft, review, approve, export", "Generate a tailored CV and letter, resolve review findings, approve deliberately, then download validated files."],
];

export default function LandingPage() {
  return (
    <div>
      <PublicHeader />
      <main id="main-content">
        {/* Hero */}
        <section className="relative overflow-hidden border-b">
          <div aria-hidden="true"
               className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(57,255,20,0.11),transparent_55%)]" />
          <div className="container relative grid gap-10 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
            <div>
              <Badge tone="neon" className="mb-5">
                <Sparkles className="h-3 w-3" aria-hidden="true" /> Evidence-first career workspace
              </Badge>
              <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                Your career is not a prompt.
                <span className="block text-[var(--brand)]">Build it on evidence.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--muted)] sm:text-lg">
                CareerPilot AI keeps your verified experience, tailors applications honestly, and
                shows you exactly why a job is worth your time — without inventing a single metric.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/sign-up" className={buttonStyles({ size: "lg" })}>
                  Start free <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link href="/how-it-works" className={buttonStyles({ variant: "outline", size: "lg" })}>
                  See the workflow
                </Link>
              </div>
              <ul className="mt-8 grid gap-2 text-sm text-[var(--muted)] sm:grid-cols-2">
                {[
                  "No fabricated achievements",
                  "No invented job listings",
                  "No AI required",
                  "No key ever sent to the browser",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <BadgeCheck className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" /> {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Product preview — structural, no fabricated statistics */}
            <div className="relative">
              <div aria-hidden="true" className="absolute -inset-6 rounded-[2rem] bg-[#39FF14]/5 blur-2xl" />
              <div className="relative rounded-2xl border bg-[var(--surface)] p-4 shadow-glow">
                <div className="flex items-center justify-between border-b pb-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#39FF14]" />
                    <span className="text-xs font-semibold">Application Studio</span>
                  </div>
                  <span className="rounded-full border px-2 py-0.5 text-[10px] text-[var(--muted)]">
                    Product preview
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold">Match breakdown</p>
                      <span className="text-[10px] text-[var(--muted)]">weights sum to 100</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {[
                        ["Technical skills", 30], ["Relevant experience", 18],
                        ["Location / arrangement", 12], ["Education", 8],
                        ["Projects", 8], ["Employment type", 5],
                      ].map(([label, weight]) => (
                        <div key={String(label)} className="flex items-center gap-3 text-[11px]">
                          <span className="w-36 shrink-0 text-[var(--muted)]">{label}</span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                            <div className="h-full rounded-full bg-[#39FF14]"
                                 style={{ width: `${Number(weight) * 3}%` }} />
                          </div>
                          <span className="w-8 text-right tabular-nums text-[var(--muted)]">{weight}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border p-3">
                      <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Evidence gate</p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs font-medium">
                        <LockKeyhole className="h-3.5 w-3.5 text-[var(--brand)]" aria-hidden="true" />
                        Verified before drafting
                      </p>
                    </div>
                    <div className="rounded-xl border p-3">
                      <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Reviewer</p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs font-medium">
                        <ListChecks className="h-3.5 w-3.5 text-[var(--brand)]" aria-hidden="true" />
                        Critical findings block approval
                      </p>
                    </div>
                  </div>
                  <div className="rounded-xl border p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold">Document pipeline</span>
                      <span className="text-[10px] text-[var(--muted)]">human approval required</span>
                    </div>
                    <ol className="mt-2 flex flex-wrap items-center gap-1 text-[10px] text-[var(--muted)]">
                      {["Draft", "Independent review", "Revise", "Approve", "Validated export"].map((stage, index) => (
                        <li key={stage} className="flex items-center gap-1">
                          <span className="rounded-full border px-2 py-0.5">{stage}</span>
                          {index < 4 ? <ArrowRight className="h-2.5 w-2.5" aria-hidden="true" /> : null}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Principles */}
        <section className="border-b bg-[var(--surface)]">
          <div className="container grid gap-6 py-12 sm:grid-cols-3">
            {[
              { icon: ShieldCheck, title: "Truth over polish",
                body: "Suggestions never auto-become verified facts. Unsupported numbers are flagged, not shipped." },
              { icon: KeyRound, title: "You hold the keys",
                body: "AI is off until configured. Keys are encrypted at rest and never returned by the API." },
              { icon: Target, title: "Decisions, not noise",
                body: "Scores show their inputs. Insights state sample size and calculation — or they are not shown." },
            ].map((item) => (
              <div key={item.title} className="flex gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]">
                  <item.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold">{item.title}</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="container py-16">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">The workspace</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Everything the search actually needs</h2>
            <p className="mt-3 text-sm text-[var(--muted)]">
              Nine connected modules, one career database. No disconnected documents, no invented
              progress bars, no hidden prompts.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="cp-card p-5 transition-colors hover:border-[#39FF14]/40">
                <feature.icon className="h-5 w-5 text-[var(--brand)]" aria-hidden="true" />
                <h3 className="mt-3 text-sm font-semibold">{feature.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Workflow */}
        <section className="border-y bg-[var(--surface)]">
          <div className="container py-16">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">The loop</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight">From raw history to a deliberate application</h2>
                <p className="mt-3 text-sm text-[var(--muted)]">
                  No step is skipped. The strategy constrains the draft, the reviewer constrains
                  approval, and you approve every export.
                </p>
                <Link href="/how-it-works" className={buttonStyles({ variant: "outline", size: "sm" }) + " mt-5"}>
                  Full workflow <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
              <ol className="space-y-4">
                {STEPS.map(([title, body], index) => (
                  <li key={title} className="flex gap-4 rounded-xl border p-4">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#39FF14] text-sm font-bold text-[#061007]">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold">{title}</h3>
                      <p className="mt-1 text-sm text-[var(--muted)]">{body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* Templates */}
        <section className="container py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Templates</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">Eight layouts. Real differences.</h2>
              <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
                Each template changes structure, hierarchy and typography — not just an accent colour.
                Every export is rendered and validated before download.
              </p>
            </div>
            <Badge tone="success"><FileCheck2 className="h-3 w-3" aria-hidden="true" /> PDF + DOCX validated</Badge>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TEMPLATES.map(([name, description]) => (
              <div key={name} className="rounded-xl border bg-[var(--surface)] p-4">
                <div className="mb-3 h-16 rounded-lg border bg-[var(--surface-2)] p-2">
                  <div className="h-1.5 w-1/2 rounded bg-[var(--muted)]/40" />
                  <div className="mt-1.5 h-1 w-full rounded bg-[var(--muted)]/20" />
                  <div className="mt-1 h-1 w-5/6 rounded bg-[var(--muted)]/20" />
                  <div className="mt-1 h-1 w-2/3 rounded bg-[var(--muted)]/20" />
                </div>
                <h3 className="text-sm font-semibold">{name}</h3>
                <p className="mt-1 text-xs text-[var(--muted)]">{description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* AI transparency */}
        <section className="border-y bg-[var(--surface)]">
          <div className="container grid gap-8 py-16 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">AI, on your terms</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">Optional by architecture, not by promise</h2>
              <p className="mt-3 text-sm text-[var(--muted)]">
                Deterministic implementations power matching, strategy, drafting and review. Turn on
                an AI provider to improve language and extraction — with disclosure, per-task model
                routing, and a usage ledger.
              </p>
              <div className="mt-6 space-y-3">
                {[
                  ["Explicit disclosure", "AI transmission requires your confirmation, stored with a timestamp."],
                  ["Encrypted credentials", "API keys are Fernet-encrypted at rest and only decrypted server-side for a request."],
                  ["Local-first option", "Point CareerPilot at Ollama on your own machine; enable private endpoints deliberately."],
                  ["Daily and monthly limits", "Token caps and monthly limits prevent runaway spending; usage is itemised."],
                ].map(([title, body]) => (
                  <div key={title} className="flex gap-3">
                    <BrainCircuit className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand)]" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-semibold">{title}</p>
                      <p className="text-sm text-[var(--muted)]">{body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border bg-[var(--bg)] p-6">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <LockKeyhole className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" />
                Security posture
              </div>
              <ul className="mt-4 space-y-3 text-sm text-[var(--muted)]">
                {[
                  "httpOnly session cookies with server-side revocation",
                  "CSRF double-submit protection on every mutating request",
                  "Argon2id password hashing",
                  "Per-user row scoping enforced in the API layer",
                  "SSRF-safe outbound fetching with DNS and redirect re-validation",
                  "Rate limits on auth, recovery, AI and general endpoints",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brand)]" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-5 rounded-xl border bg-[var(--surface)] p-4 text-xs text-[var(--muted)]">
                Self-hosted deployments keep PostgreSQL and document storage under your control.
                Managed hosting is not claimed by this build.
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="container py-16">
          <div className="relative overflow-hidden rounded-3xl border border-[#39FF14]/30 bg-[#39FF14]/5 p-8 sm:p-12">
            <div aria-hidden="true"
                 className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[#39FF14]/15 blur-3xl" />
            <div className="relative flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight">Build the next application on your own evidence.</h2>
                <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
                  Create an account, complete the 11-step onboarding, and see your first explainable
                  match. Every feature has a deterministic path.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/sign-up" className={buttonStyles({ size: "lg" })}>
                  Create free account <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link href="/pricing" className={buttonStyles({ variant: "outline", size: "lg" })}>
                  View pricing
                </Link>
              </div>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-4 text-xs text-[var(--muted)]">
            <span className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> Reminders and calendar</span>
            <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" aria-hidden="true" /> Master CV versioning</span>
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Export and delete your data</span>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
