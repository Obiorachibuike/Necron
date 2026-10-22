"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { Field, Input } from "@/components/ui/field";
import { ApiError } from "@/lib/api";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

type FormValues = z.infer<typeof schema>;

function SignInForm() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const [error, setError] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setError("");
    try {
      const response = await login(values.email, values.password);
      const destination = next && next.startsWith("/") ? next
        : response.user.onboarding_completed ? "/dashboard" : "/onboarding";
      router.push(destination);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Sign in failed. Please try again.");
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">Sign in to continue your job search.</p>

      {error ? (
        <div className="mt-4"><Alert tone="danger" title="Could not sign in">{error}</Alert></div>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <Field label="Email" htmlFor="email" error={errors.email?.message} required>
          <Input id="email" type="email" autoComplete="email" placeholder="you@example.com"
                 aria-invalid={!!errors.email}
                 aria-describedby={errors.email ? "email-error" : undefined}
                 {...register("email")} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message} required>
          <div className="relative">
            <Input id="password" type={showPassword ? "text" : "password"}
                   autoComplete="current-password" placeholder="Your password"
                   aria-invalid={!!errors.password}
                   aria-describedby={errors.password ? "password-error" : undefined}
                   className="pr-10" {...register("password")} />
            <button type="button" onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2 top-2 rounded-lg p-1.5 text-[var(--muted)] hover:text-[var(--fg)]">
              {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
        </Field>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm cp-link">Forgot your password?</Link>
        </div>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--muted)]">
        New to CareerPilot? <Link href="/sign-up" className="cp-link">Create an account</Link>
      </p>

      <div className="mt-8 rounded-xl border p-4 text-xs text-[var(--muted)]">
        <p className="flex items-center gap-1.5 font-medium text-[var(--fg)]">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" /> Account security
        </p>
        <p className="mt-1">
          Sessions use an httpOnly cookie. Requests that change data also require a CSRF token
          issued at sign-in. Signing out revokes the session server-side.
        </p>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <React.Suspense fallback={<p className="text-sm text-[var(--muted)]">Loading sign-in…</p>}>
      <SignInForm />
    </React.Suspense>
  );
}
