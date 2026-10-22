"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

const schema = z.object({
  display_name: z.string().min(1, "Enter your name").max(120),
  email: z.string().email("Enter a valid email address"),
  password: z.string()
    .min(10, "Use at least 10 characters")
    .max(128, "Use 128 characters or fewer")
    .regex(/[A-Za-z]/, "Include at least one letter")
    .regex(/[0-9]/, "Include at least one number"),
  confirm: z.string(),
  accept_terms: z.literal(true, { errorMap: () => ({ message: "You must accept the terms to continue" }) }),
}).refine((values) => values.password === values.confirm, {
  path: ["confirm"], message: "Passwords do not match",
});

type FormValues = z.infer<typeof schema>;

export default function SignUpPage() {
  const { register: registerUser } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [error, setError] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = React.useState(false);
  const [verifyUrl, setVerifyUrl] = React.useState<string | null>(null);
  const [verificationRequired, setVerificationRequired] = React.useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { display_name: "", email: "", password: "", confirm: "", accept_terms: false as true },
  });

  const onSubmit = async (values: FormValues) => {
    setError("");
    setFieldErrors({});
    try {
      const response = await registerUser({
        email: values.email,
        password: values.password,
        display_name: values.display_name,
        accept_terms: values.accept_terms,
      });
      if (response.email_verification_required) {
        setVerificationRequired(true);
        setVerifyUrl(response.dev_verification_url ?? null);
        return;
      }
      toast({ title: "Account created", description: "Let’s build your career profile.", tone: "success" });
      router.push("/onboarding");
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        const mapped: Record<string, string> = {};
        for (const detail of caught.details) {
          if (detail.field) mapped[detail.field.split(".").pop() ?? detail.field] = detail.message;
        }
        setFieldErrors(mapped);
      } else {
        setError("Could not create your account. Please try again.");
      }
    }
  };

  if (verificationRequired) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Your account was created. This deployment requires email verification before you can use
          the workspace. Open the verification link we sent to continue.
        </p>
        {verifyUrl ? (
          <div className="mt-5">
            <Alert tone="info" title="Development delivery">
              Email sending is not configured on this deployment, so the verification link is shown
              here. In production, configure SMTP to deliver it by email.
            </Alert>
            <a href={verifyUrl} className="cp-link mt-3 inline-block break-all text-sm">
              Open verification link
            </a>
          </div>
        ) : null}
        <Link href="/sign-in" className="cp-link mt-6 inline-block text-sm">Go to sign in</Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Free to start. No credit card required.
      </p>

      {error ? (
        <div className="mt-4"><Alert tone="danger" title="Could not create account">{error}</Alert></div>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <Field label="Full name" htmlFor="display_name" required
               error={errors.display_name?.message ?? fieldErrors.display_name}>
          <Input id="display_name" autoComplete="name" placeholder="Ada Obi"
                 aria-invalid={!!(errors.display_name || fieldErrors.display_name)}
                 {...register("display_name")} />
        </Field>
        <Field label="Email" htmlFor="email" required error={errors.email?.message ?? fieldErrors.email}>
          <Input id="email" type="email" autoComplete="email" placeholder="you@example.com"
                 aria-invalid={!!(errors.email || fieldErrors.email)} {...register("email")} />
        </Field>
        <Field label="Password" htmlFor="password" required
               error={errors.password?.message ?? fieldErrors.password}
               help="At least 10 characters, including a letter and a number.">
          <div className="relative">
            <Input id="password" type={showPassword ? "text" : "password"}
                   autoComplete="new-password" placeholder="Create a strong password"
                   aria-invalid={!!(errors.password || fieldErrors.password)}
                   className="pr-10" {...register("password")} />
            <button type="button" onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2 top-2 rounded-lg p-1.5 text-[var(--muted)] hover:text-[var(--fg)]">
              {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
        </Field>
        <Field label="Confirm password" htmlFor="confirm" required error={errors.confirm?.message}>
          <Input id="confirm" type={showPassword ? "text" : "password"} autoComplete="new-password"
                 placeholder="Repeat your password" aria-invalid={!!errors.confirm} {...register("confirm")} />
        </Field>
        <div>
          <Checkbox
            label={<>I agree to the <Link href="/terms" className="cp-link">Terms</Link> and <Link href="/privacy" className="cp-link">Privacy Policy</Link></>}
            description="You must accept these to create an account."
            {...register("accept_terms")}
          />
          {errors.accept_terms?.message ? (
            <p className="cp-error" role="alert">{errors.accept_terms.message}</p>
          ) : null}
        </div>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--muted)]">
        Already have an account? <Link href="/sign-in" className="cp-link">Sign in</Link>
      </p>

      <div className="mt-6 flex items-start gap-2 rounded-xl border p-3 text-xs text-[var(--muted)]">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brand)]" aria-hidden="true" />
        <p>AI features stay disabled until you configure a provider and accept the disclosure. You can use every deterministic feature without one.</p>
      </div>
    </div>
  );
}
