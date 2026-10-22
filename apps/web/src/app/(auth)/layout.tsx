import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

const POINTS = [
  "Every résumé bullet traces back to experience you confirmed.",
  "An independent reviewer checks drafts before you can approve them.",
  "Job matching explains the score, category by category.",
  "Your API keys are encrypted and never sent to the browser.",
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-5 py-6 sm:px-8">
        <div className="flex items-center justify-between">
          <Logo />
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md">{children}</div>
        </div>
        <div className="flex items-center justify-between text-xs text-[var(--muted)]">
          <Link href="/" className="inline-flex items-center gap-1 hover:text-[var(--fg)]">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to home
          </Link>
          <Link href="/privacy" className="hover:text-[var(--fg)]">Privacy</Link>
          <Link href="/terms" className="hover:text-[var(--fg)]">Terms</Link>
        </div>
      </div>
      <aside className="hidden border-l bg-[var(--surface)] p-10 lg:flex lg:flex-col lg:justify-center">
        <div className="mx-auto max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
            Evidence-first career workspace
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Your career. Your strategy. Your next opportunity.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">
            CareerPilot AI keeps your knowledge base, application materials, and job search in one
            place — and it never invents qualifications for you.
          </p>
          <ul className="mt-6 space-y-3">
            {POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand)]" aria-hidden="true" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <div className="mt-10 rounded-2xl border border-[#39FF14]/30 bg-[#39FF14]/5 p-5 text-sm">
            <p className="font-medium">Works without an AI provider</p>
            <p className="mt-1 text-[var(--muted)]">
              Matching, strategy, drafting and review all have deterministic implementations.
              Connect OpenAI-compatible or Ollama endpoints only when you choose to.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
