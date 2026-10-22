"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, CheckCircle2, ClipboardCheck, Download, FileCheck2, FilePenLine,
  FileText, Loader2, RefreshCw, Send, ShieldCheck, Sparkles,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, Alert, Skeleton, EmptyState, Progress } from "@/components/ui/misc";
import { Button, buttonStyles } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import type { AIStatus, Document, DocumentDetail, DocumentFile, DocumentFinding, Job, Paginated, Strategy, TemplateInfo } from "@/lib/types";
import { formatDateTime, humanize } from "@/lib/utils";

const TONES = ["professional", "warm", "direct", "enthusiastic", "analytical"];
const LENGTHS = ["concise", "standard", "detailed"];

export default function StudioPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;
  const client = useQueryClient();
  const { toast } = useToast();
  const router = useRouter();

  const [tab, setTab] = React.useState("cv");
  const [template, setTemplate] = React.useState("ats");
  const [tone, setTone] = React.useState("professional");
  const [length, setLength] = React.useState("standard");
  const [useAi, setUseAi] = React.useState(false);
  const [busy, setBusy] = React.useState("");
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = React.useState<number | null>(null);
  const [editText, setEditText] = React.useState("");
  const [editing, setEditing] = React.useState(false);
  const [acknowledged, setAcknowledged] = React.useState(false);

  const jobQuery = useQuery({ queryKey: ["job", jobId], queryFn: () => api.get<Job>(`/jobs/${jobId}`) });
  const strategyQuery = useQuery({
    queryKey: ["strategy", jobId],
    queryFn: () => api.get<Strategy | null>(`/jobs/${jobId}/strategy`),
  });
  const templatesQuery = useQuery({
    queryKey: ["templates"],
    queryFn: () => api.get<TemplateInfo[]>("/documents/templates"),
  });
  const documentsQuery = useQuery({
    queryKey: ["documents", jobId],
    queryFn: () => api.get<Paginated<Document>>(`/documents?job_id=${jobId}&page_size=50`),
    refetchInterval: 4000,
  });
  const documentQuery = useQuery({
    queryKey: ["document", activeId],
    queryFn: () => api.get<DocumentDetail>(`/documents/${activeId}`),
    enabled: Boolean(activeId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "draft" || status === "under_review" || status === "revision_required" ? 3000 : false;
    },
  });
  const aiQuery = useQuery({
    queryKey: ["ai-status"],
    queryFn: () => api.get<AIStatus>("/ai/status"),
    staleTime: 60_000,
  });
  const aiReady = Boolean(aiQuery.data?.configured && aiQuery.data?.disclosure_accepted);
  React.useEffect(() => {
    // Default to AI only when a provider is configured AND the disclosure was accepted.
    setUseAi(aiReady);
  }, [aiReady]);
  const tasksQuery = useQuery({
    queryKey: ["tasks", "studio"],
    queryFn: () => api.get<{ items: { id: string; title: string }[] }>("/tasks?status=queued&page_size=5"),
    refetchInterval: 5000,
  });

  const documents = React.useMemo(
    () => (documentsQuery.data?.items ?? []).filter((item) => item.doc_type === tab),
    [documentsQuery.data, tab],
  );

  React.useEffect(() => {
    if (activeId && documents.some((item) => item.id === activeId)) return;
    const first = documents[0];
    setActiveId(first ? first.id : null);
    setSelectedVersion(null);
    setEditing(false);
  }, [documents, activeId]);

  const document = documentQuery.data;

  React.useEffect(() => {
    if (!document) return;
    const version = selectedVersion
      ? document.versions.find((entry) => entry.version_number === selectedVersion)
      : document.versions[document.versions.length - 1];
    setEditText(version?.plain_text ?? "");
    if (!selectedVersion && document.versions.length) {
      setSelectedVersion(document.versions[document.versions.length - 1].version_number);
    }
  }, [document, selectedVersion]);

  const strategy = strategyQuery.data;
  const job = jobQuery.data;

  const startGeneration = async (docType: "cv" | "cover_letter") => {
    setBusy(`generate-${docType}`);
    try {
      const accepted = await api.post<{ task_id: string; message: string }>("/documents/generate", {
        job_id: jobId, doc_type: docType, template, tone, length,
        strategy_id: strategy?.id ?? null, use_ai: useAi, run_review: true,
      });
      toast({ title: `${docType === "cv" ? "CV" : "Cover letter"} generation queued`,
              description: accepted.message, tone: "success" });
      setTab(docType);
      await client.invalidateQueries({ queryKey: ["documents", jobId] });
    } catch (caught) {
      toast({
        title: "Could not start generation",
        description: caught instanceof ApiError ? caught.message : undefined,
        tone: "error",
      });
    } finally {
      setBusy("");
    }
  };

  const runReview = async () => {
    if (!document) return;
    setBusy("review");
    try {
      const accepted = await api.post<{ message: string }>(`/documents/${document.id}/review`, { use_ai: useAi });
      toast({ title: "Review queued", description: accepted.message, tone: "success" });
      await client.invalidateQueries({ queryKey: ["document", document.id] });
    } catch (caught) {
      toast({ title: "Could not start review",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setBusy("");
    }
  };

  const revise = async () => {
    if (!document) return;
    setBusy("revise");
    try {
      const accepted = await api.post<{ message: string }>(`/documents/${document.id}/revise`, {
        use_ai: useAi, max_rounds: 2,
      });
      toast({ title: "Revision queued", description: accepted.message, tone: "success" });
      await client.invalidateQueries({ queryKey: ["document", document.id] });
    } catch (caught) {
      toast({ title: "Could not start revision",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setBusy("");
    }
  };

  const saveEdit = async () => {
    if (!document) return;
    const latest = document.versions[document.versions.length - 1];
    let content: Record<string, unknown> = latest?.content ?? {};
    if (typeof content.plain_text === "string" || Object.keys(content).length === 0) {
      content = { ...content, plain_text: editText };
    } else {
      content = { ...content, plain_text: editText };
    }
    setBusy("save");
    try {
      await api.patch(`/documents/${document.id}`, { content, change_note: "Manual edit in Application Studio" });
      setEditing(false);
      await client.invalidateQueries({ queryKey: ["document", document.id] });
      toast({ title: "New version saved", tone: "success" });
    } catch (caught) {
      toast({ title: "Could not save edits",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setBusy("");
    }
  };

  const approve = async () => {
    if (!document) return;
    setBusy("approve");
    try {
      await api.post(`/documents/${document.id}/approve`, { acknowledge_warnings: acknowledged });
      await client.invalidateQueries({ queryKey: ["document", document.id] });
      await client.invalidateQueries({ queryKey: ["documents", jobId] });
      toast({ title: "Document approved", description: "You can now export it.", tone: "success" });
    } catch (caught) {
      toast({ title: "Approval blocked",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setBusy("");
    }
  };

  const exportDocument = async (fmt: string) => {
    if (!document) return;
    setBusy(`export-${fmt}`);
    try {
      const result = await api.post<{ files: DocumentFile[]; download_token: string | null; message: string }>(
        `/documents/${document.id}/export`, { formats: [fmt] });
      const file = result.files[0];
      if (!file) throw new Error("No file was produced.");
      const query = result.download_token ? `?token=${encodeURIComponent(result.download_token)}` : "";
      window.open(`/api/v1/documents/${document.id}/files/${file.id}/download${query}`, "_blank", "noopener");
      await client.invalidateQueries({ queryKey: ["document", document.id] });
      toast({ title: `Exported ${fmt.toUpperCase()}`, description: result.message, tone: "success" });
    } catch (caught) {
      toast({ title: "Export failed",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setBusy("");
    }
  };

  const linkApplication = async () => {
    if (!document) return;
    setBusy("link");
    try {
      let applicationId: string;
      try {
        const application = await api.post<{ id: string }>("/applications", {
          job_id: jobId, company: job?.company ?? "", role_title: job?.title ?? "",
          location: job?.location ?? "", source: job?.provider ?? "manual",
          status: "documents_in_progress",
        });
        applicationId = application.id;
      } catch (caught) {
        // Reuse the existing tracker entry instead of failing when one already exists.
        const existing = caught instanceof ApiError && caught.code === "application_exists"
          ? caught.details.find((detail) => detail.field === "application_id")?.message
          : undefined;
        if (!existing) throw caught;
        applicationId = existing;
      }
      await api.patch(`/documents/${document.id}/link-application`, { application_id: applicationId });
      await client.invalidateQueries({ queryKey: ["document", document.id] });
      toast({ title: "Linked to application", tone: "success" });
      router.push(`/tracker?application=${applicationId}`);
    } catch (caught) {
      toast({ title: "Could not link application",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setBusy("");
    }
  };

  const activeVersion = document?.versions.find((entry) => entry.version_number === selectedVersion)
    ?? document?.versions[document.versions.length - 1];
  const latestReview = document?.reviews[document.reviews.length - 1];
  const queued = tasksQuery.data?.items ?? [];

  if (jobQuery.error) {
    return <Alert tone="danger" title="Job not found">This job does not exist or belongs to another account.</Alert>;
  }

  return (
    <div>
      <div className="mb-4">
        <Link href={`/jobs/${jobId}`} className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--fg)]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to job
        </Link>
      </div>

      <PageHeader
        eyebrow="Application Studio"
        title={job ? `${job.title}` : "Preparing workspace"}
        description={job ? `${job.company || "Company"} · human-in-the-loop drafting with an independent reviewer` : undefined}
        actions={
          <Link href="/documents" className={buttonStyles({ variant: "outline", size: "sm" })}>
            <FileText className="h-4 w-4" aria-hidden="true" /> Documents library
          </Link>
        }
      />

      {!strategy?.approved ? (
        <Alert tone="warning" title="Strategy approval required" className="mb-5">
          <p>
            Document generation requires an approved application strategy. Build and approve one on the{" "}
            <Link href={`/jobs/${jobId}`} className="cp-link">job page</Link>.
          </p>
        </Alert>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Tabs ariaLabel="Document type" value={tab} onChange={setTab}
              tabs={[{ value: "cv", label: "CV" }, { value: "cover_letter", label: "Cover letter" }]} />
        <div className="ml-auto flex items-center gap-2 text-xs text-[var(--muted)]">
          {queued.length ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> {queued.length} task(s) queued
            </span>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => void client.invalidateQueries({ queryKey: ["documents", jobId] })}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.5fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Generation settings</CardTitle>
              <CardDescription>
                Templates change layout only. Content comes from approved evidence.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Template" htmlFor="studio-template">
                <Select id="studio-template" value={template} onChange={(event) => setTemplate(event.target.value)}>
                  {(templatesQuery.data ?? []).map((item) => (
                    <option key={item.key} value={item.key}>{item.label}</option>
                  ))}
                  {!templatesQuery.data?.length ? <option value="ats">ATS-safe</option> : null}
                </Select>
              </Field>
              {templatesQuery.data?.find((item) => item.key === template)?.description ? (
                <p className="text-xs text-[var(--muted)]">
                  {templatesQuery.data.find((item) => item.key === template)?.description}
                </p>
              ) : null}
              <Field label="Tone" htmlFor="studio-tone">
                <Select id="studio-tone" value={tone} onChange={(event) => setTone(event.target.value)}>
                  {TONES.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
                </Select>
              </Field>
              <Field label="Length" htmlFor="studio-length">
                <Select id="studio-length" value={length} onChange={(event) => setLength(event.target.value)}>
                  {LENGTHS.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
                </Select>
              </Field>
              <label className="flex items-start gap-2 rounded-xl border p-3 text-sm">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#39FF14]" checked={useAi && aiReady}
                       disabled={!aiReady}
                       onChange={(event) => setUseAi(event.target.checked)} />
                <span>
                  <span className="font-medium">Use configured AI provider</span>
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">
                    {aiReady
                      ? "When off, deterministic drafting is used. AI never adds unverified facts."
                      : aiQuery.data?.configured
                        ? "Accept the AI data disclosure in Settings → AI provider to enable AI drafting."
                        : "No AI provider is configured. Drafts are built from verified profile data."}
                  </span>
                </span>
              </label>
              <div className="grid gap-2">
                <Button loading={busy === "generate-cv"} disabled={!strategy?.approved}
                        onClick={() => void startGeneration("cv")}>
                  <Sparkles className="h-4 w-4" aria-hidden="true" /> Generate CV
                </Button>
                <Button variant="outline" loading={busy === "generate-cover_letter"} disabled={!strategy?.approved}
                        onClick={() => void startGeneration("cover_letter")}>
                  <FilePenLine className="h-4 w-4" aria-hidden="true" /> Generate cover letter
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{tab === "cv" ? "CV drafts" : "Cover letters"}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {documentsQuery.isLoading ? <Skeleton className="h-16" /> : null}
              {documents.length ? documents.map((item) => (
                <button key={item.id} type="button" onClick={() => { setActiveId(item.id); setSelectedVersion(null); }}
                        className={`w-full rounded-xl border p-3 text-left ${item.id === activeId ? "border-[var(--brand)]" : ""}`}>
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)]">
                    <StatusBadge status={item.status} />
                    <span>v{item.current_version}</span>
                    {item.unresolved_critical ? (
                      <Badge tone="danger">{item.unresolved_critical} critical</Badge>
                    ) : null}
                  </p>
                </button>
              )) : (
                <EmptyState icon={FileText} title="No documents yet"
                            description="Generate a draft once your strategy is approved." />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {document ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2">
                    <span>{document.title}</span>
                    <StatusBadge status={document.status} />
                  </CardTitle>
                  <CardDescription>
                    Version {document.current_version} · review round {document.review_round} ·{" "}
                    {document.source.replace(/_/g, " ")} · updated {formatDateTime(document.updated_at)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {document.approval_blockers.length ? (
                    <Alert tone={document.can_approve ? "warning" : "danger"} title="Approval blockers"
                           className="mb-3">
                      <ul className="list-disc pl-4">
                        {document.approval_blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                      </ul>
                    </Alert>
                  ) : null}

                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Select aria-label="Version" value={String(selectedVersion ?? "")}
                            onChange={(event) => { setSelectedVersion(Number(event.target.value)); setEditing(false); }}
                            className="w-36">
                      {document.versions.map((version) => (
                        <option key={version.id} value={version.version_number}>v{version.version_number}</option>
                      ))}
                    </Select>
                    <Badge>{activeVersion?.created_by ?? "system"}</Badge>
                    {activeVersion?.unresolved_critical ? (
                      <Badge tone="danger">{activeVersion.unresolved_critical} unresolved critical</Badge>
                    ) : <Badge tone="success">No unresolved critical</Badge>}
                  </div>

                  {editing ? (
                    <div className="space-y-2">
                      <Field label="Document text" htmlFor="doc-text"
                             help="Edits create a new version and require re-review before approval.">
                        <Textarea id="doc-text" rows={24} value={editText} className="font-mono text-xs"
                                  onChange={(event) => setEditText(event.target.value)} />
                      </Field>
                      <div className="flex gap-2">
                        <Button size="sm" loading={busy === "save"} onClick={() => void saveEdit()}>Save version</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl border bg-[var(--surface-muted)] p-4 text-xs leading-relaxed">
                      {editText || "This version has no text yet. The worker may still be drafting."}
                    </pre>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={editing} onClick={() => setEditing(true)}>
                      <FilePenLine className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" loading={busy === "review"} onClick={() => void runReview()}>
                      <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" /> Review
                    </Button>
                    <Button size="sm" variant="outline" loading={busy === "revise"}
                            disabled={!document.reviews.length} onClick={() => void revise()}>
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Revise from findings
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Independent review</CardTitle>
                  <CardDescription>
                    A separate reviewer pass checks facts, tone and ATS fit. Critical factual issues block approval.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {document.reviews.length ? (
                    <div className="space-y-3">
                      {[...document.reviews].reverse().slice(0, 3).map((review) => (
                        <div key={review.id} className="rounded-xl border p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium">Round {review.version_number} · {review.model_used || review.reviewer}</p>
                            <div className="flex gap-1">
                              <Badge tone={review.critical_count ? "danger" : "success"}>{review.critical_count} critical</Badge>
                              <Badge tone="warning">{review.warning_count} warning</Badge>
                              <Badge>{review.info_count} info</Badge>
                            </div>
                          </div>
                          <p className="mt-1 text-xs text-[var(--muted)]">{review.summary}</p>
                          <ul className="mt-2 space-y-1">
                            {review.findings.map((finding: DocumentFinding, index: number) => (
                              <li key={index} className="flex items-start gap-2 text-xs">
                                <Badge tone={finding.severity === "critical" ? "danger"
                                  : finding.severity === "warning" ? "warning" : "neutral"}>
                                  {finding.severity}
                                </Badge>
                                <span>
                                  {finding.message}
                                  {finding.location ? (
                                    <span className="text-[var(--muted)]"> ({finding.location})</span>
                                  ) : null}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--muted)]">
                      No review yet. Run one before requesting approval.
                    </p>
                  )}
                  {latestReview?.critical_count ? (
                    <p className="mt-3 text-xs text-[var(--danger)]">
                      Critical findings must be resolved in the text or by re-running the reviewer.
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" /> Approval & export
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#39FF14]" checked={acknowledged}
                           onChange={(event) => setAcknowledged(event.target.checked)} />
                    I reviewed the warnings and confirm the factual content is accurate.
                  </label>
                  <Progress value={document.status === "approved" || document.status === "exported" ? 100
                    : document.reviews.length ? 70 : 40}
                    label="Document readiness" />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" loading={busy === "approve"}
                            disabled={!document.can_approve || !acknowledged}
                            onClick={() => void approve()}>
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Approve document
                    </Button>
                    <Button size="sm" variant="outline" loading={busy === "export-pdf"}
                            disabled={document.status !== "approved" && document.status !== "exported"}
                            onClick={() => void exportDocument("pdf")}>
                      <Download className="h-4 w-4" aria-hidden="true" /> PDF
                    </Button>
                    <Button size="sm" variant="outline" loading={busy === "export-docx"}
                            disabled={document.status !== "approved" && document.status !== "exported"}
                            onClick={() => void exportDocument("docx")}>DOCX</Button>
                    <Button size="sm" variant="outline" loading={busy === "export-txt"}
                            disabled={document.status !== "approved" && document.status !== "exported"}
                            onClick={() => void exportDocument("txt")}>TXT</Button>
                  </div>
                  <Button size="sm" variant="ghost" loading={busy === "link"} onClick={() => void linkApplication()}>
                    <Send className="h-3.5 w-3.5" aria-hidden="true" /> Track as application
                  </Button>
                  <p className="text-xs text-[var(--muted)]">
                    CareerPilot never submits applications for you. Export files and apply on the original site.
                  </p>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent>
                <EmptyState icon={FileCheck2} title={tab === "cv" ? "No CV selected" : "No cover letter selected"}
                            description={strategy?.approved
                              ? "Generate a draft to begin the review cycle."
                              : "Approve your application strategy first."}
                            action={strategy?.approved ? (
                              <Button onClick={() => void startGeneration(tab as "cv" | "cover_letter")}
                                      loading={busy === `generate-${tab}`}>
                                <Sparkles className="h-4 w-4" aria-hidden="true" /> Generate {tab === "cv" ? "CV" : "cover letter"}
                              </Button>
                            ) : undefined} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
