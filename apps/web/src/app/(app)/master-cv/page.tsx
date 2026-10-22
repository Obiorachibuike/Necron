"use client";

import * as React from "react";
import {
  AlertTriangle, CheckCircle2, Download, FileClock, History, RefreshCw, Save, Undo2,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, Alert, Skeleton, EmptyState, Section } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import type { CVContent, CVSection, MasterCV, TemplateInfo } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export default function MasterCVPage() {
  const client = useQueryClient();
  const { toast } = useToast();
  const [template, setTemplate] = React.useState("ats");
  const [title, setTitle] = React.useState("");
  const [header, setHeader] = React.useState<CVContent["header"] | null>(null);
  const [summary, setSummary] = React.useState("");
  const [sections, setSections] = React.useState<CVSection[]>([]);
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState("");
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [restoreId, setRestoreId] = React.useState<string | null>(null);

  const masterQuery = useQuery({
    queryKey: ["master-cv"],
    queryFn: () => api.get<MasterCV>("/master-cv"),
  });
  const templatesQuery = useQuery({
    queryKey: ["templates"],
    queryFn: () => api.get<TemplateInfo[]>("/documents/templates"),
  });

  const master = masterQuery.data;

  const hydrate = React.useCallback((data: MasterCV) => {
    const content = (data.content ?? {}) as CVContent;
    setTitle(data.title);
    setTemplate(data.template);
    setHeader(content.header ?? {});
    setSummary(content.summary ?? "");
    setSections(content.sections ?? []);
    setDirty(false);
  }, []);

  React.useEffect(() => {
    if (!master) return;
    if (dirty) return;
    hydrate(master);
  }, [master, dirty, hydrate]);

  const content = React.useMemo<CVContent | null>(() => {
    if (!master) return null;
    const base = (master.content ?? {}) as CVContent;
    return { ...base, header: header ?? {}, summary, sections };
  }, [master, header, summary, sections]);

  const save = async () => {
    if (!content) return;
    if (!window.confirm("Save these edits as a new master CV version? Previous versions stay in history.")) return;
    setBusy("save");
    try {
      await api.patch("/master-cv", {
        title, template, content,
      });
      await client.invalidateQueries({ queryKey: ["master-cv"] });
      setDirty(false);
      toast({ title: "New master CV version saved", tone: "success" });
    } catch (caught) {
      toast({ title: "Could not save the master CV",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setBusy("");
    }
  };

  const rebuild = async () => {
    if (!window.confirm("Rebuild from your verified profile? This creates a new version and replaces unsaved edits in the editor.")) return;
    setBusy("rebuild");
    try {
      const updated = await api.post<MasterCV>("/master-cv/rebuild", { template });
      hydrate(updated);
      await client.invalidateQueries({ queryKey: ["master-cv"] });
      toast({ title: "Master CV rebuilt from verified profile", tone: "success" });
    } catch (caught) {
      toast({ title: "Rebuild failed",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setBusy("");
    }
  };

  const restore = async () => {
    if (!restoreId) return;
    setBusy("restore");
    try {
      const updated = await api.post<MasterCV>(`/master-cv/restore/${restoreId}`);
      hydrate(updated);
      setHistoryOpen(false);
      setRestoreId(null);
      await client.invalidateQueries({ queryKey: ["master-cv"] });
      toast({ title: "Version restored as a new version", tone: "success" });
    } catch (caught) {
      toast({ title: "Restore failed",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setBusy("");
    }
  };

  const download = (fmt: string) => {
    setBusy(`download-${fmt}`);
    window.open(`/api/v1/master-cv/download/${fmt}`, "_blank", "noopener");
    window.setTimeout(() => setBusy(""), 1500);
  };

  const updateItem = (sectionIndex: number, itemIndex: number, patch: Record<string, unknown>) => {
    setSections((current) => current.map((section, sIndex) => {
      if (sIndex !== sectionIndex) return section;
      const items = (section.items ?? []).map((item, iIndex) =>
        iIndex === itemIndex ? { ...item, ...patch } : item);
      return { ...section, items };
    }));
    setDirty(true);
  };

  const updateBullets = (sectionIndex: number, itemIndex: number, text: string) => {
    updateItem(sectionIndex, itemIndex, {
      bullets: text.split("\n").map((line) => line.trim()).filter(Boolean),
    });
  };

  if (masterQuery.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-16" /><Skeleton className="h-72" /></div>;
  }
  if (masterQuery.error) {
    return <Alert tone="danger" title="Master CV unavailable">Could not load the master CV. Try again.</Alert>;
  }

  const verifiedCount = sections.reduce((total, section) =>
    total + (section.items?.length ?? 0) + (section.groups?.length ?? 0), 0);

  return (
    <div>
      <PageHeader
        eyebrow="Master CV"
        title="Your source of truth"
        description="Edits always create a new version; nothing is overwritten silently. Exports use only verified evidence."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
              <History className="h-4 w-4" aria-hidden="true" /> History
            </Button>
            <Button size="sm" onClick={() => void save()} loading={busy === "save"} disabled={!dirty}>
              <Save className="h-4 w-4" aria-hidden="true" /> {dirty ? "Save new version" : "Saved"}
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-4">
          <div className="cp-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neon">v{master?.current_version}</Badge>
              <Badge>{verifiedCount} verified entries</Badge>
              <Badge>Schema cv.v1</Badge>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Document title" htmlFor="cv-title">
                <Input id="cv-title" value={title}
                       onChange={(event) => { setTitle(event.target.value); setDirty(true); }} />
              </Field>
              <Field label="Template" htmlFor="cv-template"
                     help={templatesQuery.data?.find((item) => item.key === template)?.description}>
                <Select id="cv-template" value={template}
                        onChange={(event) => { setTemplate(event.target.value); setDirty(true); }}>
                  {(templatesQuery.data ?? []).map((item) => (
                    <option key={item.key} value={item.key}>{item.label}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" loading={busy === "rebuild"} onClick={() => void rebuild()}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> Rebuild from profile
              </Button>
              <Button variant="outline" size="sm" loading={busy === "download-pdf"} onClick={() => void download("pdf")}>
                <Download className="h-4 w-4" aria-hidden="true" /> PDF
              </Button>
              <Button variant="outline" size="sm" loading={busy === "download-docx"} onClick={() => void download("docx")}>
                DOCX
              </Button>
              <Button variant="outline" size="sm" loading={busy === "download-txt"} onClick={() => void download("txt")}>
                TXT
              </Button>
            </div>
            {dirty ? (
              <p className="mt-2 flex items-center gap-1 text-xs text-[var(--warning)]">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                Unsaved changes. They will not appear in exports until saved.
              </p>
            ) : master?.last_generated_at ? (
              <p className="mt-2 text-xs text-[var(--muted)]">
                Last rebuilt {formatDateTime(master.last_generated_at)}
              </p>
            ) : null}
          </div>

          {header ? (
            <Card>
              <CardHeader><CardTitle>Header</CardTitle></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {["name", "headline", "email", "phone", "location"].map((field) => (
                  <Field key={field} label={field[0].toUpperCase() + field.slice(1)} htmlFor={`cv-${field}`}>
                    <Input id={`cv-${field}`} value={String(header[field] ?? "")}
                           onChange={(event) => {
                             setHeader({ ...header, [field]: event.target.value });
                             setDirty(true);
                           }} />
                  </Field>
                ))}
                <div className="sm:col-span-2">
                  <Field label="Links" htmlFor="cv-links" help="One URL per line.">
                    <Textarea id="cv-links" rows={2}
                              value={(header.links ?? []).join("\n")}
                              onChange={(event) => {
                                setHeader({ ...header, links: event.target.value.split("\n").map((v) => v.trim()).filter(Boolean) });
                                setDirty(true);
                              }} />
                  </Field>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
              <CardDescription>Only claims supported by your verified profile.</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea rows={5} value={summary} aria-label="Professional summary"
                        onChange={(event) => { setSummary(event.target.value); setDirty(true); }} />
            </CardContent>
          </Card>

          {sections.map((section, sectionIndex) => (
            <Card key={section.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span>{section.title}</span>
                  <Badge>{section.items?.length ?? section.groups?.length ?? 0}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {section.groups?.length ? (
                  <div className="space-y-2">
                    {section.groups.map((group) => (
                      <div key={group.category} className="rounded-lg border p-2 text-xs">
                        <p className="font-semibold">{group.category}</p>
                        <p className="mt-1 text-[var(--muted)]">{group.items.join(" · ")}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
                {(section.items ?? []).map((item, itemIndex) => (
                  <div key={`${section.id}-${itemIndex}`} className="rounded-xl border p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field label="Title" htmlFor={`${section.id}-${itemIndex}-title`}>
                        <Input id={`${section.id}-${itemIndex}-title`} value={item.title ?? ""}
                               onChange={(event) => updateItem(sectionIndex, itemIndex, { title: event.target.value })} />
                      </Field>
                      <Field label="Subtitle" htmlFor={`${section.id}-${itemIndex}-subtitle`}>
                        <Input id={`${section.id}-${itemIndex}-subtitle`} value={item.subtitle ?? ""}
                               onChange={(event) => updateItem(sectionIndex, itemIndex, { subtitle: event.target.value })} />
                      </Field>
                    </div>
                    <div className="mt-2">
                      <Field label="Bullets" htmlFor={`${section.id}-${itemIndex}-bullets`} help="One per line.">
                        <Textarea id={`${section.id}-${itemIndex}-bullets`} rows={3}
                                  value={(item.bullets ?? []).join("\n")}
                                  onChange={(event) => updateBullets(sectionIndex, itemIndex, event.target.value)} />
                      </Field>
                    </div>
                  </div>
                ))}
                {!(section.items?.length) && !(section.groups?.length) ? (
                  <p className="text-xs text-[var(--muted)]">
                    Nothing verified for this section yet. Add records in your career profile.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>

        <Section title="Preview" description="Rendering approximates the exported layout; verify the PDF before sending.">
          <div className="overflow-hidden rounded-2xl border bg-white text-[#111] shadow-sm">
            <div className={template === "academic" ? "border-b-4 border-[#39FF14] p-6"
              : template === "modern_developer" ? "bg-[#0a0f0b] p-6 text-white"
              : "p-6"}>
              <h2 className="text-2xl font-bold tracking-tight">
                {String(header?.name ?? "") || "Your name"}
              </h2>
              {header?.headline ? <p className="mt-1 text-sm font-medium">{String(header.headline)}</p> : null}
              <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs opacity-80">
                {[header?.email, header?.phone, header?.location].filter(Boolean).map((value) => (
                  <span key={String(value)}>{String(value)}</span>
                ))}
              </p>
              {header?.links?.length ? (
                <p className="mt-1 flex flex-wrap gap-2 text-xs underline underline-offset-2">
                  {header.links.map((link: string) => <span key={link}>{link}</span>)}
                </p>
              ) : null}
            </div>
            <div className="space-y-5 p-6">
              {summary ? (
                <p className="text-xs leading-relaxed text-[#333]">{summary}</p>
              ) : null}
              {sections.map((section) => (
                <div key={section.id}>
                  <h3 className="border-b border-[#ddd] pb-1 text-xs font-bold uppercase tracking-widest">
                    {section.title}
                  </h3>
                  {section.groups?.length ? (
                    <div className="mt-2 space-y-1">
                      {section.groups.map((group) => (
                        <p key={group.category} className="text-[11px] leading-snug">
                          <span className="font-semibold">{group.category}: </span>
                          {group.items.join(", ")}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-2 space-y-3">
                    {(section.items ?? []).map((item, index) => (
                      <div key={`${section.id}-preview-${index}`}>
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-xs font-semibold">{item.title}</p>
                          {item.dates ? <p className="text-[10px] text-[#666]">{item.dates}</p> : null}
                        </div>
                        {item.subtitle ? <p className="text-[11px] text-[#444]">{item.subtitle}</p> : null}
                        {item.bullets?.length ? (
                          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-[#333]">
                            {item.bullets.map((bullet, bulletIndex) => <li key={bulletIndex}>{bullet}</li>)}
                          </ul>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-3 flex items-center gap-1 text-xs text-[var(--muted)]">
            <CheckCircle2 className="h-3 w-3 text-[var(--brand)]" aria-hidden="true" />
            Generated from verified profile records only.
          </p>
        </Section>
      </div>

      <Dialog open={historyOpen} onClose={() => { setHistoryOpen(false); setRestoreId(null); }}
              title="Version history" size="lg"
              description="Restoring a version creates a new version; older versions are never deleted."
              footer={
                <>
                  <Button variant="ghost" onClick={() => { setHistoryOpen(false); setRestoreId(null); }}>Close</Button>
                  <Button loading={busy === "restore"} disabled={!restoreId} onClick={() => void restore()}>
                    <Undo2 className="h-4 w-4" aria-hidden="true" /> Restore selected
                  </Button>
                </>
              }>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {(master?.versions ?? []).slice().reverse().map((version) => (
            <button key={version.id} type="button" onClick={() => setRestoreId(version.id)}
                    aria-pressed={restoreId === version.id}
                    className={`w-full rounded-xl border p-3 text-left text-sm ${
                      restoreId === version.id ? "border-[var(--brand)]" : ""
                    }`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">Version {version.version_number} · {version.template}</span>
                <span className="text-xs text-[var(--muted)]">{formatDateTime(version.created_at)}</span>
              </div>
              <p className="mt-1 text-xs text-[var(--muted)]">{version.change_note}</p>
            </button>
          ))}
          {!(master?.versions ?? []).length ? (
            <EmptyState icon={FileClock} title="No versions" description="Save an edit or rebuild to create one." />
          ) : null}
        </div>
      </Dialog>
    </div>
  );
}
