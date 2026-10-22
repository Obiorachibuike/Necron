"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Mail, MessageSquareText, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api";

const schema = z.object({
  category: z.enum(["general", "bug", "feature_request", "privacy", "security"]),
  email: z.string().email("Enter a valid email address").or(z.literal("")),
  message: z.string().min(10, "Please add a little more detail").max(5000),
});

type FormValues = z.infer<typeof schema>;

export default function ContactPage() {
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState("");
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { category: "general", email: "", message: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setError("");
    try {
      await api.post("/feedback", { ...values, page: "/contact" });
      setSent(true);
      reset();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not send your message.");
    }
  };

  return (
    <div className="container grid gap-10 py-14 lg:grid-cols-[0.9fr_1.1fr]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Contact</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">Talk to the people running this deployment.</h1>
        <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">
          Messages are stored in the application database and surfaced to the operator. Include the
          page you were using and any error code you saw. Do not include passwords, API keys or full
          identity documents.
        </p>
        <div className="mt-8 space-y-4">
          {[
            { icon: MessageSquareText, title: "Product feedback", body: "Tell us which workflow broke or what is missing. Concrete examples help." },
            { icon: ShieldCheck, title: "Security and privacy", body: "Report suspected vulnerabilities or data-handling concerns. Include reproduction steps, never real user data." },
            { icon: Mail, title: "Account help", body: "For password or export issues, include the email address on the account. Never send your password." },
          ].map((item) => (
            <div key={item.title} className="flex gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">
                <item.icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="text-sm text-[var(--muted)]">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 rounded-xl border p-4 text-xs text-[var(--muted)]">
          This deployment may not have SMTP configured. The form is the reliable contact path; email
          delivery is shown as configured or unconfigured in <Link href="/sign-in" className="cp-link">settings</Link>.
        </div>
      </div>

      <div className="cp-card p-6">
        {sent ? (
          <div className="py-10 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-[var(--success)]" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-semibold">Message received</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--muted)]">
              Your message is stored in the application database. The operator can review it from the
              feedback table. This form does not create a support ticket or promise a response time.
            </p>
            <Button className="mt-5" variant="outline" onClick={() => setSent(false)}>
              Send another message
            </Button>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold">Send a message</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              We never use this form to collect passwords or API keys.
            </p>
            {error ? <div className="mt-4"><Alert tone="danger">{error}</Alert></div> : null}
            <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4" noValidate>
              <Field label="Topic" htmlFor="category" required error={errors.category?.message}>
                <Select id="category" {...register("category")}>
                  <option value="general">General question</option>
                  <option value="bug">Bug report</option>
                  <option value="feature_request">Feature request</option>
                  <option value="privacy">Privacy request</option>
                  <option value="security">Security report</option>
                </Select>
              </Field>
              <Field label="Your email" htmlFor="email" error={errors.email?.message}
                     help="Optional. Leave blank to send anonymously; we cannot follow up.">
                <Input id="email" type="email" autoComplete="email"
                       aria-invalid={!!errors.email} {...register("email")} />
              </Field>
              <Field label="Message" htmlFor="message" required error={errors.message?.message}>
                <Textarea id="message" rows={7} placeholder="What happened, and what did you expect?"
                          aria-invalid={!!errors.message} {...register("message")} />
              </Field>
              <Button type="submit" className="w-full" loading={isSubmitting}>
                <Send className="h-4 w-4" aria-hidden="true" /> Send message
              </Button>
              <p className="text-center text-xs text-[var(--muted)]">
                By sending, you agree that the operator may store this message to respond. See the{" "}
                <Link href="/privacy" className="cp-link">privacy policy</Link>.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
