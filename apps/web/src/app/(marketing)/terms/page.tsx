import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of service" };

const SECTIONS = [
  {
    title: "1. Agreement",
    body: [
      "By creating an account or using this deployment of CareerPilot AI, you agree to these terms. If you do not agree, do not use the service. The operator of the deployment is the party providing the service to you.",
    ],
  },
  {
    title: "2. What the service does",
    body: [
      "CareerPilot AI helps you organise career information, discover job postings, evaluate fit, prepare application documents, practise interviews, and track applications. It is a preparation and record-keeping tool.",
      "CareerPilot does not submit applications on your behalf, does not contact employers for you, and does not guarantee interviews, offers, or employment outcomes.",
    ],
  },
  {
    title: "3. Your responsibilities",
    body: [
      "You are responsible for the accuracy of everything you enter. Do not enter qualifications, employers, metrics or achievements you cannot substantiate.",
      "You are responsible for reviewing every generated document before sending it to a third party. Approval is an explicit action and records that you accepted the document's contents.",
      "You must have the right to upload any file you import and must not upload another person's personal data without their consent.",
      "You must comply with the terms of any job board, AI provider or other service you connect.",
    ],
  },
  {
    title: "4. Acceptable use",
    body: [
      "Do not use the service to harass, defraud, impersonate, scrape at abusive rates, attempt unauthorised access, probe other users' data, bypass rate limits, or distribute malware.",
      "Do not use automated means to create accounts or to generate content at scale for spam.",
      "We may suspend accounts that threaten the integrity or availability of the service, or that violate applicable law.",
    ],
  },
  {
    title: "5. AI-generated content",
    body: [
      "AI features are optional and require configuration plus an explicit disclosure acceptance. Model output may be inaccurate, incomplete or biased. The application applies grounding and review checks, but you remain responsible for verifying facts.",
      "AI suggestions are labelled as suggestions. They do not become verified profile facts automatically, and documents containing unresolved critical findings cannot be approved.",
      "Third-party providers charge for their own services under their own terms. The application's cost estimates are estimates, not invoices.",
    ],
  },
  {
    title: "6. Accounts and security",
    body: [
      "Keep your password confidential. You are responsible for activity under your account. Sign out of shared devices and revoke sessions you do not recognise.",
      "We may require email verification, reset passwords, or revoke sessions to protect the service.",
      "You may delete your account at any time from Privacy & Data Management. Deletion is irreversible in the application database.",
    ],
  },
  {
    title: "7. Third-party services",
    body: [
      "The service can connect to job boards and AI providers. Their availability, accuracy and terms are outside the operator's control. A failed connection is reported as a failure; the application does not fabricate a substitute result.",
    ],
  },
  {
    title: "8. Availability and changes",
    body: [
      "The service is provided on an as-is and as-available basis. Features may change, and planned features described in marketing or pricing pages are not commitments until they are shipped and documented as available.",
      "This build does not process payments and does not claim production readiness for your specific environment. Operators must complete their own deployment, backup and security review.",
    ],
  },
  {
    title: "9. Limitation of liability",
    body: [
      "To the maximum extent permitted by law, the operator is not liable for indirect, incidental, special or consequential damages, or for lost opportunities, lost employment, lost data, or reliance on generated content. Nothing in these terms excludes liability that cannot be excluded by law.",
    ],
  },
  {
    title: "10. Termination",
    body: [
      "You may stop using the service at any time and delete your account. The operator may suspend or terminate access for material breach, security risk, or legal requirement. Where practicable, you can export your data before termination.",
    ],
  },
  {
    title: "11. Contact",
    body: [
      "Questions about these terms should be sent through the contact form. For privacy-specific requests, select 'Privacy request'.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="container max-w-4xl py-14">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Legal</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Terms of service</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">Last updated 19 October 2026 · applies to this build</p>
      <div className="mt-6 rounded-xl border p-4 text-sm text-[var(--muted)]">
        These terms are a starting point for this deployment. Operators should obtain legal review for
        their jurisdiction before offering the service commercially.
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
        <Link href="/privacy" className="cp-link">Privacy policy</Link>
        <Link href="/contact" className="cp-link">Contact</Link>
        <Link href="/pricing" className="cp-link">Pricing</Link>
      </div>
    </div>
  );
}
