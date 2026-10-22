"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2, KeyRound, Laptop, Mail, MonitorSmartphone, Moon, Palette, ShieldCheck, Sun, Trash2,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, Alert, Section, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { useAuth, useTheme } from "@/components/providers";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import type { SessionInfo } from "@/lib/types";
import { formatDateTime, relativeTime } from "@/lib/utils";

export default function SettingsPage() {
  return (
    <React.Suspense fallback={<Skeleton className="h-40" />}>
      <SettingsContent />
    </React.Suspense>
  );
}

function SettingsContent() {
  const { user, refresh } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [displayName, setDisplayName] = React.useState(user?.display_name ?? "");
  const [savingName, setSavingName] = React.useState(false);
  const [passwords, setPasswords] = React.useState({ current: "", next: "", confirm: "" });
  const [savingPassword, setSavingPassword] = React.useState(false);
  const [verification, setVerification] = React.useState<{ message: string; url: string | null } | null>(null);
  const [busy, setBusy] = React.useState("");

  React.useEffect(() => {
    const token = searchParams.get("token");
    if (!token || !user) return;
    api.post<{ email_verified: boolean }>("/auth/verify-email", { token })
      .then(async () => {
        toast({ title: "Email verified", tone: "success" });
        await refresh();
      })
      .catch((caught) => toast({
        title: "Verification failed",
        description: caught instanceof ApiError ? caught.message : undefined,
        tone: "error",
      }));
  }, [searchParams, user, refresh, toast]);

  React.useEffect(() => {
    if (user) setDisplayName(user.display_name);
  }, [user]);

  const sessionsQuery = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api.get<SessionInfo[]>("/auth/sessions"),
  });

  const saveName = async () => {
    setSavingName(true);
    try {
      await api.patch("/auth/account", { display_name: displayName });
      await refresh();
      toast({ title: "Account updated", tone: "success" });
    } catch (caught) {
      toast({ title: "Could not update account",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setSavingName(false);
    }
  };

  const changePassword = async () => {
    if (passwords.next !== passwords.confirm) {
      toast({ title: "New passwords do not match", tone: "error" });
      return;
    }
    setSavingPassword(true);
    try {
      const result = await api.post<{ message: string }>("/auth/change-password", {
        current_password: passwords.current, new_password: passwords.next,
      });
      setPasswords({ current: "", next: "", confirm: "" });
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      toast({ title: "Password updated", description: result.message, tone: "success" });
    } catch (caught) {
      toast({ title: "Could not change password",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setSavingPassword(false);
    }
  };

  const resendVerification = async () => {
    setBusy("verify");
    try {
      const result = await api.post<{ message: string; dev_verification_url?: string }>(
        "/auth/resend-verification");
      setVerification({ message: result.message, url: result.dev_verification_url ?? null });
      toast({ title: "Verification requested", description: result.message, tone: "info" });
    } catch (caught) {
      toast({ title: "Could not send verification",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally { setBusy(""); }
  };

  const revoke = async (session: SessionInfo) => {
    if (!window.confirm("Sign out this session?")) return;
    setBusy(session.id);
    try {
      await api.del(`/auth/sessions/${session.id}`);
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
    } catch (caught) {
      toast({ title: "Could not revoke session",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally { setBusy(""); }
  };

  const revokeOthers = async () => {
    setBusy("others");
    try {
      const result = await api.post<{ message: string }>("/auth/sessions/revoke-others");
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      toast({ title: "Other sessions signed out", description: result.message, tone: "success" });
    } finally { setBusy(""); }
  };

  return (
    <div>
      <PageHeader eyebrow="Settings" title="General settings"
                  description="Account, security, appearance and sessions." />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Your display name appears only inside your workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Display name" htmlFor="display-name">
              <Input id="display-name" value={displayName}
                     onChange={(event) => setDisplayName(event.target.value)} />
            </Field>
            <Field label="Email" htmlFor="account-email" help="Changing your email is not supported in this build.">
              <Input id="account-email" value={user?.email ?? ""} disabled readOnly />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" loading={savingName} disabled={!displayName.trim()}
                      onClick={() => void saveName()}>Save</Button>
              <Badge tone={user?.email_verified ? "success" : "warning"}>
                {user?.email_verified ? "Email verified" : "Email unverified"}
              </Badge>
              {!user?.email_verified ? (
                <Button size="sm" variant="outline" loading={busy === "verify"}
                        onClick={() => void resendVerification()}>
                  <Mail className="h-3.5 w-3.5" aria-hidden="true" /> Resend verification
                </Button>
              ) : null}
            </div>
            {verification ? (
              <Alert tone="info" title="Verification">
                <p>{verification.message}</p>
                {verification.url ? (
                  <p className="mt-1 break-all text-xs">
                    Development link:{" "}
                    <a href={verification.url} className="cp-link">{verification.url}</a>
                  </p>
                ) : null}
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>The choice is stored in a cookie and applied before first paint.</CardDescription>
          </CardHeader>
          <CardContent>
            <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
              {([
                { key: "light", label: "Light", icon: Sun },
                { key: "dark", label: "Dark", icon: Moon },
                { key: "system", label: "System", icon: MonitorSmartphone },
              ] as const).map((option) => (
                <button key={option.key} type="button" role="radio"
                        aria-checked={theme === option.key}
                        onClick={() => setTheme(option.key)}
                        className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-xs ${
                          theme === option.key ? "border-[var(--brand)] bg-[var(--surface-2)] font-semibold" : ""
                        }`}>
                  <option.icon className="h-5 w-5" aria-hidden="true" />
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-3 flex items-center gap-1 text-xs text-[var(--muted)]">
              <Palette className="h-3 w-3" aria-hidden="true" /> Accent: neon green #39FF14 · status is always labelled, never colour alone.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" /> Password
            </CardTitle>
            <CardDescription>Changing your password signs out other sessions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Current password" htmlFor="current-password">
              <Input id="current-password" type="password" autoComplete="current-password"
                     value={passwords.current}
                     onChange={(event) => setPasswords((current) => ({ ...current, current: event.target.value }))} />
            </Field>
            <Field label="New password" htmlFor="new-password"
                   help="At least 10 characters including a letter and a number.">
              <Input id="new-password" type="password" autoComplete="new-password"
                     value={passwords.next}
                     onChange={(event) => setPasswords((current) => ({ ...current, next: event.target.value }))} />
            </Field>
            <Field label="Confirm new password" htmlFor="confirm-password">
              <Input id="confirm-password" type="password" autoComplete="new-password"
                     value={passwords.confirm}
                     onChange={(event) => setPasswords((current) => ({ ...current, confirm: event.target.value }))} />
            </Field>
            <Button size="sm" loading={savingPassword}
                    disabled={!passwords.current || passwords.next.length < 10}
                    onClick={() => void changePassword()}>Update password</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Laptop className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" /> Active sessions
            </CardTitle>
            <CardDescription>Server-side sessions with httpOnly cookies.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(sessionsQuery.data ?? []).map((session) => (
                <div key={session.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-xs">
                  <div>
                    <p className="font-medium">
                      {session.current ? "This device" : "Another device"}
                      {session.current ? <Badge tone="success" className="ml-2">current</Badge> : null}
                    </p>
                    <p className="text-[var(--muted)]">
                      Last active {relativeTime(session.last_seen_at)} · expires {formatDateTime(session.expires_at)}
                    </p>
                    {session.user_agent ? (
                      <p className="max-w-xs truncate text-[var(--muted)]">{session.user_agent}</p>
                    ) : null}
                  </div>
                  {!session.current ? (
                    <Button size="sm" variant="outline" loading={busy === session.id}
                            onClick={() => void revoke(session)}>Sign out</Button>
                  ) : null}
                </div>
              ))}
              {sessionsQuery.isLoading ? <Skeleton className="h-16" /> : null}
            </div>
            <Button size="sm" variant="outline" className="mt-3" loading={busy === "others"}
                    onClick={() => void revokeOthers()}>
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Sign out all other sessions
            </Button>
          </CardContent>
        </Card>
      </div>

      <Section title="AI data disclosure" className="mt-6"
               description="CareerPilot sends only the content required for an action you start, and only to the provider you configure.">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--muted)]">
              You can review or accept the AI disclosure in provider settings. AI remains optional;
              deterministic fallbacks cover matching, drafting, reviewing and interview questions.
            </p>
            <Link href="/settings/ai"><Button size="sm" variant="outline">AI provider settings</Button></Link>
          </CardContent>
        </Card>
      </Section>

      <Section title="Danger zone" className="mt-6"
               description="Account deletion is permanent and removes stored profile, documents, jobs and AI usage.">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Delete this account</p>
              <p className="text-xs text-[var(--muted)]">
                Export your data first. Deletion cannot be undone.
              </p>
            </div>
            <Link href="/settings/privacy">
              <Button variant="outline" size="sm">
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Privacy &amp; deletion
              </Button>
            </Link>
          </CardContent>
        </Card>
      </Section>

      <p className="mt-6 flex items-center gap-1 text-xs text-[var(--muted)]">
        <CheckCircle2 className="h-3 w-3 text-[var(--brand)]" aria-hidden="true" />
        CSRF-protected mutations · httpOnly session cookie · rate-limited sign-in
      </p>
    </div>
  );
}
