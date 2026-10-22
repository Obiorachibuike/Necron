"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AudioLines, ChevronRight, MessagesSquare, NotebookPen, Plus, Target, Trash2,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, Alert, EmptyState, Skeleton, StatCard } from "@/components/ui/misc";
import { Button, buttonStyles } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import type { InterviewSession, Job, Paginated } from "@/lib/types";
import { formatDate, relativeTime } from "@/lib/utils";

type Note = {
  id: string;
  title: string;
  body: string;
  company: string;
  interview_date: string | null;
  session_id: string | null;
  updated_at: string;
};

export default function InterviewCoachPage() {
  const client = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [jobId, setJobId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [count, setCount] = React.useState(10);
  const [useAi, setUseAi] = React.useState(true);
  const [categories, setCategories] = React.useState<string[]>([]);
  const [creating, setCreating] = React.useState(false);
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [note, setNote] = React.useState({ title: "", body: "", company: "" });
  const [savingNote, setSavingNote] = React.useState(false);

  const sessionsQuery = useQuery({
    queryKey: ["interviews"],
    queryFn: () => api.get<InterviewSession[]>("/interviews"),
  });
  const categoriesQuery = useQuery({
    queryKey: ["interview-categories"],
    queryFn: () => api.get<{ key: string; label: string }[]>("/interviews/meta/categories"),
  });
  const jobsQuery = useQuery({
    queryKey: ["jobs", "interview-picker"],
    queryFn: () => api.get<Paginated<Job>>("/jobs?page_size=100&sort=newest"),
  });
  const notesQuery = useQuery({
    queryKey: ["interview-notes"],
    queryFn: () => api.get<Note[]>("/interview-notes"),
  });

  const sessions = sessionsQuery.data ?? [];
  const notes = notesQuery.data ?? [];
  const completed = sessions.filter((session) => session.status === "completed");
  const average = completed.length
    ? Math.round(completed.reduce((sum, session) => sum + (session.overall_score ?? 0), 0) / completed.length * 10) / 10
    : null;

  const createSession = async () => {
    setCreating(true);
    try {
      const result = await api.post<{ session: InterviewSession; message: string }>("/interviews", {
        job_id: jobId || null, title, question_count: count,
        categories, use_ai: useAi,
      });
      setOpen(false);
      setTitle("");
      setCategories([]);
      await client.invalidateQueries({ queryKey: ["interviews"] });
      toast({ title: "Session created", description: result.message, tone: "success" });
      router.push(`/interview-coach/${result.session.id}`);
    } catch (caught) {
      toast({ title: "Could not create a session",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setCreating(false);
    }
  };

  const removeSession = async (session: InterviewSession) => {
    if (!window.confirm(`Delete “${session.title}”? Answers and feedback will be removed.`)) return;
    try {
      await api.del(`/interviews/${session.id}`);
      await client.invalidateQueries({ queryKey: ["interviews"] });
    } catch (caught) {
      toast({ title: "Could not delete session",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    }
  };

  const saveNote = async () => {
    setSavingNote(true);
    try {
      await api.post("/interview-notes", {
        title: note.title, body: note.body, company: note.company,
        interview_date: null,
      });
      setNote({ title: "", body: "", company: "" });
      setNoteOpen(false);
      await client.invalidateQueries({ queryKey: ["interview-notes"] });
      toast({ title: "Note saved", tone: "success" });
    } catch (caught) {
      toast({ title: "Could not save note",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Interview coach"
        title="Practise, then reflect"
        description="Mock sessions use your verified experience and the job description. Feedback is rubric-based and identifies what to improve."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setNoteOpen(true)}>
              <NotebookPen className="h-4 w-4" aria-hidden="true" /> Add note
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Start session
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Sessions" value={sessions.length} icon={MessagesSquare} />
        <StatCard label="Completed" value={completed.length} icon={Target} tone="success" />
        <StatCard label="Average rubric score" value={average ?? "—"} hint="Only completed, scored sessions"
                  icon={AudioLines} tone="neon" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Your sessions</CardTitle>
            <CardDescription>Resume a session at any time; answers are saved individually.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {sessionsQuery.isLoading ? <Skeleton className="h-20" /> : null}
            {!sessionsQuery.isLoading && !sessions.length ? (
              <EmptyState icon={MessagesSquare} title="No sessions yet"
                          description="Pick a job and start a mock interview. Questions are generated from the listing and your verified profile."
                          action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden="true" /> Start your first session</Button>} />
            ) : null}
            {sessions.map((session) => (
              <div key={session.id} className="flex flex-wrap items-center gap-2 rounded-xl border p-3">
                <Link href={`/interview-coach/${session.id}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{session.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)]">
                    <StatusBadge status={session.status} />
                    <span>{session.answered_count}/{session.question_count} answered</span>
                    <span>· {session.questions_source === "ai" ? "AI-generated" : "question bank"}</span>
                    {session.overall_score !== null
                      ? <span>· score {session.overall_score}</span>
                      : null}
                    <span>· {relativeTime(session.created_at)}</span>
                  </p>
                </Link>
                <Link href={`/interview-coach/${session.id}`} className={buttonStyles({ variant: "outline", size: "sm" })}>
                  {session.status === "completed" ? "Review" : "Continue"}
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
                <Button variant="ghost" size="sm" aria-label={`Delete ${session.title}`}
                        onClick={() => void removeSession(session)}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Interview notes</CardTitle>
            <CardDescription>Prep notes and post-interview reflections.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {notes.length ? notes.map((entry) => (
              <div key={entry.id} className="rounded-xl border p-3">
                <p className="text-sm font-medium">{entry.title || "Untitled note"}</p>
                {entry.company ? <p className="text-xs text-[var(--muted)]">{entry.company}</p> : null}
                <p className="mt-1 whitespace-pre-line text-xs text-[var(--muted)]">
                  {entry.body.slice(0, 240)}{entry.body.length > 240 ? "…" : ""}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] text-[var(--muted)]">
                    {entry.interview_date ? formatDate(entry.interview_date) : relativeTime(entry.updated_at)}
                  </span>
                  <Button variant="ghost" size="sm" aria-label="Delete note"
                          onClick={async () => {
                            await api.del(`/interview-notes/${entry.id}`);
                            await client.invalidateQueries({ queryKey: ["interview-notes"] });
                          }}>
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            )) : <p className="text-sm text-[var(--muted)]">No notes yet.</p>}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title="Start a mock interview"
              description="Choose a job to make questions specific. Without a job, questions are general."
              footer={
                <>
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button loading={creating} onClick={() => void createSession()}>Create session</Button>
                </>
              }>
        <div className="space-y-3">
          <Field label="Job (optional)" htmlFor="session-job">
            <Select id="session-job" value={jobId} onChange={(event) => setJobId(event.target.value)}>
              <option value="">General practice</option>
              {(jobsQuery.data?.items ?? []).map((job) => (
                <option key={job.id} value={job.id}>{job.title} — {job.company}</option>
              ))}
            </Select>
          </Field>
          <Field label="Session title (optional)" htmlFor="session-title">
            <Input id="session-title" value={title} placeholder="Technical screen practice"
                   onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Questions" htmlFor="session-count">
              <Input id="session-count" type="number" min={3} max={25} value={count}
                     onChange={(event) => setCount(Number(event.target.value))} />
            </Field>
            <div className="flex items-end">
              <label className="flex h-10 items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-[#39FF14]" checked={useAi}
                       onChange={(event) => setUseAi(event.target.checked)} />
                Use AI when configured
              </label>
            </div>
          </div>
          <fieldset>
            <legend className="cp-label">Focus categories</legend>
            <div className="flex flex-wrap gap-1.5">
              {(categoriesQuery.data ?? []).map((category) => (
                <label key={category.key} className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
                  <input type="checkbox" className="h-3.5 w-3.5 accent-[#39FF14]"
                         checked={categories.includes(category.key)}
                         onChange={() => setCategories((current) => current.includes(category.key)
                           ? current.filter((entry) => entry !== category.key)
                           : [...current, category.key])} />
                  {category.label}
                </label>
              ))}
            </div>
          </fieldset>
          <Alert tone="info">
            Practice only. These sessions do not score real interviews or send anything to employers.
          </Alert>
        </div>
      </Dialog>

      <Dialog open={noteOpen} onClose={() => setNoteOpen(false)} title="Interview note"
              footer={
                <>
                  <Button variant="ghost" onClick={() => setNoteOpen(false)}>Cancel</Button>
                  <Button loading={savingNote} onClick={() => void saveNote()}>Save note</Button>
                </>
              }>
        <div className="space-y-3">
          <Field label="Title" htmlFor="note-title">
            <Input id="note-title" value={note.title}
                   onChange={(event) => setNote((current) => ({ ...current, title: event.target.value }))} />
          </Field>
          <Field label="Company" htmlFor="note-company">
            <Input id="note-company" value={note.company}
                   onChange={(event) => setNote((current) => ({ ...current, company: event.target.value }))} />
          </Field>
          <Field label="Notes" htmlFor="note-body">
            <Textarea id="note-body" rows={6} value={note.body}
                      onChange={(event) => setNote((current) => ({ ...current, body: event.target.value }))} />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
