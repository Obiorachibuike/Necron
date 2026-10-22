import Link from "next/link";
import { Logo } from "@/components/logo";

const GROUPS = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/pricing", label: "Pricing" },
      { href: "/sign-up", label: "Create account" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/contact", label: "Contact" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/sign-in", label: "Sign in" },
      { href: "/forgot-password", label: "Reset password" },
    ],
  },
];

export function PublicFooter() {
  return (
    <footer className="border-t bg-[var(--surface)]">
      <div className="container grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-[var(--muted)]">
            A career workspace that keeps every claim traceable to your verified experience.
            Built with FastAPI, PostgreSQL and Next.js.
          </p>
          <p className="mt-4 text-xs text-[var(--muted)]">
            © {new Date().getFullYear()} CareerPilot AI. Brand colour #39FF14.
          </p>
        </div>
        {GROUPS.map((group) => (
          <div key={group.title}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {group.title}
            </p>
            <ul className="space-y-1.5">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t">
        <div className="container flex flex-wrap items-center justify-between gap-2 py-4 text-xs text-[var(--muted)]">
          <p>No fabricated metrics. Every insight states its sample size and calculation.</p>
          <p>Self-hosted by design — your data stays in your PostgreSQL database.</p>
        </div>
      </div>
    </footer>
  );
}
