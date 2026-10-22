"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { Field, Input } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api";

const schema = z.object({
  password: z.string().min(10, "Use at least 10 characters").max(128)
    .regex(/[A-Za-z]/, "Include at least one letter")
    .regex(/[0-9]/, "Include at least one number"),
  confirm: z.string(),
}).refine((values) => values.password === values.confirm, {
  path: ["confirm"], message: "Passwords do not match",
});

type FormValues = z.infer<typeof schema>;

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [error, setError] = React.useState("");
  const [done, setDone] = React.useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema), defaultValues: { password: "", confirm: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setError("");
    try {
      await api.post("/auth/reset-password", { token, new_password: values.password });
      setDone(true);
      window.setTimeout(() => router.push("/sign-in"), 1800);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not reset your password.");
    }
  };

  if (!token) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reset link required</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          This page needs a valid reset token. Request a new link to continue.
        </p>
        <Link href="/forgot-password" className="cp-link mt-4 inline-block text-sm">
          Request a reset link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Password updated</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          All existing sessions were revoked. Redirecting you to sign in…
        </p>
        <Link href="/sign-in" className="cp-link mt-4 inline-block text-sm">Sign in now</Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Your reset link is single use and expires one hour after it was created.
      </p>
      {error ? <div className="mt-4"><Alert tone="danger">{error}</Alert></div> : null}
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <Field label="New password" htmlFor="password" required error={errors.password?.message}
               help="At least 10 characters, including a letter and a number.">
          <Input id="password" type="password" autoComplete="new-password"
                 aria-invalid={!!errors.password} {...register("password")} />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm" required error={errors.confirm?.message}>
          <Input id="confirm" type="password" autoComplete="new-password"
                 aria-invalid={!!errors.confirm} {...register("confirm")} />
        </Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>Update password</Button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <React.Suspense fallback={<p className="text-sm text-[var(--muted)]">Loading…</p>}>
      <ResetForm />
    </React.Suspense>
  );
}
