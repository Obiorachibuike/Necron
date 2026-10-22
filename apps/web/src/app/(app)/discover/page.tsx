"use client";

import * as React from "react";
import Link from "next/link";
import {
  Compass, Filter, Import, Plus, RefreshCw, Search, Settings2, Trash2, Wand2,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, Alert, EmptyState, Skeleton, StatCard } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { JobCard } from "@/components/job-card";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import type { Job, JobImportResult, JobSource, Paginated, SavedSearch } from "@/lib/types";
import { formatDateTime, relativeTime } from "@/lib/utils";

type ImportState = {
  mode: "url" | "manual";
  url: string;
  description: string;
  title: string;
  company: string;
};

const EMPTY_IMPORT: ImportState = { mode: "url", url: "", description: "", title: "", company: "" };

export default function DiscoverPage() {
  const client = useQueryClient();
  const { toast } = useToast();
  const [scope, setScope] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [minScore, setMinScore] = React.useState("");
  const [arrangement, setArrangement] = React.useState("");
  const [sort, setSort] = React.useState("match");
  const [page, setPage] = React.useState(1);
  const [importOpen, setImportOpen] = React.useState(false);
  const [importState, setImportState] = React.useState<ImportState>(EMPTY_IMPORT);
  const [importing, setImporting] = React.useState(false);
  const [importResult, setImportResult] = React.useState<JobImportResult | null>(null);
  const [boardsOpen, setBoardsOpen] = React.useState(false);
  const [searchesOpen, setSearchesOpen] = React.useState(false);
  const [busy, setBusy] = React.useState("");

  const params = new URLSearchParams({
    page: String(page), page_size: "12", sort, scope,
    ...(q ? { q } : {}), ...(minScore ? { min_score: minScore } : {}),
    ...(arrangement ? { arrangement } : {}),
  });

  const jobsQuery = useQuery({
    queryKey: ["jobs", { scope, q, minScore, arrangement, sort, page }],
    queryFn: () => api.get<Paginated<Job>>(`/jobs?${params.toString()}`),
  });
  const statsQuery = useQuery({ queryKey: ["jobs", "stats"], queryFn: () => api.get<Record<string, number>>("/jobs/stats") });
  const sourcesQuery = useQuery({ queryKey: ["job-sources"], queryFn: () => api.get<JobSource[]>("/jobs/sources") });
  const searchesQuery = useQuery({ queryKey: ["job-searches"], queryFn: () => api.get<SavedSearch[]>("/jobs/searches") });

  const invalidate = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["jobs"] }),
      client.invalidateQueries({ queryKey: ["job-sources"] }),
      client.invalidateQueries({ queryKey: ["job-searches"] }),
    ]);
  };

  const runImport = async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const payload = importState.mode === "url"
        ? { mode: "url", url: importState.url, save: true, analyze: true }
        : {
            mode: "manual", description: importState.description,
            title: importState.title, company: importState.company, save: true, analyze: true,
          };
      const result = await api.post<JobImportResult>("/jobs/import", payload);
      setImportResult(result);
      if (result.job) {
        await invalidate();
        toast({ title: "Job saved and scored", tone: "success" });
      }
    } catch (caught) {
      setImportResult({
        import_id: null, status: "failed", extracted: {}, job: null,
        requires_manual_description: false, warnings: [],
        message: caught instanceof ApiError ? caught.message : "Import failed.",
      });
    } finally {
      setImporting(false);
    }
  };

  const discover = async () => {
    setBusy("discover");
    try {
      const result = await api.post<{ task_id: string; message: string }>("/jobs/discover", {
        keywords: q, providers: [], max_results: 50,
      });
      toast({ title: "Discovery queued", description: result.message, tone: "success" });
      await invalidate();
    } catch (caught) {
      toast({ title: "Could not start discovery",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setBusy("");
    }
  };

  const testSource = async (source: JobSource) => {
    setBusy(source.id);
    try {
      const result = await api.post<{ ok: boolean; message: string; items?: number }>(
        `/jobs/sources/${source.id}/test`);
      toast({ title: result.ok ? "Board reachable" : "Board check failed",
              description: result.message, tone: result.ok ? "success" : "error" });
      await invalidate();
    } catch (caught) {
      toast({ title: "Board check failed",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setBusy("");
    }
  };

  const removeSource = async (source: JobSource) => {
    if (!window.confirm(`Remove the ${source.provider} board “${source.display_name || source.board_token}”? Jobs already imported are kept.`)) return;
    setBusy(source.id);
    try {
      await api.del(`/jobs/sources/${source.id}`);
      await invalidate();
      toast({ title: "Job board removed", tone: "success" });
    } finally {
      setBusy("");
    }
  };

  const runSearch = async (search: SavedSearch) => {
    setBusy(search.id);
    try {
      const result = await api.post<{ message: string }>(`/jobs/searches/${search.id}/run`);
      toast({ title: "Saved search queued", description: result.message, tone: "success" });
      await invalidate();
    } catch (caught) {
      toast({ title: "Could not run search",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setBusy("");
    }
  };

  const jobs = jobsQuery.data?.items ?? [];
  const meta = jobsQuery.data?.meta;

  return (
    <div>
      <PageHeader
        eyebrow="Discovery"
        title="Discover jobs"
        description="Import what you find or pull from public Greenhouse and Lever boards. Every listing is yours; no synthetic inventory."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setBoardsOpen(true)}>
              <Settings2 className="h-4 w-4" aria-hidden="true" /> Job boards
            </Button>
            <Button size="sm" onClick={() => { setImportResult(null); setImportOpen(true); }}>
              <Import className="h-4 w-4" aria-hidden="true" /> Import job
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total listings" value={statsQuery.data?.total ?? "—"} icon={Compass} tone="info" />
        <StatCard label="Saved" value={statsQuery.data?.saved ?? "—"} icon={Search} />
        <StatCard label="Scored" value={statsQuery.data?.scored ?? "—"} icon={Wand2} tone="neon" />
        <StatCard label="Strong matches" value={statsQuery.data?.strong_matches ?? "—"} hint="Score ≥ 80" icon={Filter} tone="success" />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Tabs ariaLabel="Job scope" value={scope} onChange={(value) => { setScope(value); setPage(1); }}
              tabs={[{ value: "all", label: "All jobs" }, { value: "saved", label: "Saved" },
                     { value: "discovered", label: "Discovered" }]} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--muted)]" aria-hidden="true" />
            <Input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }}
                   placeholder="Search title or company…" aria-label="Search jobs"
                   className="w-56 pl-9" />
          </div>
          <Select aria-label="Minimum match score" value={minScore}
                  onChange={(event) => { setMinScore(event.target.value); setPage(1); }}
                  className="w-36">
            <option value="">Any score</option>
            <option value="80">80+ strong</option>
            <option value="60">60+ worth</option>
            <option value="40">40+ stretch</option>
          </Select>
          <Select aria-label="Work arrangement" value={arrangement}
                  onChange={(event) => { setArrangement(event.target.value); setPage(1); }}
                  className="w-32">
            <option value="">Any setup</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">On-site</option>
          </Select>
          <Select aria-label="Sort jobs" value={sort}
                  onChange={(event) => { setSort(event.target.value); setPage(1); }}
                  className="w-36">
            <option value="match">Best match</option>
            <option value="newest">Newest</option>
            <option value="score_asc">Lowest score</option>
            <option value="title">Title</option>
            <option value="company">Company</option>
          </Select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--muted)]">
          {meta ? `${meta.total} listing(s)` : "Loading…"} ·{" "}
          <Link href="/how-it-works" className="cp-link">How matching works</Link>
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setSearchesOpen(true)}>
            Saved searches ({searchesQuery.data?.length ?? 0})
          </Button>
          <Button variant="outline" size="sm" loading={busy === "discover"} onClick={() => void discover()}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Run discovery
          </Button>
        </div>
      </div>

      <div className="mt-4">
        {jobsQuery.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-52" />)}
          </div>
        ) : jobs.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((job) => <JobCard key={job.id} job={job} />)}
          </div>
        ) : (
          <EmptyState icon={Compass} title="No jobs match these filters"
                      description="Import a posting by URL or description, add a public job board, or clear the filters."
                      action={<Button onClick={() => { setImportResult(null); setImportOpen(true); }}>
                        <Plus className="h-4 w-4" aria-hidden="true" /> Import your first job
                      </Button>} />
        )}
      </div>

      {meta && meta.total_pages > 1 ? (
        <div className="mt-6 flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-xs text-[var(--muted)]">Page {meta.page} of {meta.total_pages}</span>
          <Button variant="outline" size="sm" disabled={page >= meta.total_pages}
                  onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      ) : null}

      {/* Import */}
      <Dialog open={importOpen} onClose={() => setImportOpen(false)} title="Import a job"
              description="Fetch a public posting by URL or paste the description. URL fetching blocks private networks."
              footer={
                <>
                  <Button variant="ghost" onClick={() => setImportOpen(false)}>Close</Button>
                  <Button loading={importing} onClick={() => void runImport()}>
                    <Import className="h-4 w-4" aria-hidden="true" /> Import and score
                  </Button>
                </>
              }>
        <div className="space-y-4">
          <div className="flex gap-1 rounded-xl border p-1">
            {(["url", "manual"] as const).map((mode) => (
              <button key={mode} type="button"
                      onClick={() => setImportState((current) => ({ ...current, mode }))}
                      aria-pressed={importState.mode === mode}
                      className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium ${
                        importState.mode === mode ? "bg-[var(--fg)] text-[var(--bg)]" : "text-[var(--muted)]"
                      }`}>
                {mode === "url" ? "From URL" : "Paste description"}
              </button>
            ))}
          </div>
          {importState.mode === "url" ? (
            <Field label="Job posting URL" htmlFor="job-url" required
                   help="Only public http(s) pages on standard ports. Redirects are re-validated.">
              <Input id="job-url" value={importState.url} placeholder="https://example.com/careers/role"
                     onChange={(event) => setImportState((current) => ({ ...current, url: event.target.value }))} />
            </Field>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Job title" htmlFor="job-title">
                  <Input id="job-title" value={importState.title}
                         onChange={(event) => setImportState((current) => ({ ...current, title: event.target.value }))} />
                </Field>
                <Field label="Company" htmlFor="job-company">
                  <Input id="job-company" value={importState.company}
                         onChange={(event) => setImportState((current) => ({ ...current, company: event.target.value }))} />
                </Field>
              </div>
              <Field label="Job description" htmlFor="job-description" required
                     help="Paste the full text, including requirements. At least 40 characters.">
                <Textarea id="job-description" rows={8} value={importState.description}
                          onChange={(event) => setImportState((current) => ({ ...current, description: event.target.value }))} />
              </Field>
            </>
          )}

          {importResult ? (
            <Alert tone={importResult.status === "failed" ? "danger" : "info"}
                   title={importResult.status === "failed" ? "Import failed" : "Import result"}>
              <p>{importResult.message}</p>
              {importResult.requires_manual_description ? (
                <button type="button" className="cp-link mt-1"
                        onClick={() => setImportState((current) => ({ ...current, mode: "manual" }))}>
                  Paste the description instead
                </button>
              ) : null}
              {importResult.warnings.length ? (
                <ul className="mt-2 list-disc pl-4 text-xs">
                  {importResult.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              ) : null}
              {importResult.job ? (
                <Link href={`/jobs/${importResult.job.id}`} className="cp-link mt-2 inline-block text-sm">
                  Open {importResult.job.title}
                </Link>
              ) : null}
            </Alert>
          ) : null}
        </div>
      </Dialog>

      {/* Boards */}
      <Dialog open={boardsOpen} onClose={() => setBoardsOpen(false)} title="Job boards"
              description="Public Greenhouse and Lever boards only. Add the board token, not a full URL."
              size="lg">
        <BoardManager sources={sourcesQuery.data ?? []} busy={busy}
                      onChanged={() => void invalidate()} onTest={testSource} onRemove={removeSource} />
      </Dialog>

      <Dialog open={searchesOpen} onClose={() => setSearchesOpen(false)} title="Saved searches"
              description="Run a search now or schedule it. Scheduled searches need a running worker."
              size="lg">
        <SearchManager searches={searchesQuery.data ?? []} busy={busy}
                       onChanged={() => void invalidate()} onRun={runSearch} />
      </Dialog>
    </div>
  );
}

function BoardManager({
  sources, busy, onChanged, onTest, onRemove,
}: {
  sources: JobSource[];
  busy: string;
  onChanged: () => void;
  onTest: (source: JobSource) => void;
  onRemove: (source: JobSource) => void;
}) {
  const { toast } = useToast();
  const [provider, setProvider] = React.useState("greenhouse");
  const [token, setToken] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const add = async () => {
    setSaving(true);
    try {
      await api.post("/jobs/sources", {
        provider, board_token: token, company_name: company, display_name: company,
      });
      setToken("");
      setCompany("");
      onChanged();
      toast({ title: "Job board added", tone: "success" });
    } catch (caught) {
      toast({ title: "Could not add board",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Alert tone="info">
        Greenhouse board tokens look like <code className="font-mono text-xs">companyname</code>.
        Lever site names look like <code className="font-mono text-xs">company</code>. Test the board
        before relying on discovery.
      </Alert>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Provider" htmlFor="board-provider">
          <Select id="board-provider" value={provider} onChange={(event) => setProvider(event.target.value)}>
            <option value="greenhouse">Greenhouse</option>
            <option value="lever">Lever</option>
          </Select>
        </Field>
        <Field label="Board token" htmlFor="board-token" required>
          <Input id="board-token" value={token} placeholder="companyname"
                 onChange={(event) => setToken(event.target.value)} />
        </Field>
        <Field label="Company label" htmlFor="board-company">
          <Input id="board-company" value={company} placeholder="Example Ltd"
                 onChange={(event) => setCompany(event.target.value)} />
        </Field>
      </div>
      <Button size="sm" loading={saving} disabled={!token.trim()} onClick={() => void add()}>
        <Plus className="h-4 w-4" aria-hidden="true" /> Add board
      </Button>

      <div className="space-y-2">
        {sources.length ? sources.map((source) => (
          <div key={source.id} className="rounded-xl border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">
                  {source.display_name || source.company_name || source.board_token}
                  {source.is_global ? <Badge className="ml-2">shared</Badge> : null}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {source.provider} · {source.board_token} ·{" "}
                  {source.last_checked_at ? `checked ${relativeTime(source.last_checked_at)}` : "never checked"}
                </p>
                {source.health_message ? (
                  <p className="mt-1 text-xs text-[var(--muted)]">{source.health_message}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={source.health_status === "ok" || source.health_status === "healthy"
                  ? "success" : source.health_status === "error" ? "danger" : "neutral"}>
                  {source.health_status || "unknown"}
                </Badge>
                <Button variant="outline" size="sm" loading={busy === source.id}
                        onClick={() => onTest(source)}>Test</Button>
                {!source.is_global ? (
                  <Button variant="ghost" size="sm" aria-label="Remove board"
                          onClick={() => onRemove(source)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        )) : (
          <p className="text-sm text-[var(--muted)]">No boards configured. Discovery will ask you to add one.</p>
        )}
      </div>
    </div>
  );
}

function SearchManager({
  searches, busy, onChanged, onRun,
}: {
  searches: SavedSearch[];
  busy: string;
  onChanged: () => void;
  onRun: (search: SavedSearch) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = React.useState("");
  const [keywords, setKeywords] = React.useState("");
  const [schedule, setSchedule] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const create = async () => {
    setSaving(true);
    try {
      await api.post("/jobs/searches", {
        name, keywords, schedule_enabled: schedule, schedule_frequency: "daily",
        schedule_hour_utc: 8, schedule_max_results: 50, notify: true,
      });
      setName("");
      setKeywords("");
      setSchedule(false);
      onChanged();
      toast({ title: "Saved search created", tone: "success" });
    } catch (caught) {
      toast({ title: "Could not save search",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (search: SavedSearch) => {
    if (!window.confirm(`Delete saved search “${search.name}”?`)) return;
    try {
      await api.del(`/jobs/searches/${search.id}`);
      onChanged();
    } catch (caught) {
      toast({ title: "Could not delete search",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name" htmlFor="search-name" required>
          <Input id="search-name" value={name} placeholder="Remote backend roles"
                 onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Keywords" htmlFor="search-keywords">
          <Input id="search-keywords" value={keywords} placeholder="python, fastapi"
                 onChange={(event) => setKeywords(event.target.value)} />
        </Field>
        <div className="flex items-end">
          <label className="flex h-10 items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[#39FF14]" checked={schedule}
                   onChange={(event) => setSchedule(event.target.checked)} />
            Schedule daily
          </label>
        </div>
      </div>
      <Button size="sm" loading={saving} disabled={!name.trim()} onClick={() => void create()}>
        <Plus className="h-4 w-4" aria-hidden="true" /> Save search
      </Button>

      <div className="space-y-2">
        {searches.length ? searches.map((search) => (
          <div key={search.id} className="rounded-xl border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{search.name}</p>
                <p className="text-xs text-[var(--muted)]">
                  {search.keywords || "No keywords"} ·{" "}
                  {search.schedule_enabled
                    ? `${search.schedule_frequency} at ${search.schedule_hour_utc}:00 UTC`
                    : "manual only"}
                  {search.last_run_at ? ` · last run ${formatDateTime(search.last_run_at)}` : ""}
                </p>
                {!search.worker_available && search.schedule_enabled ? (
                  <p className="mt-1 text-xs text-[var(--warning)]">
                    Scheduled searches will not run while no worker is online.
                  </p>
                ) : null}
                {search.last_error ? (
                  <p className="mt-1 text-xs text-[var(--danger)]">{search.last_error}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" loading={busy === search.id}
                        onClick={() => onRun(search)}>Run now</Button>
                <Button variant="ghost" size="sm" aria-label={`Delete ${search.name}`}
                        onClick={() => void remove(search)}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
        )) : <p className="text-sm text-[var(--muted)]">No saved searches yet.</p>}
      </div>
    </div>
  );
}
