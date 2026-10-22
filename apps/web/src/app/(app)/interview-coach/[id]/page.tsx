"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Lightbulb, Loader2,
  MessageCircleQuestion, Save, Sparkles, Target,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, Alert, Skeleton, Progress, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import type { InterviewAnswer, InterviewDetail, InterviewSummary } from "@/lib/types";
import { formatDateTime, humanize } from "@/lib/utils";

export default function InterviewSessionPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const client = useQueryClient();
  const { toast } = useToast();
  const [index, setIndex] = React.useState(0);
  const [answer, setAnswer] = React.useState("");
  const [feedback, setFeedback] = React.useState<Record<string, InterviewAnswer>>({});
  const [followUps, setFollowUps] = React.useState<Record<string, string>>({});
  const [notes, setNotes] = React.useState("");
  const [notesDirty, setNotesDirty] = React.useState(false);
  const [busy, setBusy] = React.useState("");
  const [summary, setSummary] = React.useState<InterviewSummary | null>(null);

  const query = useQuery({
    queryKey: ["interview", id],
    queryFn: () => api.get<InterviewDetail>(`/interviews/${id}`),
    refetchInterval: (q) => q.state.data?.questions.length ? false : 4000,
  });

  const session = query.data;

  React.useEffect(() => {
    if (!session) return;
    if (!notesDirty) setNotes(session.notes ?? "");
    const map: Record<string, InterviewAnswer> = {};
    for (const entry of session.answers ?? []) map[entry.question_id] = entry;
    setFeedback((current) => ({ ...map, ...current }));
  }, [session, notesDirty]);

  const questions = session?.questions ?? [];
  const question = questions[index];
  const answered = feedback[question?.id ?? ""];
  const answeredCount = Object.keys(feedback).length;

  const submit = async () => {
    if (!question) return;
    setBusy("answer");
    try {
      const result = await api.post<{ answer: InterviewAnswer; session_progress: Record<string, unknown> }>(
        `/interviews/${id}/answer`, { question_id: question.id, answer_text: answer });
      setFeedback((current) => ({ ...current, [question.id]: result.answer }));
      setAnswer("");
      await client.invalidateQueries({ queryKey: ["interview", id] });
      toast({ title: `Answer scored ${result.answer.score ?? "—"}`, tone: "success" });
    } catch (caught) {
      toast({ title: "Could not submit answer",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setBusy("");
    }
  };

  const requestFollowUp = async () => {
    if (!question) return;
    setBusy("follow-up");
    try {
      const result = await api.post<{ follow_up: string }>(
        `/interviews/${id}/questions/${question.id}/follow-up`, { question_id: question.id, use_ai: true });
      setFollowUps((current) => ({ ...current, [question.id]: result.follow_up }));
    } catch (caught) {
      toast({ title: "Could not get a follow-up",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setBusy("");
    }
  };

  const saveNotes = async () => {
    setBusy("notes");
    try {
      await api.patch(`/interviews/${id}/notes`, { notes });
      setNotesDirty(false);
      await client.invalidateQueries({ queryKey: ["interview", id] });
      toast({ title: "Notes saved", tone: "success" });
    } catch (caught) {
      toast({ title: "Could not save notes",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setBusy("");
    }
  };

  const complete = async () => {
    setBusy("complete");
    try {
      const result = await api.post<InterviewSummary>(`/interviews/${id}/complete`);
      setSummary(result);
      await client.invalidateQueries({ queryKey: ["interview", id] });
      await client.invalidateQueries({ queryKey: ["interviews"] });
      toast({ title: "Session completed", tone: "success" });
    } catch (caught) {
      toast({ title: "Could not complete the session",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setBusy("");
    }
  };

  if (query.isLoading) return <div className="space-y-4"><Skeleton className="h-20" /><Skeleton className="h-72" /></div>;
  if (!session) return <Alert tone="danger" title="Session unavailable">This session does not exist or belongs to another account.</Alert>;

  if (!questions.length) {
    return (
      <div>
        <Link href="/interview-coach" className="text-sm text-[var(--muted)]">← Interview coach</Link>
        <EmptyState icon={Loader2} title="Preparing your questions"
                    description="A worker is generating the question set. This page refreshes automatically."
                    action={<span className="inline-flex items-center gap-2 text-xs text-[var(--muted)]">
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Waiting for the worker…
                    </span>} />
        <p className="mt-3 text-center text-xs text-[var(--muted)]">
          If this does not change, check that a background worker is running (Settings → background tasks).
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <Link href="/interview-coach" className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--fg)]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Interview coach
        </Link>
      </div>

      <PageHeader
        eyebrow="Mock session"
        title={session.title}
        description={`${session.questions_source === "ai" ? "AI-generated" : "Question-bank"} questions · created ${formatDateTime(session.created_at)}`}
        actions={
          <>
            <StatusBadge status={session.status} />
            <Button size="sm" loading={busy === "complete"} onClick={() => void complete()}
                    disabled={session.status === "completed" && Boolean(summary)}>
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {session.status === "completed" ? "Completed" : "Finish session"}
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.5fr_0.9fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center justify-between gap-2">
                <span>Question {index + 1} of {questions.length}</span>
                <Badge>{humanize(question.category)}</Badge>
              </CardTitle>
              <CardDescription>{humanize(session.mode)} mode</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={(answeredCount / questions.length) * 100}
                        label={`${answeredCount} of ${questions.length} answered`} />
              <p className="text-base font-medium leading-relaxed">{question.question}</p>
              {question.guidance ? (
                <div className="flex gap-2 rounded-xl border bg-[var(--surface-muted)] p-3 text-sm">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand)]" aria-hidden="true" />
                  <p className="text-[var(--muted)]">{question.guidance}</p>
                </div>
              ) : null}

              {answered ? (
                <div className="space-y-3">
                  <div className="rounded-xl border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">Your answer</p>
                      <Badge tone={(answered.score ?? 0) >= 70 ? "success" : (answered.score ?? 0) >= 50 ? "warning" : "danger"}>
                        {answered.score ?? "—"} / 100 · {answered.evaluator}
                      </Badge>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-sm text-[var(--muted)]">{answered.answer_text}</p>
                  </div>

                  <FeedbackPanel answer={answered} />

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" loading={busy === "follow-up"}
                            onClick={() => void requestFollowUp()}>
                      <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" /> Ask for a follow-up
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAnswer(answered.answer_text)}>
                      Try a revised answer
                    </Button>
                  </div>

                  {followUps[question.id] ? (
                    <Alert tone="info" title="Follow-up question">
                      {followUps[question.id]}
                    </Alert>
                  ) : answered.follow_up ? (
                    <Alert tone="info" title="Follow-up question">{answered.follow_up}</Alert>
                  ) : null}
                </div>
              ) : null}

              <Field label={answered ? "Revised answer" : "Your answer"}
                     htmlFor="interview-answer"
                     help="Aim for the STAR structure and use only real examples. Minimum 10 characters.">
                <Textarea id="interview-answer" rows={8} value={answer}
                          placeholder="Describe the situation, your task, the action you took and the result…"
                          onChange={(event) => setAnswer(event.target.value)} />
              </Field>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={index === 0}
                          onClick={() => { setIndex((value) => value - 1); setAnswer(""); }}>
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={index >= questions.length - 1}
                          onClick={() => { setIndex((value) => value + 1); setAnswer(""); }}>
                    Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
                <Button size="sm" loading={busy === "answer"} disabled={answer.trim().length < 10}
                        onClick={() => void submit()}>
                  <Sparkles className="h-4 w-4" aria-hidden="true" /> {answered ? "Submit revision" : "Submit answer"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {summary ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" /> Session summary
                </CardTitle>
                <CardDescription>
                  Average rubric score: {summary.average_score ?? "—"}. Practice feedback, not a hiring prediction.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                <SummaryList title="Strengths" items={summary.strengths} />
                <SummaryList title="Improvements" items={summary.improvements} />
                <SummaryList title="Next steps" items={summary.next_steps} />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Questions</CardTitle></CardHeader>
            <CardContent className="space-y-1.5">
              {questions.map((entry, entryIndex) => (
                <button key={entry.id} type="button" onClick={() => { setIndex(entryIndex); setAnswer(""); }}
                        className={`flex w-full items-start gap-2 rounded-lg border p-2 text-left text-xs ${
                          entryIndex === index ? "border-[var(--brand)]" : ""
                        }`}>
                  <span className="mt-0.5">
                    {feedback[entry.id] ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-[var(--brand)]" aria-hidden="true" />
                    ) : (
                      <span className="block h-3.5 w-3.5 rounded-full border" aria-hidden="true" />
                    )}
                  </span>
                  <span>
                    <span className="font-medium">{entryIndex + 1}. {entry.question}</span>
                    <span className="mt-0.5 block text-[var(--muted)]">{humanize(entry.category)}</span>
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span>Session notes</span>
                <Button size="sm" variant="outline" loading={busy === "notes"} disabled={!notesDirty}
                        onClick={() => void saveNotes()}>
                  <Save className="h-3.5 w-3.5" aria-hidden="true" /> Save
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea rows={8} aria-label="Session notes" value={notes}
                        placeholder="What went well? What evidence do you need to prepare?"
                        onChange={(event) => { setNotes(event.target.value); setNotesDirty(true); }} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function FeedbackPanel({ answer }: { answer: InterviewAnswer }) {
  const scores = answer.feedback.scores ?? {};
  return (
    <div className="rounded-xl border p-3">
      <p className="text-sm font-semibold">Independent feedback</p>
      {Object.keys(scores).length ? (
        <div className="mt-2 space-y-2">
          {Object.entries(scores).map(([key, value]) => (
            <div key={key}>
              <div className="flex justify-between text-xs">
                <span>{humanize(key)}</span>
                <span>{value}</span>
              </div>
              <Progress value={value} />
            </div>
          ))}
        </div>
      ) : null}
      {answer.feedback.strengths?.length ? (
        <div className="mt-3">
          <p className="text-xs font-semibold">Strengths</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-[var(--muted)]">
            {answer.feedback.strengths.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      ) : null}
      {answer.feedback.improvements?.length ? (
        <div className="mt-2">
          <p className="text-xs font-semibold">Improvements</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-[var(--muted)]">
            {answer.feedback.improvements.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      ) : null}
      {answer.feedback.notes?.length ? (
        <div className="mt-2">
          <p className="text-xs font-semibold">Notes</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-[var(--muted)]">
            {answer.feedback.notes.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      ) : null}
      {typeof answer.feedback.summary === "string" && answer.feedback.summary ? (
        <p className="mt-2 text-xs text-[var(--muted)]">{answer.feedback.summary}</p>
      ) : null}
      {typeof answer.feedback.ai_note === "string" && answer.feedback.ai_note ? (
        <p className="mt-2 text-xs text-[var(--warning)]">{answer.feedback.ai_note}</p>
      ) : null}
    </div>
  );
}

function SummaryList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-sm font-semibold">{title}</p>
      {items.length ? (
        <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-[var(--muted)]">
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : <p className="mt-1 text-xs text-[var(--muted)]">Answer more questions to see this.</p>}
    </div>
  );
}
