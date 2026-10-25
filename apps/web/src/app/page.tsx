import Link from "next/link";
import {
  ArrowRight, BadgeCheck, Bell, Command, Download, FileCheck2, Gauge, Layers,
  Link2, LockKeyhole, MonitorSmartphone, RefreshCw, Route, ShieldCheck, Sparkles,
} from "lucide-react";
import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import { DownloadButtons, PrimaryDownloadButton } from "@/components/download-buttons";
import { OsIcon } from "@/components/os-icon";
import { buttonStyles } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DESKTOP_VERSION, PLATFORMS, PLATFORM_ORDER } from "@/lib/desktop";

const DESKTOP_FEATURES = [
  {
    icon: MonitorSmartphone,
    title: "A window that belongs there",
    body: "The workspace gets its own window, a system tray menu with dashboard, tracker and documents, a single-instance rule, and remembered size and position.",
  },
  {
    icon: Bell,
    title: "Native notifications and a badge",
    body: "Background tasks and reminders arrive as OS notifications, and the unread count is read from your server's notification feed — no invented pings.",
  },
  {
    icon: Download,
    title: "Documents land in Downloads",
    body: "Validated PDF and DOCX exports go straight to your Downloads folder with collision-safe names, then a notification offers to reveal the file.",
  },
  {
    icon: Command,
    title: "Menus and real shortcuts",
    body: "Jump to dashboard, discover, tracker, documents, profile or settings with Cmd/Ctrl+1–6, plus zoom, reload and full-screen from the menu bar.",
  },
  {
    icon: Link2,
    title: "Workspace deep links",
    body: "A careerpilot:// link opens the app on a specific workspace address, so a team can share a link to their deployment instead of a browser bookmark.",
  },
  {
    icon: RefreshCw,
    title: "Updates without a browser",
    body: "Installed builds check GitHub Releases in the background and offer Restart & install when the next version is ready. Server migrations stay yours to run.",
  },
];

const WINDOW_NAV = [
  "Dashboard", "Discover jobs", "Application tracker", "Interview coach",
  "Career profile", "Master CV", "Documents", "Settings",
];

export default function LandingPage() {
  return (
    <div>
      <PublicHeader />
      <main id="main-content">
        {/* Hero */}
        <section className="relative overflow-hidden border-b">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(57,255,20,0.12),transparent_56%)]"
          />
          <div className="container relative grid gap-10 py-14 lg:grid-cols-[1.02fr_0.98fr] lg:py-20">
            <div>
              <Badge tone="neon" className="mb-5">
                <Sparkles className="h-3 w-3" aria-hidden="true" /> Desktop app · Windows · macOS · Linux
              </Badge>
              <h1 className="text-4xl font-semibold leading-[1.07] tracking-tight sm:text-5xl lg:text-6xl">
                Your career workspace,
                <span className="block text-[var(--brand)]">as a native desktop app.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--muted)] sm:text-lg">
                CareerPilot Desktop puts your verified profile, explainable job matching and
                review-gated application studio in a window of its own — with a tray, native
                notifications, a proper downloads folder and updates from GitHub Releases.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <PrimaryDownloadButton />
                <Link href="/download" className={buttonStyles({ variant: "outline", size: "lg" })}>
                  All installers <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
              <ul className="mt-7 grid gap-2 text-sm text-[var(--muted)] sm:grid-cols-2">
                {[
                  "Windows, macOS and Linux",
                  "No telemetry or third-party scripts",
                  "Connects to the workspace you run",
                  "Per-user install, no admin rights",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <BadgeCheck className="h-4 w-4 shrink-0 text-[var(--brand)]" aria-hidden="true" /> {item}
                  </li>
                ))}
              </ul>
              <p className="mt-4 max-w-xl text-xs text-[var(--muted)]">
                The desktop app is a client, not a hosted account. You connect it to a CareerPilot
                workspace URL — the same app, opened in a native window.
              </p>
            </div>

            {/* Desktop window mock — structural, labelled, no fabricated metrics */}
            <div className="relative">
              <div aria-hidden="true" className="absolute -inset-6 rounded-[2rem] bg-[#39FF14]/5 blur-2xl" />
              <div className="relative overflow-hidden rounded-2xl border bg-[var(--surface)] shadow-glow">
                <div className="flex items-center gap-2 border-b bg-[var(--surface-2)] px-3 py-2">
                  <span className="flex gap-1.5" aria-hidden="true">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                  </span>
                  <span className="mx-auto rounded-md border bg-[var(--surface)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                    CareerPilot — Dashboard
                  </span>
                  <span className="rounded border px-1.5 py-0.5 text-[9px] text-[var(--muted)]">
                    ⌘K
                  </span>
                </div>
                <div className="grid grid-cols-[132px_1fr]">
                  <aside className="border-r bg-[var(--bg)] p-2">
                    <div className="mb-2 flex items-center gap-1.5 rounded-md bg-[#39FF14]/10 px-2 py-1.5">
                      <span className="h-4 w-4 rounded bg-neon" aria-hidden="true" />
                      <span className="text-[10px] font-semibold">CareerPilot</span>
                    </div>
                    <ul className="space-y-0.5">
                      {WINDOW_NAV.map((item, index) => (
                        <li
                          key={item}
                          className={
                            "flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] " +
                            (index === 0
                              ? "bg-[var(--surface-2)] font-semibold text-[var(--fg)]"
                              : "text-[var(--muted)]")
                          }
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" aria-hidden="true" />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 rounded-md border p-1.5 text-[9px] text-[var(--muted)]">
                      Tray: 3 unread
                    </div>
                  </aside>
                  <div className="space-y-2.5 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-semibold">Application Studio</p>
                        <p className="text-[9px] text-[var(--muted)]">Strategy approved · reviewer required</p>
                      </div>
                      <span className="rounded-full border border-[#39FF14]/40 bg-[#39FF14]/10 px-2 py-0.5 text-[9px] text-[var(--brand)]">
                        Native window
                      </span>
                    </div>
                    <div className="rounded-lg border p-2">
                      <div className="flex items-center justify-between text-[9px]">
                        <span className="font-medium">Match breakdown</span>
                        <span className="text-[var(--muted)]">weights sum to 100</span>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {[
                          ["Technical skills", 30],
                          ["Relevant experience", 18],
                          ["Location / arrangement", 12],
                          ["Education", 8],
                        ].map(([label, weight]) => (
                          <div key={String(label)} className="flex items-center gap-2 text-[9px]">
                            <span className="w-28 shrink-0 text-[var(--muted)]">{label}</span>
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                              <div className="h-full rounded-full bg-[#39FF14]" style={{ width: `${Number(weight) * 3}%` }} />
                            </div>
                            <span className="w-6 text-right tabular-nums text-[var(--muted)]">{weight}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg border p-2">
                        <p className="text-[8px] uppercase tracking-wide text-[var(--muted)]">Evidence gate</p>
                        <p className="mt-0.5 flex items-center gap-1 text-[9px] font-medium">
                          <LockKeyhole className="h-3 w-3 text-[var(--brand)]" aria-hidden="true" /> Verified only
                        </p>
                      </div>
                      <div className="rounded-lg border p-2">
                        <p className="text-[8px] uppercase tracking-wide text-[var(--muted)]">Reviewer</p>
                        <p className="mt-0.5 flex items-center gap-1 text-[9px] font-medium">
                          <FileCheck2 className="h-3 w-3 text-[var(--brand)]" aria-hidden="true" /> Blocks approval
                        </p>
                      </div>
                    </div>
                    <div className="rounded-lg border p-2">
                      <div className="flex items-center justify-between text-[9px]">
                        <span className="font-medium">Document pipeline</span>
                        <span className="text-[var(--muted)]">human approval</span>
                      </div>
                      <ol className="mt-1.5 flex flex-wrap items-center gap-1 text-[8px] text-[var(--muted)]">
                        {["Draft", "Review", "Revise", "Approve", "Export"].map((stage, index) => (
                          <li key={stage} className="flex items-center gap-1">
                            <span className="rounded-full border px-1.5 py-0.5">{stage}</span>
                            {index < 4 ? <ArrowRight className="h-2 w-2" aria-hidden="true" /> : null}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </div>
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
                <Layers className="h-3 w-3" aria-hidden="true" />
                Product preview — the desktop window renders the real workspace, not a rebuilt mock-up.
              </p>
            </div>
          </div>
        </section>

        {/* Downloads */}
        <section id="download" className="border-b bg-[var(--surface)]">
          <div className="container py-12">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Installers</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight">Download for your desktop</h2>
                <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
                  Version {DESKTOP_VERSION}. Builds come from this repository's release workflow and are
                  attached to GitHub Releases with checksums.
                </p>
              </div>
              <Link href="/download" className={buttonStyles({ variant: "outline", size: "sm" })}>
                Install notes &amp; requirements <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
            <div className="mt-7 max-w-4xl">
              <DownloadButtons />
            </div>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--muted)]">
              {PLATFORM_ORDER.map((platform) => (
                <span key={platform} className="flex items-center gap-1.5">
                  <OsIcon os={platform} className="h-3.5 w-3.5" />
                  {PLATFORMS[platform].label}: {PLATFORMS[platform].requirement}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* What the shell adds */}
        <section className="container py-16">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Desktop shell</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">What a native window actually adds</h2>
            <p className="mt-3 text-sm text-[var(--muted)]">
              Not a second product. The same CareerPilot workspace, wrapped in the parts a browser
              tab cannot give you — implemented in the desktop shell, not promised on a roadmap.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DESKTOP_FEATURES.map((feature) => (
              <div key={feature.title} className="cp-card p-5 transition-colors hover:border-[#39FF14]/40">
                <feature.icon className="h-5 w-5 text-[var(--brand)]" aria-hidden="true" />
                <h3 className="mt-3 text-sm font-semibold">{feature.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="border-y bg-[var(--surface)]">
          <div className="container py-16">
            <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Three steps</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight">From installer to your own data</h2>
                <p className="mt-3 text-sm text-[var(--muted)]">
                  The app never asks for a CareerPilot-hosted account and never proxies your data.
                  Point it at a workspace you trust, then use the account you already have there.
                </p>
                <Link href="/how-it-works" className={buttonStyles({ variant: "outline", size: "sm" }) + " mt-5"}>
                  See the full workflow <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
              <ol className="space-y-4">
                {[
                  ["Install for your platform", "Pick the Windows, macOS or Linux build. Each one is a per-user install or a single file; no system dependencies beyond the platform runtime."],
                  ["Connect your workspace", "Paste the URL you use in the browser. The app checks /api/v1/health, then keeps your session in an isolated cookie store on this device."],
                  ["Sign in and keep working", "Same account, same evidence gate, same reviewer rules. Tray, notifications, shortcuts and downloads work because the shell is native."],
                ].map(([title, body], index) => (
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

        {/* Principles */}
        <section className="container py-16">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Same product rules</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">The desktop shell does not soften the gates</h2>
              <p className="mt-3 text-sm text-[var(--muted)]">
                It loads the real application, so the evidence and review rules that run in the
                browser run here too. The shell adds no shortcuts around them.
              </p>
              <div className="mt-6 space-y-3">
                {[
                  { icon: ShieldCheck, title: "Verified before drafted", body: "Unverified imports never become document facts, regardless of window." },
                  { icon: Gauge, title: "Scores you can audit", body: "Weights and rationale come from the server; the shell never calculates or decorates a match." },
                  { icon: Route, title: "Human approval at exports", body: "Critical review findings still block approval before a file can reach Downloads." },
                ].map((item) => (
                  <div key={item.title} className="flex gap-3">
                    <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand)]" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="text-sm text-[var(--muted)]">{item.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border bg-[var(--surface)] p-6">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" />
                Desktop security posture
              </div>
              <ul className="mt-4 space-y-3 text-sm text-[var(--muted)]">
                {[
                  "Remote content runs with Node disabled, context isolation on and a sandboxed renderer",
                  "The workspace page gets no preload bridge; shell IPC is limited to local windows",
                  "Navigation to other origins is blocked and opened in your browser instead",
                  "Camera, microphone and geolocation requests are denied by default",
                  "Downloads are renamed safely and never overwrite an existing file",
                  "No analytics, crash reporting or third-party scripts in the shell",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brand)]" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-5 rounded-xl border bg-[var(--bg)] p-4 text-xs text-[var(--muted)]">
                Honest limits: release builds are not code-signed or notarized yet, and macOS
                automatic updates therefore need a manual replacement. The download page states
                this next to each installer.
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="container pb-16">
          <div className="relative overflow-hidden rounded-3xl border border-[#39FF14]/30 bg-[#39FF14]/5 p-8 sm:p-12">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[#39FF14]/15 blur-3xl"
            />
            <div className="relative flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight">Install it once. Keep your evidence.</h2>
                <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
                  Version {DESKTOP_VERSION} for Windows, macOS and Linux. After installing, connect the
                  workspace URL you already use — same account, same review gates, same documents.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <PrimaryDownloadButton />
                <Link href="/download" className={buttonStyles({ variant: "outline", size: "lg" })}>
                  Install notes
                </Link>
              </div>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-4 text-xs text-[var(--muted)]">
            <span className="flex items-center gap-1.5"><FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" /> Checksums attached to releases</span>
            <span className="flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Background update checks</span>
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Isolated session store</span>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
