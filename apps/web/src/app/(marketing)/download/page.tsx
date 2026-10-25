import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowUpRight, CheckCircle2, Download, FileCheck2, Info, Laptop, MonitorCheck,
  ShieldCheck, Terminal, TriangleAlert,
} from "lucide-react";
import { OsIcon } from "@/components/os-icon";
import { DownloadButtons } from "@/components/download-buttons";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import {
  DESKTOP_VERSION,
  PLATFORMS,
  PLATFORM_ORDER,
  RELEASES_URL,
  REPO_URL,
  downloadHref,
  formatLabel,
  type DesktopArch,
  type DesktopPlatform,
  type DownloadFormat,
} from "@/lib/desktop";

export const metadata: Metadata = {
  title: "Download — Windows, macOS and Linux",
  description:
    "Download CareerPilot Desktop for Windows, macOS or Linux. A native window for your CareerPilot workspace, with tray, notifications, document downloads and automatic updates.",
};

type SearchParams = Promise<{ missing?: string }>;

const BUILDS: Record<DesktopPlatform, { arch: DesktopArch; format: DownloadFormat; label: string }[]> = {
  windows: [
    { arch: "x64", format: "installer", label: "Windows installer · x64" },
    { arch: "arm64", format: "installer", label: "Windows installer · ARM64" },
    { arch: "x64", format: "portable", label: "Portable executable · x64" },
  ],
  macos: [
    { arch: "arm64", format: "dmg", label: "Disk image · Apple silicon" },
    { arch: "x64", format: "dmg", label: "Disk image · Intel" },
    { arch: "arm64", format: "zip", label: "ZIP archive · Apple silicon" },
  ],
  linux: [
    { arch: "x64", format: "appimage", label: "AppImage · x86_64" },
    { arch: "x64", format: "deb", label: "Debian package · AMD64" },
  ],
};

function InstallSteps({ platform }: { platform: DesktopPlatform }) {
  if (platform === "windows") {
    return (
      <ol className="mt-3 space-y-2 text-sm text-[var(--muted)]">
        <li className="flex gap-2"><span className="text-[var(--brand)]">1.</span> Run the downloaded <span className="mono">.exe</span>. The installer is per-user and does not need administrator rights.</li>
        <li className="flex gap-2"><span className="text-[var(--brand)]">2.</span> Choose an install folder if you want, then finish. A desktop and Start menu shortcut are created.</li>
        <li className="flex gap-2"><span className="text-[var(--brand)]">3.</span> Open CareerPilot and paste your workspace address.</li>
      </ol>
    );
  }
  if (platform === "macos") {
    return (
      <ol className="mt-3 space-y-2 text-sm text-[var(--muted)]">
        <li className="flex gap-2"><span className="text-[var(--brand)]">1.</span> Open the <span className="mono">.dmg</span> and drag <strong className="text-[var(--fg)]">CareerPilot</strong> into <span className="mono">Applications</span>.</li>
        <li className="flex gap-2"><span className="text-[var(--brand)]">2.</span> Launch it from Applications. The first launch may be blocked because builds are not notarized yet — see the note below.</li>
        <li className="flex gap-2"><span className="text-[var(--brand)]">3.</span> Paste your workspace address when the connect screen appears.</li>
      </ol>
    );
  }
  return (
    <ol className="mt-3 space-y-2 text-sm text-[var(--muted)]">
      <li className="flex gap-2"><span className="text-[var(--brand)]">1.</span> AppImage: <span className="mono">chmod +x CareerPilot-*.AppImage</span> then run it. Add it to your application menu with AppImageLauncher if you use one.</li>
      <li className="flex gap-2"><span className="text-[var(--brand)]">2.</span> Debian package: <span className="mono">sudo apt install ./CareerPilot-*.deb</span>.</li>
      <li className="flex gap-2"><span className="text-[var(--brand)]">3.</span> Paste your workspace address when the connect screen appears.</li>
    </ol>
  );
}

function PlatformCard({ platform }: { platform: DesktopPlatform }) {
  const info = PLATFORMS[platform];
  return (
    <section id={platform} className="cp-card scroll-mt-24 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--surface-2)] text-[var(--brand)]">
            <OsIcon os={platform} className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{info.label}</h2>
            <p className="text-xs text-[var(--muted)]">{info.requirement}</p>
          </div>
        </div>
        <Badge tone="neutral">v{DESKTOP_VERSION}</Badge>
      </div>

      <p className="mt-3 text-sm text-[var(--muted)]">{info.note}</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {BUILDS[platform].map((build) => (
          <Link
            key={`${build.arch}-${build.format}-${build.label}`}
            href={downloadHref(platform, build.arch, build.format)}
            className={buttonStyles({ variant: "outline", size: "sm" }) + " justify-between"}
          >
            <span className="flex items-center gap-2">
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              {build.label}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
              {formatLabel(build.format)}
            </span>
          </Link>
        ))}
      </div>

      <InstallSteps platform={platform} />

      {platform === "windows" ? (
        <div className="mt-4 flex gap-2 rounded-xl border border-[var(--warning)]/30 bg-[var(--warning)]/5 p-3 text-xs text-[var(--muted)]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" aria-hidden="true" />
          <p>
            These builds are not code-signed yet, so Windows SmartScreen may show
            &ldquo;Windows protected your PC&rdquo;. Choose <strong className="text-[var(--fg)]">More info → Run anyway</strong>
            {" "}after checking the SHA-256 checksum published with the release.
          </p>
        </div>
      ) : null}

      {platform === "macos" ? (
        <div className="mt-4 flex gap-2 rounded-xl border border-[var(--warning)]/30 bg-[var(--warning)]/5 p-3 text-xs text-[var(--muted)]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" aria-hidden="true" />
          <p>
            macOS builds are not notarized yet. If macOS blocks the first launch, open
            {" "}<strong className="text-[var(--fg)]">System Settings → Privacy &amp; Security</strong> and choose
            {" "}<strong className="text-[var(--fg)]">Open Anyway</strong> for CareerPilot. On older macOS versions,
            right-click the app and choose Open. Automatic updates on macOS also require a signed build.
          </p>
        </div>
      ) : null}

      {platform === "linux" ? (
        <div className="mt-4 flex gap-2 rounded-xl border bg-[var(--surface-2)] p-3 text-xs text-[var(--muted)]">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand)]" aria-hidden="true" />
          <p>
            AppImages need FUSE. On Ubuntu 24.04 or newer install it once with
            {" "}<span className="mono">sudo apt install libfuse2</span>. The <span className="mono">.deb</span> is
            installed through your package manager and updates manually.
          </p>
        </div>
      ) : null}

      <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
        <Link href={RELEASES_URL} className="cp-link inline-flex items-center gap-1">
          Release notes &amp; checksums <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </Link>
        <span>Source: <Link href={REPO_URL} className="cp-link">github.com/Obiorachibuike/Necron</Link></span>
      </p>
    </section>
  );
}

export default async function DownloadPage({ searchParams }: { searchParams: SearchParams }) {
  const { missing } = await searchParams;
  const missingPlatform =
    missing && missing !== "invalid" && PLATFORM_ORDER.includes(missing as DesktopPlatform)
      ? PLATFORMS[missing as DesktopPlatform].label
      : null;

  return (
    <div>
      <section className="relative overflow-hidden border-b">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(57,255,20,0.12),transparent_58%)]"
        />
        <div className="container relative py-14 lg:py-20">
          <Badge tone="neon">Desktop app · v{DESKTOP_VERSION}</Badge>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.06] tracking-tight sm:text-5xl">
            Download CareerPilot Desktop
            <span className="block text-[var(--brand)]">for Windows, macOS and Linux.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--muted)]">
            One codebase, three installers. The desktop app is a native window for the
            CareerPilot workspace you already run — with a system tray, desktop notifications,
            validated document downloads and updates from GitHub Releases.
          </p>
          <div className="mt-7 max-w-3xl">
            <DownloadButtons />
          </div>
          <p className="mt-4 text-xs text-[var(--muted)]">
            Free desktop client. It does not include a hosted account: you need the URL of a
            CareerPilot workspace, either one you run or one your organisation provides.
          </p>

          {missing ? (
            <div className="mt-6 flex max-w-3xl gap-3 rounded-xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-4 text-sm">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" aria-hidden="true" />
              <div>
                <p className="font-semibold">
                  {missingPlatform ? `${missingPlatform} build not available yet` : "That download link is not valid"}
                </p>
                <p className="mt-1 text-[var(--muted)]">
                  {missingPlatform
                    ? "No matching installer is attached to the current GitHub Release. The release workflow publishes installers when a tag is pushed; until then, browse the releases page for earlier builds."
                    : "Choose a platform below, or open the releases page to browse every published build."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={RELEASES_URL} className={buttonStyles({ variant: "outline", size: "sm" })}>
                    GitHub Releases
                  </Link>
                  <Link href="/download" className={buttonStyles({ variant: "ghost", size: "sm" })}>
                    Reset this page
                  </Link>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="container py-12">
        <div className="grid gap-4 lg:grid-cols-3">
          {PLATFORM_ORDER.map((platform) => (
            <PlatformCard key={platform} platform={platform} />
          ))}
        </div>
      </section>

      <section className="border-y bg-[var(--surface)]">
        <div className="container grid gap-8 py-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Before you install</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">You need a workspace, not an account from us</h2>
            <p className="mt-3 text-sm text-[var(--muted)]">
              CareerPilot Desktop is a client. Your profile, job records, generated documents and
              AI settings live on the CareerPilot server you connect to. If you run it yourself,
              the README has the two commands that start the backend and web app locally.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                { icon: Laptop, title: "Desktop", body: "Windows 10/11, macOS 11+, or a glibc-based Linux distribution on x64." },
                { icon: MonitorCheck, title: "Display", body: "1366×768 or larger. The window is resizable down to 940×620." },
                { icon: ShieldCheck, title: "Network", body: "Reachable workspace over https. Loopback http is accepted for local development." },
                { icon: Terminal, title: "No terminal needed", body: "Installed builds run from the Start menu, Applications or your app launcher." },
              ].map((item) => (
                <div key={item.title} className="rounded-xl border bg-[var(--bg)] p-4">
                  <item.icon className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" />
                  <p className="mt-2 text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{item.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border bg-[var(--bg)] p-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FileCheck2 className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" /> Verify your download
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Each release attaches a <span className="mono">SHA256SUMS.txt</span> covering every installer.
              Compare it before running a build you downloaded from anywhere other than the release page.
            </p>
            <ul className="mt-3 space-y-2 text-xs text-[var(--muted)]">
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brand)]" aria-hidden="true" /> <span><strong className="text-[var(--fg)]">Windows:</strong> <span className="mono">Get-FileHash .\CareerPilot-*.exe -Algorithm SHA256</span></span></li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brand)]" aria-hidden="true" /> <span><strong className="text-[var(--fg)]">macOS:</strong> <span className="mono">shasum -a 256 CareerPilot-*.dmg</span></span></li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brand)]" aria-hidden="true" /> <span><strong className="text-[var(--fg)]">Linux:</strong> <span className="mono">sha256sum CareerPilot-*</span></span></li>
            </ul>
            <Link href={RELEASES_URL} className={buttonStyles({ variant: "outline", size: "sm" }) + " mt-4 w-full"}>
              Open release assets <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="container py-12">
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            {
              title: "Automatic update checks",
              body: "Installed builds check GitHub Releases in the background and download a newer version when it exists. You choose when to restart and install.",
            },
            {
              title: "Updates follow the release channel",
              body: "AppImage and Windows installer builds update in place. The .deb is updated by your package manager, and unsigned macOS builds must be replaced manually.",
            },
            {
              title: "What updates never do",
              body: "The shell never updates the CareerPilot server. Backend and database migrations stay the responsibility of whoever operates your workspace.",
            },
          ].map((item) => (
            <div key={item.title} className="cp-card p-5">
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <p className="mt-1.5 text-sm text-[var(--muted)]">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t bg-[var(--surface)]">
        <div className="container py-12">
          <h2 className="text-2xl font-semibold tracking-tight">Questions about the desktop build</h2>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {[
              [
                "Does the desktop app replace the web app?",
                "No. It loads the same workspace in a native window. Anything you do in one appears in the other because the state is on your server.",
              ],
              [
                "Can I use it without internet?",
                "No. The app is a client to a server. If the server is unreachable it shows a retry screen instead of an empty or fake page.",
              ],
              [
                "What is stored on my computer?",
                "A session cookie in an isolated Electron profile, your window size and desktop preferences. Documents and career data stay on the server.",
              ],
              [
                "Is the source available?",
                "Yes — the shell, backend and web app are all in the Necron repository. No licence has been chosen for the repository yet, so treat redistribution accordingly.",
              ],
              [
                "Why do I see a security warning?",
                "The release builds are not yet code-signed or notarized. That is a distribution gap, not a hidden feature: verify the checksum and the release source.",
              ],
              [
                "Which architectures are supported?",
                "Windows x64 and ARM64, macOS Apple silicon and Intel, Linux x64 (AppImage and .deb). Builds for other architectures are not published.",
              ],
            ].map(([question, answer]) => (
              <details key={question} className="rounded-xl border bg-[var(--bg)] p-4">
                <summary className="cursor-pointer text-sm font-semibold">{question}</summary>
                <p className="mt-2 text-sm text-[var(--muted)]">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="container py-14">
        <div className="relative overflow-hidden rounded-3xl border border-[#39FF14]/30 bg-[#39FF14]/5 p-8 sm:p-10">
          <div className="relative flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Install it. Keep your evidence.</h2>
              <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
                After installing, connect the workspace address you use in the browser. If it loads
                there, it loads here — same account, same review gates, same documents.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={downloadHref("windows", "x64")} className={buttonStyles({ size: "lg" })}>
                Download for Windows <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link href={downloadHref("macos", "arm64")} className={buttonStyles({ variant: "outline", size: "lg" })}>
                macOS
              </Link>
              <Link href={downloadHref("linux", "x64", "appimage")} className={buttonStyles({ variant: "outline", size: "lg" })}>
                Linux
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
