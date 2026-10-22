import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy policy" };

const SECTIONS = [
  {
    title: "1. Who this policy covers",
    body: [
      "CareerPilot AI is software you can run for yourself or deploy for an organisation. The operator of the deployment is the data controller for accounts created on it. This document describes what the software stores and transmits by design.",
    ],
  },
  {
    title: "2. Data the application stores",
    body: [
      "Account data: email address, display name, Argon2id password hash, verification state, session records (hashed session token, user agent, IP hint, timestamps), and acceptance timestamps for terms and the AI disclosure.",
      "Career data: profile fields, work experience, education, skills, projects, certifications, achievements, job preferences, writing style, uploaded CV files, extracted text, jobs and sources, saved searches, application strategies, generated documents and versions, reviews, exported files, applications, events, reminders, interview sessions, answers and notes.",
      "Operational data: background task records, AI usage records (provider, model, token counts, latency, success/failure, optional estimated cost), notifications, and feedback messages.",
      "Secrets: AI provider API keys are stored encrypted with Fernet. Session tokens are stored hashed. Plaintext keys are never returned by the API and are not written to application logs.",
    ],
  },
  {
    title: "3. Cookies",
    body: [
      "cp_session: an httpOnly, SameSite=Lax session cookie. Required for authentication; no tracking value.",
      "cp_csrf: a readable CSRF token that must be echoed in the X-CSRF-Token header on mutating requests. Required for security.",
      "cp_theme: your light/dark/system preference. Optional but always set when you change the theme.",
      "The application does not include third-party analytics, advertising pixels, or social tracking scripts.",
    ],
  },
  {
    title: "4. AI providers",
    body: [
      "AI features are disabled until you create a provider configuration and accept the AI disclosure. When you invoke an AI-assisted action, the application sends the prompt payload for that action to the endpoint you configured: this can include relevant profile fields, the job description, and document text.",
      "The endpoint may be a public OpenAI-compatible API or a local Ollama server. If you use a public provider, that provider's terms and retention policy apply. The application records token usage and latency, not the prompt text, in its usage ledger.",
      "Deterministic matching, deterministic drafting, rule-based review, tracking and exports do not send data to an AI provider.",
    ],
  },
  {
    title: "5. Sharing",
    body: [
      "The software does not sell data or share it with advertising networks. Data leaves the deployment only through: (a) an AI provider you configured and invoked; (b) SMTP email you configured, for verification and password-reset messages; (c) job-board requests needed to fetch public postings; (d) an export you explicitly download.",
      "The operator may be required to disclose data by law. The software has no built-in law-enforcement interface.",
    ],
  },
  {
    title: "6. Retention and deletion",
    body: [
      "Career data is retained until you delete the corresponding record or your account. Account deletion cascades to profile data, jobs, documents, applications, interviews, tasks, notifications and sessions.",
      "Deleting your account requires your password and an explicit typed confirmation. The action is immediate in the application database. Operators may maintain independent backups; backup retention is an operator responsibility and is not configured by the application.",
      "AI usage records are retained for cost and abuse analysis until account deletion.",
    ],
  },
  {
    title: "7. Your controls",
    body: [
      "Export: GET /api/v1/privacy/export returns a JSON document containing your profile, jobs, documents, applications, interviews, reminders, tasks, notifications, AI usage and feedback metadata. Secrets and password hashes are excluded.",
      "Correction: every profile record can be edited; provenance and verification are visible.",
      "Session control: list sessions, revoke individual sessions, or revoke all other sessions.",
      "Deletion: available in Privacy & Data Management inside the workspace.",
    ],
  },
  {
    title: "8. Security",
    body: [
      "Passwords use Argon2id. Sessions use random tokens stored as hashes and delivered in httpOnly cookies. Mutating requests require a CSRF double-submit token. Authentication, recovery, AI and general endpoints are rate limited. Outbound URL imports validate scheme, port, DNS resolution and redirects to reduce SSRF risk. Per-user isolation is enforced in API queries, not only in the UI.",
      "No system is perfectly secure. Report suspected vulnerabilities through the contact form without including real user data.",
    ],
  },
  {
    title: "9. Children",
    body: [
      "The service is intended for people aged 16 and over. Do not create an account for a child under 16.",
    ],
  },
  {
    title: "10. Changes and contact",
    body: [
      "Material changes to this policy will be reflected in the repository and, where the operator has email configured, communicated to account holders. The date below reflects the version shipped with this build.",
      "Contact the operator through the in-app contact form. For privacy requests, select the 'Privacy request' topic.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="container max-w-4xl py-14">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Legal</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Privacy policy</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">Last updated 19 October 2026 · applies to this build</p>
      <div className="mt-6 rounded-xl border border-[#39FF14]/30 bg-[#39FF14]/5 p-4 text-sm">
        This policy describes the behaviour implemented in this repository. If you self-host
        CareerPilot, you are the operator and must adapt this document to your jurisdiction and
        practices.
      </div>
      <div className="mt-10 space-y-8">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="text-lg font-semibold">{section.title}</h2>
            <div className="mt-2 space-y-2">
              {section.body.map((paragraph) => (
                <p key={paragraph} className="text-sm leading-relaxed text-[var(--muted)]">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="mt-10 flex flex-wrap gap-4 text-sm">
        <Link href="/terms" className="cp-link">Terms of service</Link>
        <Link href="/contact" className="cp-link">Contact</Link>
        <Link href="/features" className="cp-link">Features</Link>
      </div>
    </div>
  );
}
