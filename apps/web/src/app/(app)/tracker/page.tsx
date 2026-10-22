"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Bell, BellRing, CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Columns3,
  ExternalLink, List, Plus, Search, Trash2,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, Alert, EmptyState, Skeleton, StatCard } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import type {
  Application, ApplicationDetail, ApplicationStats, Job, Paginated, Reminder,
} from "@/lib/types";
import { formatDate, formatDateTime, humanize, isoDate } from "@/lib/utils";

const COLUMNS: { key: string; label: string }[] = [
  { key: "saved", label: "Saved" },
  { key: "planning", label: "Planning" },
  { key: "documents_in_progress", label: "Documents" },
  { key: "ready_to_apply", label: "Ready to apply" },
  { key: "applied", label: "Applied" },
  { key: "assessment", label: "Assessment" },
  { key: "interview", label: "Interview" },
  { key: "offer", label: "Offer" },
];

const CLOSED = ["rejected", "withdrawn", "closed"];

type CalendarItem = {
  kind: string;
  title: string;
  company: string;
  at: string;
  application_id?: string;
  reminder_id?: string;
  session_id?: string;
};

export default function TrackerPage() {
  return (
    <React.Suspense fallback={<Skeleton className="h-40" />}>
      <Tracker />
    </React.Suspense>
  );
}

function Tracker() {
  const searchParams = useSearchParams();
  const client = useQueryClient();
  const { toast } = useToast();
  const [view, setView] = React.useState("board");
  const [q, setQ] = React.useState("");
  const [openId, setOpenId] = React.useState<string | null>(searchParams.get("application"));
  const [createOpen, setCreateOpen] = React.useState(false);
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [month, setMonth] = React.useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const applicationsQuery = useQuery({
    queryKey: ["applications", q],
    queryFn: () => api.get<Paginated<Application>>(
      `/applications?page_size=200${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  });
  const statsQuery = useQuery({
    queryKey: ["application-stats"],
    queryFn: () => api.get<ApplicationStats>("/applications/stats"),
  });
  const remindersQuery = useQuery({
    queryKey: ["reminders"],
    queryFn: () => api.get<Reminder[]>("/reminders?include_completed=false"),
  });
  const calendarQuery = useQuery({
    queryKey: ["calendar", month.toISOString()],
    queryFn: () => {
      const start = new Date(month.getFullYear(), month.getMonth(), 1);
      const end = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59);
      return api.get<CalendarItem[]>(
        `/applications/calendar?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`);
    },
  });

  const applications = applicationsQuery.data?.items ?? [];
  const reminders = remindersQuery.data ?? [];

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["applications"] }),
      client.invalidateQueries({ queryKey: ["application-stats"] }),
      client.invalidateQueries({ queryKey: ["reminders"] }),
      client.invalidateQueries({ queryKey: ["calendar"] }),
    ]);
  };

  const changeStatus = async (application: Application, status: string) => {
    try {
      await api.post(`/applications/${application.id}/status`, { status, note: "" });
      await refresh();
      toast({ title: `Moved to ${humanize(status)}`, tone: "success" });
    } catch (caught) {
      toast({ title: "Could not change status",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    }
  };

  const completeReminder = async (reminder: Reminder) => {
    try {
      await api.patch(`/reminders/${reminder.id}`, { completed: true });
      await refresh();
    } catch (caught) {
      toast({ title: "Could not complete reminder",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    }
  };

  const closed = applications.filter((application) => CLOSED.includes(application.status));
  const active = applications.filter((application) => !CLOSED.includes(application.status));
  const stats = statsQuery.data;

  return (
    <div>
      <PageHeader
        eyebrow="Tracker"
        title="Application tracker"
        description="Every application, its real status history and the next action you owe it."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setView("board")}>Board</Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Add application
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active applications" value={stats?.active ?? "—"} icon={Columns3} />
        <StatCard label="Interviews" value={stats?.interviews ?? "—"} icon={CalendarDays} tone="info" />
        <StatCard label="Offers" value={stats?.offers ?? "—"} icon={Check} tone="success" />
        <StatCard label="Response rate" value={stats?.response_rate !== null && stats?.response_rate !== undefined ? `${stats.response_rate}%` : "—"}
                  hint="Responses ÷ applications marked applied" icon={Bell} tone="neon" />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Tabs ariaLabel="Tracker view" value={view} onChange={setView}
              tabs={[{ value: "board", label: "Board" }, { value: "table", label: "Table" },
                     { value: "calendar", label: "Calendar" }]} />
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--muted)]" aria-hidden="true" />
          <Input value={q} onChange={(event) => setQ(event.target.value)}
                 placeholder="Search company or role…" aria-label="Search applications" className="w-60 pl-9" />
        </div>
      </div>

      {reminders.length ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-[var(--warning)]" aria-hidden="true" /> Open reminders
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {reminders.map((reminder) => (
              <div key={reminder.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
                reminder.overdue ? "border-[var(--danger)]/40" : ""
              }`}>
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  <span className="font-medium">{reminder.title}</span>{" "}
                  <span className="text-[var(--muted)]">· {formatDateTime(reminder.due_at)}</span>
                  {reminder.overdue ? <Badge tone="danger" className="ml-1">overdue</Badge> : null}
                </span>
                <Button variant="ghost" size="sm" aria-label={`Complete ${reminder.title}`}
                        onClick={() => void completeReminder(reminder)}>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="mt-4">
        {applicationsQuery.isLoading ? <Skeleton className="h-64" /> : null}

        {view === "board" ? (
          <div className="-mx-1 flex snap-x gap-3 overflow-x-auto pb-3">
            {COLUMNS.map((column) => {
              const items = active.filter((application) => application.status === column.key);
              return (
                <div key={column.key}
                     onDragOver={(event) => event.preventDefault()}
                     onDrop={() => { if (dragging) {
                       const application = applications.find((entry) => entry.id === dragging);
                       if (application && application.status !== column.key) void changeStatus(application, column.key);
                       setDragging(null);
                     } }}
                     className="min-w-[15rem] flex-1 snap-start rounded-2xl border bg-[var(--surface-muted)] p-2">
                  <div className="flex items-center justify-between px-1 py-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide">{column.label}</p>
                    <Badge>{items.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {items.map((application) => (
                      <button key={application.id} type="button" draggable
                              onDragStart={() => setDragging(application.id)}
                              onDragEnd={() => setDragging(null)}
                              onClick={() => setOpenId(application.id)}
                              className="w-full rounded-xl border bg-[var(--surface)] p-2.5 text-left shadow-sm transition hover:border-[var(--brand)]/50">
                        <p className="text-sm font-medium leading-snug">{application.role_title}</p>
                        <p className="text-xs text-[var(--muted)]">{application.company || "Company not set"}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          {application.overdue ? <Badge tone="danger">overdue</Badge> : null}
                          {application.next_action_at ? (
                            <span className="text-[10px] text-[var(--muted)]">
                              Next: {formatDate(application.next_action_at)}
                            </span>
                          ) : null}
                        </div>
                      </button>
                    ))}
                    {!items.length ? (
                      <p className="px-1 py-3 text-[11px] text-[var(--muted)]">Nothing here.</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {closed.length ? (
              <div className="min-w-[15rem] flex-1 rounded-2xl border bg-[var(--surface-muted)] p-2">
                <div className="flex items-center justify-between px-1 py-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide">Closed</p>
                  <Badge>{closed.length}</Badge>
                </div>
                <div className="space-y-2">
                  {closed.map((application) => (
                    <button key={application.id} type="button" onClick={() => setOpenId(application.id)}
                            className="w-full rounded-xl border bg-[var(--surface)] p-2.5 text-left">
                      <p className="text-sm font-medium">{application.role_title}</p>
                      <p className="text-xs text-[var(--muted)]">{application.company}</p>
                      <StatusBadge status={application.status} />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {view === "table" ? (
          applications.length ? (
            <div className="overflow-x-auto rounded-xl border">
              <table className="cp-table">
                <caption className="sr-only">Applications</caption>
                <thead>
                  <tr>
                    <th scope="col">Role</th><th scope="col">Company</th><th scope="col">Status</th>
                    <th scope="col">Applied</th><th scope="col">Next action</th><th scope="col">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((application) => (
                    <tr key={application.id} className="cursor-pointer" onClick={() => setOpenId(application.id)}>
                      <td className="font-medium">{application.role_title}</td>
                      <td>{application.company}</td>
                      <td><StatusBadge status={application.status} /></td>
                      <td>{application.applied_at ? formatDate(application.applied_at) : "—"}</td>
                      <td>{application.next_action_at ? formatDate(application.next_action_at) : "—"}</td>
                      <td className="text-[var(--muted)]">{formatDate(application.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState icon={List} title="No applications" description="Add one manually or from a job." />
        ) : null}

        {view === "calendar" ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <Button variant="ghost" size="sm" aria-label="Previous month"
                        onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <span>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
                <Button variant="ghost" size="sm" aria-label="Next month"
                        onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MonthGrid month={month} items={calendarQuery.data ?? []} onOpen={setOpenId} />
            </CardContent>
          </Card>
        ) : null}
      </div>

      <CreateApplicationDialog open={createOpen} onClose={() => setCreateOpen(false)}
                               onCreated={async (id) => { setCreateOpen(false); await refresh(); setOpenId(id); }} />

      {openId ? (
        <ApplicationDialog id={openId} onClose={() => setOpenId(null)} onChanged={refresh} />
      ) : null}
    </div>
  );
}

function MonthGrid({ month, items, onOpen }: {
  month: Date; items: CalendarItem[]; onOpen: (id: string) => void;
}) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-[var(--muted)]">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div key={day}>{day}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, index) => {
          if (!day) return <div key={`empty-${index}`} className="min-h-20 rounded-lg" />;
          const date = new Date(month.getFullYear(), month.getMonth(), day);
          const dayItems = items.filter((item) => isoDate(item.at) === isoDate(date));
          return (
            <div key={day} className="min-h-20 rounded-lg border p-1 text-left align-top">
              <p className="text-[10px] font-semibold text-[var(--muted)]">{day}</p>
              <div className="mt-1 space-y-0.5">
                {dayItems.slice(0, 3).map((item, itemIndex) => (
                  <button key={itemIndex} type="button"
                          disabled={!item.application_id}
                          onClick={() => item.application_id && onOpen(item.application_id)}
                          className="block w-full truncate rounded bg-[var(--surface-muted)] px-1 py-0.5 text-left text-[10px] hover:underline">
                    {item.kind === "deadline" ? "⏰ " : item.kind === "interview_session" ? "🎤 " : "• "}
                    {item.title}
                  </button>
                ))}
                {dayItems.length > 3 ? (
                  <p className="text-[9px] text-[var(--muted)]">+{dayItems.length - 3} more</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CreateApplicationDialog({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (id: string) => Promise<void>;
}) {
  const { toast } = useToast();
  const [jobId, setJobId] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [role, setRole] = React.useState("");
  const [status, setStatus] = React.useState("saved");
  const [url, setUrl] = React.useState("");
  const [deadline, setDeadline] = React.useState("");
  const [nextAction, setNextAction] = React.useState("");
  const [nextNote, setNextNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const jobsQuery = useQuery({
    queryKey: ["jobs", "application-picker"],
    queryFn: () => api.get<Paginated<Job>>("/jobs?page_size=100&sort=newest"),
    enabled: open,
  });

  const create = async () => {
    setSaving(true);
    try {
      const application = await api.post<ApplicationDetail>("/applications", {
        job_id: jobId || null,
        company, role_title: role, status,
        application_url: url,
        deadline_at: deadline ? new Date(deadline).toISOString() : null,
        next_action_at: nextAction ? new Date(nextAction).toISOString() : null,
        next_action_note: nextNote,
      });
      toast({ title: "Application added", tone: "success" });
      await onCreated(application.id);
    } catch (caught) {
      toast({ title: "Could not add application",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Add application" size="lg"
            description="Track an application you found anywhere, or link one of your jobs."
            footer={
              <>
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
                <Button loading={saving} onClick={() => void create()}>Add application</Button>
              </>
            }>
      <div className="space-y-3">
        <Field label="Linked job (optional)" htmlFor="app-job"
               help="Linking a job keeps matching and document generation connected.">
          <Select id="app-job" value={jobId} onChange={(event) => {
            setJobId(event.target.value);
            const job = jobsQuery.data?.items.find((entry) => entry.id === event.target.value);
            if (job) { setCompany(job.company); setRole(job.title); }
          }}>
            <option value="">No linked job</option>
            {(jobsQuery.data?.items ?? []).map((job) => (
              <option key={job.id} value={job.id}>{job.title} — {job.company}</option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Company" htmlFor="app-company" required>
            <Input id="app-company" value={company} onChange={(event) => setCompany(event.target.value)} />
          </Field>
          <Field label="Role title" htmlFor="app-role" required>
            <Input id="app-role" value={role} onChange={(event) => setRole(event.target.value)} />
          </Field>
          <Field label="Status" htmlFor="app-status">
            <Select id="app-status" value={status} onChange={(event) => setStatus(event.target.value)}>
              {[...COLUMNS.map((column) => column.key), ...CLOSED].map((value) => (
                <option key={value} value={value}>{humanize(value)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Application URL" htmlFor="app-url">
            <Input id="app-url" value={url} placeholder="https://…"
                   onChange={(event) => setUrl(event.target.value)} />
          </Field>
          <Field label="Deadline" htmlFor="app-deadline">
            <Input id="app-deadline" type="datetime-local" value={deadline}
                   onChange={(event) => setDeadline(event.target.value)} />
          </Field>
          <Field label="Next action" htmlFor="app-next">
            <Input id="app-next" type="datetime-local" value={nextAction}
                   onChange={(event) => setNextAction(event.target.value)} />
          </Field>
        </div>
        <Field label="Next action note" htmlFor="app-next-note">
          <Input id="app-next-note" value={nextNote} placeholder="Follow up with the recruiter"
                 onChange={(event) => setNextNote(event.target.value)} />
        </Field>
        <Alert tone="info">
          CareerPilot never submits applications. You record what you did on the employer&apos;s site.
        </Alert>
      </div>
    </Dialog>
  );
}

function ApplicationDialog({ id, onClose, onChanged }: {
  id: string; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["application", id],
    queryFn: () => api.get<ApplicationDetail>(`/applications/${id}`),
  });
  const [status, setStatus] = React.useState("");
  const [note, setNote] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [notesDirty, setNotesDirty] = React.useState(false);
  const [reminderTitle, setReminderTitle] = React.useState("");
  const [reminderAt, setReminderAt] = React.useState("");
  const [reminderKind, setReminderKind] = React.useState("follow_up");
  const [busy, setBusy] = React.useState("");

  React.useEffect(() => {
    if (!data) return;
    if (!status) setStatus(data.status);
    if (!notesDirty) setNotes(data.notes ?? "");
  }, [data, status, notesDirty]);

  const update = async (patch: Record<string, unknown>, label: string) => {
    setBusy(label);
    try {
      await api.patch(`/applications/${id}`, patch);
      await onChanged();
      toast({ title: "Application updated", tone: "success" });
    } catch (caught) {
      toast({ title: "Update failed",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally { setBusy(""); }
  };

  const changeStatus = async () => {
    setBusy("status");
    try {
      await api.post(`/applications/${id}/status`, { status, note });
      setNote("");
      await onChanged();
      toast({ title: `Status moved to ${humanize(status)}`, tone: "success" });
    } catch (caught) {
      toast({ title: "Status change failed",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally { setBusy(""); }
  };

  const addReminder = async () => {
    setBusy("reminder");
    try {
      await api.post("/reminders", {
        application_id: id, kind: reminderKind, title: reminderTitle,
        due_at: new Date(reminderAt).toISOString(), notes: "",
      });
      setReminderTitle("");
      setReminderAt("");
      await onChanged();
      toast({ title: "Reminder set", tone: "success" });
    } catch (caught) {
      toast({ title: "Could not set reminder",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally { setBusy(""); }
  };

  const remove = async () => {
    if (!data || !window.confirm(`Delete the application for ${data.role_title} at ${data.company}?`)) return;
    setBusy("delete");
    try {
      await api.del(`/applications/${id}`);
      await onChanged();
      onClose();
    } catch (caught) {
      toast({ title: "Delete failed", description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally { setBusy(""); }
  };

  return (
    <Dialog open onClose={onClose} size="xl"
            title={data ? data.role_title : "Application"}
            description={data ? `${data.company} · ${humanize(data.status)} · updated ${formatDateTime(data.updated_at)}` : undefined}>
      {isLoading || !data ? <Skeleton className="h-40" /> : (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <p className="cp-label">Status &amp; history</p>
              <div className="flex flex-wrap gap-2">
                <Select aria-label="New status" value={status} onChange={(event) => setStatus(event.target.value)} className="w-44">
                  {[...COLUMNS.map((column) => column.key), ...CLOSED].map((value) => (
                    <option key={value} value={value}>{humanize(value)}</option>
                  ))}
                </Select>
                <Button size="sm" loading={busy === "status"} disabled={status === data.status}
                        onClick={() => void changeStatus()}>Update</Button>
              </div>
              <Input value={note} onChange={(event) => setNote(event.target.value)}
                     placeholder="Optional note for the timeline" aria-label="Status note" className="mt-2" />
              <ol className="mt-3 space-y-2">
                {data.events.map((event) => (
                  <li key={event.id} className="rounded-lg border p-2 text-xs">
                    <span className="font-medium">
                      {event.from_status ? `${humanize(event.from_status)} → ` : ""}{humanize(event.to_status)}
                    </span>
                    <span className="text-[var(--muted)]"> · {formatDateTime(event.occurred_at)}</span>
                    {event.note ? <p className="mt-0.5 text-[var(--muted)]">{event.note}</p> : null}
                  </li>
                ))}
                {!data.events.length ? <li className="text-xs text-[var(--muted)]">No history yet.</li> : null}
              </ol>
            </div>

            <Field label="Deadline" htmlFor="detail-deadline">
              <Input id="detail-deadline" type="datetime-local"
                     defaultValue={data.deadline_at ? data.deadline_at.slice(0, 16) : ""}
                     onBlur={(event) => {
                       const value = event.target.value;
                       void update({ deadline_at: value ? new Date(value).toISOString() : null }, "deadline");
                     }} />
            </Field>
            <Field label="Next action" htmlFor="detail-next">
              <Input id="detail-next" type="datetime-local"
                     defaultValue={data.next_action_at ? data.next_action_at.slice(0, 16) : ""}
                     onBlur={(event) => {
                       const value = event.target.value;
                       void update({ next_action_at: value ? new Date(value).toISOString() : null }, "next");
                     }} />
            </Field>
            <Field label="Next action note" htmlFor="detail-next-note">
              <Input id="detail-next-note" defaultValue={data.next_action_note}
                     onBlur={(event) => void update({ next_action_note: event.target.value }, "next-note")} />
            </Field>
          </div>

          <div className="space-y-4">
            <div>
              <p className="cp-label">Reminders</p>
              <ul className="space-y-1.5">
                {data.reminders.map((reminder) => (
                  <li key={reminder.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-xs">
                    <span>
                      {reminder.title}
                      <span className="text-[var(--muted)]"> · {formatDateTime(reminder.due_at)}</span>
                      {reminder.completed_at ? <Badge tone="success" className="ml-1">done</Badge> : null}
                      {reminder.overdue ? <Badge tone="danger" className="ml-1">overdue</Badge> : null}
                    </span>
                    {!reminder.completed_at ? (
                      <Button variant="ghost" size="sm" aria-label="Complete reminder"
                              onClick={async () => {
                                await api.patch(`/reminders/${reminder.id}`, { completed: true });
                                await onChanged();
                              }}>
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    ) : null}
                  </li>
                ))}
                {!data.reminders.length ? <li className="text-xs text-[var(--muted)]">No reminders.</li> : null}
              </ul>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input value={reminderTitle} placeholder="Reminder title"
                       onChange={(event) => setReminderTitle(event.target.value)}
                       aria-label="Reminder title" />
                <Select aria-label="Reminder kind" value={reminderKind}
                        onChange={(event) => setReminderKind(event.target.value)}>
                  {["follow_up", "deadline", "interview", "assessment", "custom"].map((kind) => (
                    <option key={kind} value={kind}>{humanize(kind)}</option>
                  ))}
                </Select>
              </div>
              <div className="mt-2 flex gap-2">
                <Input type="datetime-local" value={reminderAt} aria-label="Reminder due date"
                       onChange={(event) => setReminderAt(event.target.value)} />
                <Button size="sm" loading={busy === "reminder"}
                        disabled={!reminderTitle.trim() || !reminderAt}
                        onClick={() => void addReminder()}>Add</Button>
              </div>
            </div>

            <div>
              <p className="cp-label">Notes</p>
              <Textarea rows={5} value={notes} aria-label="Application notes"
                        onChange={(event) => { setNotes(event.target.value); setNotesDirty(true); }} />
              <Button size="sm" variant="outline" className="mt-2" loading={busy === "notes"}
                      disabled={!notesDirty}
                      onClick={async () => {
                        await update({ notes }, "notes");
                        setNotesDirty(false);
                      }}>Save notes</Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {data.job_id ? (
                <Link href={`/studio/${data.job_id}`} className="text-sm cp-link inline-flex items-center gap-1">
                  Application Studio <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </Link>
              ) : null}
              {data.cv_document_id ? (
                <Link href={`/documents/${data.cv_document_id}`} className="text-sm cp-link">CV version</Link>
              ) : null}
              {data.cover_letter_document_id ? (
                <Link href={`/documents/${data.cover_letter_document_id}`} className="text-sm cp-link">Cover letter</Link>
              ) : null}
              {data.application_url ? (
                <a href={data.application_url} target="_blank" rel="noopener noreferrer"
                   className="text-sm cp-link inline-flex items-center gap-1">
                  Employer site <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              ) : null}
            </div>

            <Button variant="ghost" size="sm" loading={busy === "delete"} onClick={() => void remove()}>
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete application
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
