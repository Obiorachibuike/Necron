import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Check, Info, Minus } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Pricing" };

const PLANS = [
  {
    name: "Starter",
    price: "$0",
    cadence: "during early access",
    description: "The complete self-serve workspace for one person.",
    available: true,
    cta: { label: "Create account", href: "/sign-up" },
    features: [
      "Unlimited profile records and job imports",
      "Greenhouse and Lever board adapters",
      "Explainable matching and strategy workflow",
      "8 CV templates with PDF and DOCX export",
      "Interview coach and application tracker",
      "Bring your own AI provider (optional)",
      "JSON export and account deletion",
    ],
  },
  {
    name: "Pro",
    price: "Planned",
    cadence: "managed hosting",
    description: "For people who want the workspace operated for them.",
    available: false,
    cta: { label: "Read the scope", href: "/contact" },
    features: [
      "Everything in Starter",
      "Managed PostgreSQL and encrypted media storage",
      "Scheduled backups and restore drills",
      "Operator-managed SMTP and email deliverability",
      "Higher AI usage ceilings",
      "Billing is not implemented in this build",
    ],
  },
  {
    name: "Teams",
    price: "Planned",
    cadence: "multi-seat",
    description: "For coaches and small career-services teams.",
    available: false,
    cta: { label: "Discuss requirements", href: "/contact" },
    features: [
      "Everything in Pro",
      "Multiple seats with isolated career data",
      "Shared template and writing-style standards",
      "Audit exports for coaching engagements",
      "Role-based administration (planned)",
      "No team features are exposed in this build",
    ],
  },
];

export default function PricingPage() {
  return (
    <div>
      <section className="border-b bg-[var(--surface)]">
        <div className="container py-14 text-center">
          <Badge tone="neon">Transparent packaging</Badge>
          <h1 className="mx-auto mt-3 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            No usage meters hidden behind a trial.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-[var(--muted)]">
            The current build is a complete, self-hostable workspace. Billing and subscription
            management are not implemented, so nothing on this page charges you.
          </p>
        </div>
      </section>

      <div className="container py-10">
        <Alert tone="info" title="Billing status">
          CareerPilot AI does not process payments in this version. The Starter column describes the
          software you can run today. Pro and Teams describe intended managed offerings and are
          explicitly unavailable.
        </Alert>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div key={plan.name}
                 className={`relative flex flex-col rounded-2xl border p-6 ${
                   plan.available ? "border-[#39FF14]/50 bg-[#39FF14]/5 shadow-glow" : "bg-[var(--surface)]"
                 }`}>
              {plan.available ? (
                <Badge tone="neon" className="absolute -top-2.5 left-6">Available now</Badge>
              ) : (
                <Badge className="absolute -top-2.5 left-6">Not available</Badge>
              )}
              <h2 className="text-lg font-semibold">{plan.name}</h2>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-3xl font-semibold tracking-tight">{plan.price}</span>
                <span className="text-xs text-[var(--muted)]">{plan.cadence}</span>
              </div>
              <p className="mt-2 text-sm text-[var(--muted)]">{plan.description}</p>
              <ul className="mt-5 flex-1 space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    {plan.available ? (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand)]" aria-hidden="true" />
                    ) : (
                      <Minus className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden="true" />
                    )}
                    <span className={plan.available ? "" : "text-[var(--muted)]"}>{feature}</span>
                  </li>
                ))}
              </ul>
              <Link href={plan.cta.href}
                    className={buttonStyles({ variant: plan.available ? "primary" : "outline", size: "md" }) + " mt-6 w-full"}>
                {plan.cta.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="cp-card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Info className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" /> What&apos;s included in every plan
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
              <li>Your data is never sold. There is no advertising or analytics tracking.</li>
              <li>AI is optional and requires explicit configuration and disclosure.</li>
              <li>Exports and deletion are available without a support request.</li>
              <li>Deterministic matching and document review never consume AI tokens.</li>
            </ul>
          </div>
          <div className="cp-card p-5">
            <h2 className="text-sm font-semibold">Self-hosting</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              The repository includes deployment steps for your own PostgreSQL database and object
              storage. You are responsible for backups, SMTP, TLS termination and provider billing.
              See <span className="font-mono text-xs">docs/DEPLOYMENT.md</span> in the repository.
            </p>
          </div>
        </div>

        <div className="mt-10 text-center">
          <p className="text-sm text-[var(--muted)]">
            Questions about packaging? <Link href="/contact" className="cp-link">Send a message</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
