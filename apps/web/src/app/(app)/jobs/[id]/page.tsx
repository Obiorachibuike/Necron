"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, BadgeCheck, Bookmark, BookmarkCheck, BriefcaseBusiness,
  Building2, CalendarDays, CheckCircle2, ExternalLink, FileText, MapPin, RefreshCw,
  Route, Sparkles, Trash2, TriangleAlert, Wallet,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, Alert, Skeleton, EmptyState } from "@/components/ui/misc";
import { Button, buttonStyles } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MatchScore, ScoreBreakdown } from "@/components/match-score";
import { Field, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import type { Job, ProfileBundle, Strategy } from "@/lib/types";
import { formatDate, formatDateTime, formatMoney, humanize } from "@/lib/utils";

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const client = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState("");
  const [strategy, setStrategy] = React.useState<Strategy | null>(null);
  const [positioning, setPositioning] = React.useState("");
  const [highlights, setHighlights] = React.useState("");
  const [gaps, setGaps] = React.useState("");
  const [keywords, setKeywords] = React.useState("");
  const [selectedExperiences, setSelectedExperiences] = React.useState<string[]>([]);
  const [selectedProjects, setSelectedProjects] = React.useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = React.useState<string[]>([]);
  const [approved, setApproved] = React.useState(false);

  const jobQuery = useQuery({
    queryKey: ["job", id],
    queryFn: () => api.get<Job>(`/jobs/${id}`),
  });
  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: () => api.get<ProfileBundle>("/profile"),
  });

  const hydrateStrategy = React.useCallback((next: Strategy) => {
    setStrategy(next);
    setPositioning(next.positioning ?? "");
    setHighlights(next.highlights?.join("\n") ?? "");
    setGaps(next.gaps?.join("\n") ?? "");
    setKeywords(next.keywords?.join(", ") ?? "");
    setSelectedExperiences(next.selected_experience_ids ?? []);
    setSelectedProjects(next.selected_project_ids ?? []);
    setSelectedSkills(next.selected_skill_ids ?? []);
    setApproved(next.approved);
  }, []);

  React.useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api.get<Strategy | null>(`/jobs/${id}/strategy`)
      .then((data) => { if (!cancelled && data) hydrateStrategy(data); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [id, hydrateStrategy]);

  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["job", id] });
    await client.invalidateQueries({ queryKey: ["jobs"] });
    await client.invalidateQueries({ queryKey: ["dashboard"] });
  };

  if (jobQuery.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  }
  if (jobQuery.error || !jobQuery.data) {
    return <Alert tone="danger" title="Job unavailable">This listing could not be loaded, or it belongs to another account.</Alert>;
  }

  const job = jobQuery.data;
  const profile = profileQuery.data;
  const score = job.match?.overall_score ?? job.match_score ?? null;
  const category = job.match?.category ?? job.match_category ?? undefined;

  const toggleSave = async () => {
    setBusy("save");
    try {
      await api.patch(`/jobs/${id}`, { is_saved: !job.is_saved });
      await refresh();
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete “${job.title}” from your workspace?`)) return;
    setBusy("delete");
    try {
      await api.del(`/jobs/${id}`);
      toast({ title: "Job deleted", tone: "success" });
      router.push("/discover");
    } finally {
      setBusy("");
    }
  };

  const runMatch = async () => {
    setBusy("match");
    try {
      await api.post(`/jobs/${id}/match`);
      await refresh();
      toast({ title: "Match refreshed", tone: "success" });
    } catch (caught) {
      toast({ title: "Could not score this job",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setBusy("");
    }
  };

  const buildStrategy = async (useAi: boolean) => {
    setBusy("strategy");
    try {
      const result = await api.post<Strategy>(`/jobs/${id}/strategy?use_ai=${useAi}`);
      hydrateStrategy(result);
      if (result.ai_message) {
        toast({ title: "Strategy ready", description: result.ai_message, tone: "info" });
      } else {
        toast({ title: "Strategy built from verified evidence", tone: "success" });
      }
    } catch (caught) {
      toast({ title: "Could not build strategy",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setBusy("");
    }
  };

  const saveStrategy = async (approve: boolean) => {
    if (!strategy) return;
    setBusy(approve ? "approve" : "save");
    try {
      const result = await api.patch<Strategy>(`/jobs/strategies/${strategy.id}`, {
        positioning,
        selected_experience_ids: selectedExperiences,
        selected_project_ids: selectedProjects,
        selected_skill_ids: selectedSkills,
        highlights: highlights.split("\n").map((v) => v.trim()).filter(Boolean),
        gaps: gaps.split("\n").map((v) => v.trim()).filter(Boolean),
        keywords: keywords.split(",").map((v) => v.trim()).filter(Boolean),
        approved: approve,
      });
      hydrateStrategy(result);
      toast({ title: approve ? "Strategy approved" : "Strategy saved",
              description: approve ? "You can now generate documents." : undefined,
              tone: "success" });
    } catch (caught) {
      toast({ title: "Could not save strategy",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setBusy("");
    }
  };

  const createApplication = async () => {
    setBusy("application");
    try {
      const application = await api.post<{ id: string }>("/applications", {
        job_id: id, company: job.company, role_title: job.title, location: job.location,
        source: job.provider, application_url: job.apply_url || job.source_url,
        status: "saved",
      });
      toast({ title: "Added to tracker", tone: "success" });
      router.push(`/tracker?application=${application.id}`);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "application_exists") {
        // One active application per job: open the existing one instead of duplicating it.
        const existing = caught.details.find((detail) => detail.field === "application_id")?.message;
        toast({ title: "Already in your tracker", tone: "info" });
        if (existing) router.push(`/tracker?application=${existing}`);
        return;
      }
      toast({ title: "Could not add to tracker",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setBusy("");
    }
  };

  const toggleId = (list: string[], idValue: string, setter: (next: string[]) => void) => {
    setter(list.includes(idValue) ? list.filter((entry) => entry !== idValue) : [...list, idValue]);
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href="/discover" className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--fg)]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to jobs
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" loading={busy === "save"} onClick={() => void toggleSave()}>
            {job.is_saved ? <BookmarkCheck className="h-4 w-4" aria-hidden="true" /> : <Bookmark className="h-4 w-4" aria-hidden="true" />}
            {job.is_saved ? "Saved" : "Save"}
          </Button>
          <Button variant="ghost" size="sm" loading={busy === "delete"} onClick={() => void remove()}>
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
          </Button>
        </div>
      </div>

      <PageHeader
        eyebrow={job.provider ? `Source: ${job.provider}` : "Imported job"}
        title={job.title}
        description={[job.company, job.location].filter(Boolean).join(" · ")}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void createApplication()}
                    loading={busy === "application"}>
              <BriefcaseBusiness className="h-4 w-4" aria-hidden="true" /> Add to tracker
            </Button>
            <Link href={`/studio/${job.id}`} className={buttonStyles({ size: "sm" })}>
              <Route className="h-4 w-4" aria-hidden="true" /> Application Studio
            </Link>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.5fr_0.9fr]">
        <div className="space-y-5">
          <div className="cp-card p-5">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge><MapPin className="h-3 w-3" aria-hidden="true" /> {job.location || "Location unknown"}</Badge>
              <Badge>{humanize(job.work_arrangement)}</Badge>
              <Badge>{humanize(job.employment_type)}</Badge>
              <Badge>{humanize(job.experience_level)}</Badge>
              {job.industry ? <Badge>{job.industry}</Badge> : null}
              <StatusBadge status={job.listing_status} />
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--muted)]">
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3" aria-hidden="true" /> {job.company || "Company not stated"}
              </span>
              <span className="flex items-center gap-1">
                <Wallet className="h-3 w-3" aria-hidden="true" />
                {job.salary_min || job.salary_max
                  ? `${job.salary_min ? formatMoney(job.salary_min, job.salary_currency) : "—"} – ${job.salary_max ? formatMoney(job.salary_max, job.salary_currency) : "—"} / ${job.salary_period}`
                  : "Salary not stated"}
              </span>
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" aria-hidden="true" />
                {job.posted_at ? `Posted ${formatDate(job.posted_at)}` : "Post date unknown"}
              </span>
            </div>
            {job.apply_url || job.source_url ? (
              <a href={job.apply_url || job.source_url} target="_blank" rel="noopener noreferrer"
                 className="cp-link mt-3 inline-flex items-center gap-1 text-sm">
                Original posting <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            ) : null}
          </div>

          <Card>
            <CardHeader><CardTitle>Description</CardTitle></CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--muted)]">
                {job.description || "No description was provided for this import."}
              </p>
            </CardContent>
          </Card>

          {job.requirements.length ? (
            <Card>
              <CardHeader><CardTitle>Requirements</CardTitle></CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
                  {job.requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {job.responsibilities.length ? (
            <Card>
              <CardHeader><CardTitle>Responsibilities</CardTitle></CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
                  {job.responsibilities.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {job.skills.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Skills in the listing</CardTitle>
                <CardDescription>Highlighted skills match your verified profile.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {job.skills.map((skill) => (
                  <Badge key={skill} tone={job.match?.matched_skills?.includes(skill) ? "neon" : "neutral"}>
                    {skill}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span>Match</span>
                {job.match ? <StatusBadge status={job.match.method === "deterministic_v1" ? "approved" : "info"}
                                          label={job.match.method.replace(/_/g, " ")} /> : null}
              </CardTitle>
              <CardDescription>Deterministic weights. AI can explain, never override.</CardDescription>
            </CardHeader>
            <CardContent>
              <MatchScore score={score} category={category} size="lg" />
              <p className="mt-3 text-sm text-[var(--muted)]">
                {job.match?.explanation || "Run a match to see the evidence behind each category."}
              </p>
              {job.match?.breakdown?.length ? (
                <div className="mt-4"><ScoreBreakdown breakdown={job.match.breakdown} /></div>
              ) : null}
              {job.match?.matched_skills?.length ? (
                <div className="mt-4">
                  <p className="text-xs font-semibold">Matched skills</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {job.match.matched_skills.map((skill) => <Badge key={skill} tone="neon">{skill}</Badge>)}
                  </div>
                </div>
              ) : null}
              {job.match?.missing_skills?.length ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold">Missing or unverified</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {job.match.missing_skills.map((skill) => <Badge key={skill} tone="warning">{skill}</Badge>)}
                  </div>
                </div>
              ) : null}
              <Button className="mt-4 w-full" variant="outline" loading={busy === "match"}
                      onClick={() => void runMatch()}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                {job.match ? "Refresh match" : "Score this job"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Route className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" /> Application strategy
              </CardTitle>
              <CardDescription>
                Approve the evidence selection before any document is generated.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!strategy ? (
                <div className="space-y-3">
                  <p className="text-sm text-[var(--muted)]">
                    Build a strategy from your verified experience, projects and skills. You can edit
                    every field before approving.
                  </p>
                  <div className="flex flex-col gap-2">
                    <Button loading={busy === "strategy"} onClick={() => void buildStrategy(false)}>
                      <Sparkles className="h-4 w-4" aria-hidden="true" /> Build from verified evidence
                    </Button>
                    <Button variant="outline" loading={busy === "strategy"}
                            onClick={() => void buildStrategy(true)}>
                      Use AI assistance
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={strategy.approved ? "approved" : "needs_user_confirmation"}
                                  label={strategy.approved ? "Approved" : "Not approved"} />
                    <Badge>{strategy.source.replace(/_/g, " ")}</Badge>
                  </div>
                  <Field label="Positioning" htmlFor="positioning">
                    <Textarea id="positioning" rows={4} value={positioning}
                              onChange={(event) => setPositioning(event.target.value)} />
                  </Field>

                  <fieldset>
                    <legend className="cp-label">Experience to lead with</legend>
                    <div className="space-y-1.5">
                      {(profile?.experiences ?? []).map((experience) => (
                        <label key={experience.id} className="flex items-start gap-2 rounded-lg border p-2 text-xs">
                          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#39FF14]"
                                 checked={selectedExperiences.includes(experience.id)}
                                 onChange={() => toggleId(selectedExperiences, experience.id, setSelectedExperiences)} />
                          <span>
                            <span className="font-medium">{experience.title} · {experience.employer}</span>
                            {!experience.verified ? (
                              <span className="ml-1 text-[var(--warning)]">(unverified)</span>
                            ) : null}
                          </span>
                        </label>
                      ))}
                      {!(profile?.experiences ?? []).length ? (
                        <p className="text-xs text-[var(--muted)]">No experience records yet.</p>
                      ) : null}
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend className="cp-label">Projects</legend>
                    <div className="space-y-1.5">
                      {(profile?.projects ?? []).map((project) => (
                        <label key={project.id} className="flex items-start gap-2 rounded-lg border p-2 text-xs">
                          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#39FF14]"
                                 checked={selectedProjects.includes(project.id)}
                                 onChange={() => toggleId(selectedProjects, project.id, setSelectedProjects)} />
                          <span className="font-medium">{project.name}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend className="cp-label">Skills</legend>
                    <div className="flex flex-wrap gap-1.5">
                      {(profile?.skills ?? []).map((skill) => (
                        <label key={skill.id} className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
                          <input type="checkbox" className="h-3.5 w-3.5 accent-[#39FF14]"
                                 checked={selectedSkills.includes(skill.id)}
                                 onChange={() => toggleId(selectedSkills, skill.id, setSelectedSkills)} />
                          {skill.name}
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <Field label="Highlights" htmlFor="highlights" help="One per line. Use only defensible claims.">
                    <Textarea id="highlights" rows={3} value={highlights}
                              onChange={(event) => setHighlights(event.target.value)} />
                  </Field>
                  <Field label="Gaps to address honestly" htmlFor="gaps" help="One per line.">
                    <Textarea id="gaps" rows={2} value={gaps}
                              onChange={(event) => setGaps(event.target.value)} />
                  </Field>
                  <Field label="Keywords from the listing" htmlFor="keywords" help="Comma separated.">
                    <Textarea id="keywords" rows={2} value={keywords}
                              onChange={(event) => setKeywords(event.target.value)} />
                  </Field>

                  <label className="flex items-start gap-2 rounded-xl border p-3 text-sm">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#39FF14]" checked={approved}
                           onChange={(event) => setApproved(event.target.checked)} />
                    <span>
                      <span className="font-medium">I approve this strategy.</span>
                      <span className="mt-0.5 block text-xs text-[var(--muted)]">
                        Approval unlocks document generation. You can revise and re-approve later.
                      </span>
                    </span>
                  </label>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" loading={busy === "save"}
                            onClick={() => void saveStrategy(false)}>Save strategy</Button>
                    <Button loading={busy === "approve"} disabled={!approved}
                            onClick={() => void saveStrategy(true)}>
                      <BadgeCheck className="h-4 w-4" aria-hidden="true" /> Approve
                    </Button>
                  </div>
                  {strategy.approved ? (
                    <Link href={`/studio/${job.id}`} className={buttonStyles({ variant: "primary", size: "md" }) + " w-full"}>
                      <FileText className="h-4 w-4" aria-hidden="true" /> Open Application Studio
                    </Link>
                  ) : (
                    <Alert tone="warning">
                      Documents cannot be generated until this strategy is approved.
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-[var(--muted)]">
            Added {relative(job.created_at)} · Last updated {relative(job.updated_at)}
          </p>
        </div>
      </div>
    </div>
  );
}

function relative(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown" : formatDateTime(value);
}
