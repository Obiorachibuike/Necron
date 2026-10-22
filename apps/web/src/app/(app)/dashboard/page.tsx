"use client";

import Link from "next/link";
import {
  ArrowRight, BriefcaseBusiness, CalendarClock, CheckCircle2, FileText, Gauge,
  ListTodo, Plus, Sparkles, Target, TriangleAlert, Wand2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/providers";
import { PageHeader, StatCard, Alert, EmptyState, Spinner, Skeleton } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonStyles } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { JobCard } from "@/components/job-card";
import { DocumentCard } from "@/components/document-card";
import { api } from "@/lib/api";
import type { Dashboard } from "@/lib/types";
import { formatDateTime, relativeTime } from "@/lib/utils";

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<Dashboard>("/dashboard"),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Alert tone="danger" title="Dashboard unavailable">
        Your dashboard could not be loaded. Refresh the page or check that the API and database are
        running.
      </Alert>
    );
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const name = data.preferred_name || user?.display_name || "there";
  const activeTasks = data.tasks.filter((task) => ["queued", "running"].includes(task.status));
  const hasNoData = !data.has_data;

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title={`${greeting}, ${name}`}
        description={data.profile_headline || "Let’s make the next application deliberate."}
        actions={
          <>
            <Link href="/discover" className={buttonStyles({ variant: "outline", size: "sm" })}>
              <Target className="h-4 w-4" aria-hidden="true" /> Find jobs
            </Link>
            <Link href="/profile" className={buttonStyles({ size: "sm" })}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Improve profile
            </Link>
          </>
        }
      />

      {!data.onboarding_completed ? (
        <div className="mb-5">
          <Alert tone="warning" title="Onboarding is incomplete">
            Your profile is the evidence base for matches and documents.{" "}
            <Link href="/onboarding" className="cp-link">Resume onboarding</Link>.
          </Alert>
        </div>
      ) : null}

      {!data.ai_configured ? (
        <div className="mb-5">
          <Alert tone="info" title="AI is not configured">
            You can use matching, strategy, drafting, review and export without AI. To enable AI
            drafting or review, <Link href="/settings/ai" className="cp-link">add a provider</Link>.
          </Alert>
        </div>
      ) : null}

      {!data.worker_available && activeTasks.length > 0 ? (
        <div className="mb-5">
          <Alert tone="danger" title="Background worker is offline">
            {activeTasks.length} task(s) are waiting and will not advance until a worker is running.
            Start the worker with <code className="font-mono text-xs">python -m app.worker</code>.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Profile completeness" value={`${data.profile_completeness}%`}
                  hint="Based on profile, experience, education and skills"
                  icon={Gauge} tone="neon" />
        <StatCard label="Active applications" value={data.applications.active}
                  hint={`${data.applications.total} tracked in total`}
                  icon={BriefcaseBusiness} tone="info" />
        <StatCard label="New matches" value={data.new_matches.length}
                  hint="Scored jobs not yet reviewed" icon={Target} tone="success" />
        <StatCard label="Interviews" value={data.applications.interviews}
                  hint="Applications at the interview stage"
                  icon={CalendarClock} tone="warning" />
      </div>

      {hasNoData ? (
        <div className="mt-6">
          <EmptyState
            icon={Sparkles}
            title="Your workspace is ready"
            description="Start by completing your profile, then import a job description to see an explainable match. Nothing here is pre-filled with sample data."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/profile" className={buttonStyles({ size: "sm" })}>Build profile</Link>
                <Link href="/discover" className={buttonStyles({ variant: "outline", size: "sm" })}>
                  Import a job
                </Link>
              </div>
            }
          />
        </div>
      ) : null}

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Recommended for you</h2>
              <Link href="/discover" className="cp-link text-xs">View all jobs</Link>
            </div>
            {data.recommended.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {data.recommended.slice(0, 4).map((job) => <JobCard key={job.id} job={job} compact />)}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-6 text-sm text-[var(--muted)]">
                No scored jobs yet. Import a job or add a board to start matching.
              </div>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Recent documents</h2>
              <Link href="/documents" className="cp-link text-xs">Open library</Link>
            </div>
            {data.recent_documents.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {data.recent_documents.map((document) => (
                  <DocumentCard key={document.id} document={document} />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-6 text-sm text-[var(--muted)]">
                No documents yet. Open a job and use Application Studio to draft one.
              </div>
            )}
          </section>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" />
                Next up
              </CardTitle>
              <CardDescription>Deadlines and scheduled actions from your tracker.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.deadlines.length ? data.deadlines.slice(0, 4).map((item) => (
                <div key={item.id} className="rounded-lg border p-2.5 text-sm">
                  <p className="truncate font-medium">{item.title}</p>
                  <p className="text-xs text-[var(--muted)]">{item.company} · {formatDateTime(item.at)}</p>
                </div>
              )) : <p className="text-sm text-[var(--muted)]">No upcoming deadlines.</p>}
              {data.upcoming_interviews.length ? data.upcoming_interviews.slice(0, 3).map((item) => (
                <div key={item.id} className="rounded-lg border p-2.5 text-sm">
                  <p className="truncate font-medium">{item.title}</p>
                  <p className="text-xs text-[var(--muted)]">{formatDateTime(item.at)}</p>
                </div>
              )) : null}
              <Link href="/tracker" className="cp-link block pt-1 text-xs">Open tracker</Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" />
                Background tasks
              </CardTitle>
              <CardDescription>Real worker status, not simulated progress.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.tasks.length ? (
                <ul className="space-y-2">
                  {data.tasks.slice(0, 4).map((task) => (
                    <li key={task.id} className="rounded-lg border p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate text-xs font-medium">{task.title}</p>
                        <StatusBadge status={task.status} />
                      </div>
                      <p className="mt-1 text-[11px] text-[var(--muted)]">
                        {task.progress_note || task.status} · {relativeTime(task.queued_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-[var(--muted)]">No tasks yet.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" />
                Quick actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {data.quick_actions.map((action) => (
                <Link key={action.href} href={action.href}
                      className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-[var(--surface-2)]">
                  <span>
                    <span className="block font-medium">{action.label}</span>
                    <span className="block text-xs text-[var(--muted)]">{action.description}</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" aria-hidden="true" />
                </Link>
              ))}
            </CardContent>
          </Card>

          <div className="rounded-xl border bg-[var(--surface)] p-4 text-xs text-[var(--muted)]">
            <p className="flex items-center gap-1.5 font-semibold text-[var(--fg)]">
              <CheckCircle2 className="h-3.5 w-3.5 text-[var(--brand)]" aria-hidden="true" />
              Your first application
            </p>
            <p className="mt-1">
              Profile → import a job → read the match → approve a strategy → generate → resolve
              findings → approve → export. The studio walks the same order.
            </p>
            <Link href="/how-it-works" className="cp-link mt-2 inline-block">See the full workflow</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
