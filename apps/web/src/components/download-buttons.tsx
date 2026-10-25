"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Check, Download } from "lucide-react";
import { OsIcon } from "@/components/os-icon";
import { buttonStyles } from "@/components/ui/button";
import {
  PLATFORMS,
  PLATFORM_ORDER,
  detectPlatform,
  downloadHref,
  type DesktopPlatform,
} from "@/lib/desktop";
import { cn } from "@/lib/utils";

function useDetectedPlatform(): DesktopPlatform | null {
  const [detected, setDetected] = React.useState<DesktopPlatform | null>(null);
  React.useEffect(() => {
    if (typeof navigator === "undefined") return;
    setDetected(detectPlatform(navigator.userAgent, navigator.platform ?? ""));
  }, []);
  return detected;
}

/**
 * Direct downloads for every platform. The recommended card reacts to the visitor's
 * OS after mount, so the server-rendered markup stays identical for everyone.
 */
export function DownloadButtons({ className }: { className?: string }) {
  const detected = useDetectedPlatform();

  return (
    <div className={cn("grid gap-3 sm:grid-cols-3", className)}>
      {PLATFORM_ORDER.map((platform) => {
        const info = PLATFORMS[platform];
        const recommended = detected === platform;
        return (
          <div
            key={platform}
            className={cn(
              "relative flex flex-col rounded-2xl border bg-[var(--surface)] p-4 transition-colors",
              recommended ? "border-[#39FF14]/60 shadow-glow" : "hover:border-[#39FF14]/35"
            )}
          >
            {recommended ? (
              <span className="absolute -top-2.5 left-4">
                <span className="inline-flex items-center gap-1 rounded-full bg-neon px-2 py-0.5 text-[10px] font-bold text-neon-ink">
                  <Check className="h-2.5 w-2.5" aria-hidden="true" /> Your device
                </span>
              </span>
            ) : null}
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--surface-2)] text-[var(--brand)]">
                <OsIcon os={platform} />
              </span>
              <div>
                <p className="text-sm font-semibold">{info.label}</p>
                <p className="text-[11px] text-[var(--muted)]">{info.shortLabel}</p>
              </div>
            </div>
            <Link
              href={downloadHref(platform, info.defaultArch)}
              className={buttonStyles({ variant: recommended ? "primary" : "outline", size: "sm" }) + " mt-4 w-full"}
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Download
              <span className="sr-only"> for {info.label}</span>
            </Link>
            <Link
              href={`/download#${platform}`}
              className="mt-2 inline-flex items-center justify-center gap-1 text-[11px] text-[var(--muted)] hover:text-[var(--fg)]"
            >
              Other options &amp; install notes
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
        );
      })}
    </div>
  );
}

/** Compact inline row for the footer and CTA panels. */
export function DownloadLinks({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {PLATFORM_ORDER.map((platform) => (
        <Link
          key={platform}
          href={downloadHref(platform, PLATFORMS[platform].defaultArch)}
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] transition-colors hover:border-[#39FF14]/40 hover:text-[var(--fg)]"
        >
          <OsIcon os={platform} className="h-3.5 w-3.5" />
          {PLATFORMS[platform].label}
        </Link>
      ))}
    </div>
  );
}

/** One prominent hero button that names the visitor's platform once known. */
export function PrimaryDownloadButton({ className }: { className?: string }) {
  const detected = useDetectedPlatform();
  const info = detected ? PLATFORMS[detected] : null;
  return (
    <Link
      href={detected ? downloadHref(detected, PLATFORMS[detected].defaultArch) : "/download"}
      className={buttonStyles({ size: "lg" }) + " " + (className ?? "")}
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      {info ? `Download for ${info.label}` : "Download the desktop app"}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}
