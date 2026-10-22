"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, CheckCircle2, Download, ExternalLink, FilePenLine, RefreshCw, ShieldCheck, Trash2,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, Alert, Skeleton, Progress } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import type { DocumentDetail, DocumentFinding } from "@/lib/types";
import { formatDateTime, humanize } from "@/lib/utils";

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const client = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();
  const [version, setVersion] = React.useState<number | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState("");
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [busy, setBusy] = React.useState("");

  const query = useQuery({
    queryKey: ["document", id],
    queryFn: () => api.get<DocumentDetail>(`/documents/${id}`),
    refetchInterval: 4000,
  });
  const document = query.data;

  const activeVersion = React.useMemo(() => {
    if (!document) return null;
    if (version !== null) return document.versions.find((entry) => entry.version_number === version) ?? null;
    return document.versions[document.versions.length - 1] ?? null;
  }, [document, version]);

  React.useEffect(() => {
    if (!document) return;
    if (version === null && document.versions.length) {
      setVersion(document.versions[document.versions.length - 1].version_number);
    }
  }, [document, version]);

  React.useEffect(() => {
    if (!editing) setText(activeVersion?.plain_text ?? "");
  }, [activeVersion, editing]);

  const refresh = async () => { await client.invalidateQueries({ queryKey: ["document", id] }); };

  const save = async () => {
    if (!document) return;
    setBusy("save");
    try {
      const base = activeVersion?.content ?? {};
      await api.patch(`/documents/${id}`, {
        content: { ...base, plain_text: text }, change_note: "Manual edit",
      });
      setEditing(false);
      setVersion(null);
      await refresh();
      toast({ title: "Saved as a new version", description: "Re-run the review before approving.", tone: "success" });
    } catch (caught) {
      toast({ title: "Could not save", description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally { setBusy(""); }
  };

  const review = async () => {
    setBusy("review");
    try {
      const result = await api.post<{ message: string }>(`/documents/${id}/review`, { use_ai: true });
      toast({ title: "Review queued", description: result.message, tone: "success" });
      await refresh();
    } catch (caught) {
      toast({ title: "Could not start review", description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally { setBusy(""); }
  };

  const approve = async () => {
    setBusy("approve");
    try {
      await api.post(`/documents/${id}/approve`, { acknowledge_warnings: acknowledged });
      await refresh();
      toast({ title: "Approved", description: "Export is now available.", tone: "success" });
    } catch (caught) {
      toast({ title: "Approval blocked", description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally { setBusy(""); }
  };

  const exportDocument = async (fmt: string) => {
    setBusy(`export-${fmt}`);
    try {
      const result = await api.post<{ files: { id: string }[]; download_token?: string; message: string }>(
        `/documents/${id}/export`, { formats: [fmt] });
      const file = result.files[0];
      if (!file) throw new Error(result.message);
      const suffix = result.download_token ? `?token=${encodeURIComponent(result.download_token)}` : "";
      window.open(`/api/v1/documents/${id}/files/${file.id}/download${suffix}`, "_blank", "noopener");
      await refresh();
      toast({ title: `Export ready (${fmt.toUpperCase()})`, tone: "success" });
    } catch (caught) {
      toast({ title: "Export failed", description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally { setBusy(""); }
  };

  const remove = async () => {
    if (!document || !window.confirm(`Delete “${document.title}” and its versions? This cannot be undone.`)) return;
    setBusy("delete");
    try {
      await api.del(`/documents/${id}`);
      toast({ title: "Document deleted", tone: "success" });
      router.push("/documents");
    } catch (caught) {
      toast({ title: "Could not delete", description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally { setBusy(""); }
  };

  if (query.isLoading) return <div className="space-y-4"><Skeleton className="h-16" /><Skeleton className="h-72" /></div>;
  if (!document) return <Alert tone="danger" title="Document unavailable">It does not exist or belongs to another account.</Alert>;

  const latestReview = document.reviews.find((entry) => entry.version_number === document.current_version);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Link href="/documents" className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--fg)]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Documents
        </Link>
        <Button variant="ghost" size="sm" loading={busy === "delete"} onClick={() => void remove()}>
          <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
        </Button>
      </div>

      <PageHeader
        eyebrow={document.doc_type === "cv" ? "CV" : "Cover letter"}
        title={document.title}
        description={`${document.company || "General"} · ${humanize(document.template)} template · updated ${formatDateTime(document.updated_at)}`}
        actions={
          <>
            {document.job_id ? (
              <Link href={`/studio/${document.job_id}`}>
                <Button variant="outline" size="sm">Application Studio</Button>
              </Link>
            ) : null}
            <Button size="sm" loading={busy === "review"} onClick={() => void review()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Run review
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={document.status} />
        <Badge>v{document.current_version}</Badge>
        <Badge>review round {document.review_round}</Badge>
        <Badge>{document.source.replace(/_/g, " ")}</Badge>
        {document.unresolved_critical ? <Badge tone="danger">{document.unresolved_critical} critical</Badge> : <Badge tone="success">No critical issues</Badge>}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-2">
              <span>Content</span>
              <span className="flex items-center gap-2">
                <Select aria-label="Version" value={String(version ?? "")} className="w-32"
                        onChange={(event) => { setVersion(Number(event.target.value)); setEditing(false); }}>
                  {document.versions.map((entry) => (
                    <option key={entry.id} value={entry.version_number}>v{entry.version_number}</option>
                  ))}
                </Select>
                <Button size="sm" variant="outline" onClick={() => setEditing(!editing)}>
                  <FilePenLine className="h-3.5 w-3.5" aria-hidden="true" /> {editing ? "Cancel" : "Edit"}
                </Button>
              </span>
            </CardTitle>
            <CardDescription>
              {activeVersion ? `${activeVersion.change_note} · ${formatDateTime(activeVersion.created_at)}` : "No version selected."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {editing ? (
              <div className="space-y-2">
                <Field label="Plain text" htmlFor="edit-text"
                       help="Saving creates a new version and clears approval until re-reviewed.">
                  <Textarea id="edit-text" rows={26} value={text} className="font-mono text-xs"
                            onChange={(event) => setText(event.target.value)} />
                </Field>
                <div className="flex gap-2">
                  <Button size="sm" loading={busy === "save"} onClick={() => void save()}>Save new version</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <pre className="max-h-[40rem] overflow-auto whitespace-pre-wrap rounded-xl border bg-[var(--surface-muted)] p-4 text-xs leading-relaxed">
                {activeVersion?.plain_text || "No text available for this version."}
              </pre>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Review findings</CardTitle></CardHeader>
            <CardContent>
              {latestReview ? (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={latestReview.critical_count ? "danger" : "success"}>{latestReview.critical_count} critical</Badge>
                    <Badge tone="warning">{latestReview.warning_count} warnings</Badge>
                    <Badge>{latestReview.info_count} info</Badge>
                  </div>
                  <p className="mt-2 text-xs text-[var(--muted)]">{latestReview.summary}</p>
                  <ul className="mt-3 space-y-2">
                    {latestReview.findings.map((finding: DocumentFinding, index: number) => (
                      <li key={index} className="rounded-lg border p-2 text-xs">
                        <span className="flex items-center gap-1.5">
                          <Badge tone={finding.severity === "critical" ? "danger" : finding.severity === "warning" ? "warning" : "neutral"}>
                            {finding.severity}
                          </Badge>
                          <span className="font-medium">{finding.category}</span>
                        </span>
                        <p className="mt-1">{finding.message}</p>
                        {finding.suggestion ? <p className="mt-1 text-[var(--muted)]">Suggestion: {finding.suggestion}</p> : null}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-[var(--muted)]">No review for the current version yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" /> Approval
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {document.approval_blockers.length ? (
                <Alert tone={document.can_approve ? "warning" : "danger"} title="Blockers">
                  <ul className="list-disc pl-4">
                    {document.approval_blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                  </ul>
                </Alert>
              ) : null}
              <Progress value={document.status === "approved" || document.status === "exported" ? 100 : latestReview ? 65 : 35}
                        label="Readiness" />
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#39FF14]" checked={acknowledged}
                       onChange={(event) => setAcknowledged(event.target.checked)} />
                I have reviewed the warnings and confirm the content is accurate.
              </label>
              <Button size="sm" className="w-full" loading={busy === "approve"}
                      disabled={!document.can_approve || !acknowledged} onClick={() => void approve()}>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Approve
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Exports</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                {["pdf", "docx", "txt"].map((fmt) => (
                  <Button key={fmt} size="sm" variant="outline" loading={busy === `export-${fmt}`}
                          disabled={document.status !== "approved" && document.status !== "exported"}
                          onClick={() => void exportDocument(fmt)}>
                    <Download className="h-3.5 w-3.5" aria-hidden="true" /> {fmt.toUpperCase()}
                  </Button>
                ))}
              </div>
              <ul className="space-y-1.5">
                {document.files.map((file) => (
                  <li key={file.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-xs">
                    <span>
                      v{file.version_number} · {file.fmt.toUpperCase()} · {(file.size_bytes / 1024).toFixed(1)} KB
                      <span className="ml-1 text-[var(--muted)]">{file.validated ? "validated" : file.validation_message}</span>
                    </span>
                    {file.download_url ? (
                      <a href={file.download_url} target="_blank" rel="noopener noreferrer" className="cp-link inline-flex items-center gap-1">
                        Download <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    ) : null}
                  </li>
                ))}
                {!document.files.length ? <li className="text-xs text-[var(--muted)]">No exported files yet.</li> : null}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
