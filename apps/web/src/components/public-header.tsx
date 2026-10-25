"use client";

import * as React from "react";
import Link from "next/link";
import { Download, Menu, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/features", label: "Features" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/download", label: "Download" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
];

export function PublicHeader() {
  const [open, setOpen] = React.useState(false);
  return (
    <header className="sticky top-0 z-40 border-b bg-[var(--bg)]/85 backdrop-blur">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Logo />
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)]">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          <Link href="/sign-in" className={buttonStyles({ variant: "ghost", size: "sm" })}>Sign in</Link>
          <Link href="/download" className={buttonStyles({ variant: "primary", size: "sm" })}>
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Download app
          </Link>
        </div>
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
            className="grid h-9 w-9 place-items-center rounded-xl border text-[var(--fg)]"
          >
            {open ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </div>
      {open ? (
        <div id="mobile-nav" className="border-t bg-[var(--surface)] md:hidden">
          <nav aria-label="Mobile" className="container flex flex-col gap-1 py-3">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
                    className={cn("rounded-lg px-3 py-2 text-sm font-medium hover:bg-[var(--surface-2)]")}>
                {item.label}
              </Link>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Link href="/sign-in" onClick={() => setOpen(false)}
                    className={buttonStyles({ variant: "outline", size: "sm" })}>Sign in</Link>
              <Link href="/download" onClick={() => setOpen(false)}
                    className={buttonStyles({ variant: "primary", size: "sm" })}>Download app</Link>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
