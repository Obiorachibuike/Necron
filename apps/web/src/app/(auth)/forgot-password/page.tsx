"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { Field, Input } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api";

const schema = z.object({ email: z.string().email("Enter a valid email address") });
type FormValues = z.infer<typeof schema>;

type LinkMessage = { message: string; code: string; dev_reset_url?: string | null };

export default function ForgotPasswordPage() {
  const [sent, setSent] = React.useState<LinkMessage | null>(null);
  const [error, setError] = React.useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema), defaultValues: { email: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setError("");
    try {
      const response = await api.post<LinkMessage>("/auth/forgot-password", { email: values.email });
      setSent(response);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not request a reset link.");
    }
  };

  if (sent) {
    return (
      <div>
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]">
          <Mail className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Check your inbox</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{sent.message}</p>
        {sent.dev_reset_url ? (
          <div className="mt-5">
            <Alert tone="info" title="Email delivery is not configured">
              This deployment has no SMTP configuration, so the reset link is shown here. It expires
              in one hour and can be used once.
            </Alert>
            <a href={sent.dev_reset_url} className="cp-link mt-3 inline-block break-all text-sm">
              Open password reset link
            </a>
          </div>
        ) : null}
        <Link href="/sign-in" className="cp-link mt-6 inline-block text-sm">Back to sign in</Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Enter your account email and we will send a single-use reset link if an account exists.
      </p>
      {error ? <div className="mt-4"><Alert tone="danger">{error}</Alert></div> : null}
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <Field label="Email" htmlFor="email" required error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" placeholder="you@example.com"
                 aria-invalid={!!errors.email} {...register("email")} />
        </Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>Send reset link</Button>
      </form>
      <p className="mt-6 text-center text-sm text-[var(--muted)]">
        Remembered it? <Link href="/sign-in" className="cp-link">Sign in</Link>
      </p>
    </div>
  );
}
