"use client";

import * as React from "react";
import Link from "next/link";
import { Files, Filter, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, Alert, EmptyState, Skeleton } from "@/components/ui/misc";
import { Button, buttonStyles } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { Select } from "@/components/ui/field";
import { DocumentCard } from "@/components/document-card";
import { api } from "@/lib/api";
import type { Document, Paginated } from "@/lib/types";

export default function DocumentsPage() {
  const [type, setType] = React.useState("all");
  const [status, setStatus] = React.useState("");
  const [page, setPage] = React.useState(1);

  const query = useQuery({
    queryKey: ["documents", "library", { type, status, page }],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), page_size: "18" });
      if (type !== "all") params.set("doc_type", type);
      if (status) params.set("status", status);
      return api.get<Paginated<Document>>(`/documents?${params.toString()}`);
    },
  });

  const documents = query.data?.items ?? [];
  const meta = query.data?.meta;

  return (
    <div>
      <PageHeader
        eyebrow="Library"
        title="Documents"
        description="Every CV and cover letter version, its review history and its exports in one place."
        actions={
          <Link href="/discover" className={buttonStyles({ size: "sm" })}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Draft from a job
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Tabs ariaLabel="Document type" value={type} onChange={(value) => { setType(value); setPage(1); }}
              tabs={[{ value: "all", label: "All" }, { value: "cv", label: "CVs" },
                     { value: "cover_letter", label: "Cover letters" }]} />
        <Select aria-label="Status filter" value={status} className="ml-auto w-44"
                onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="">Any status</option>
          <option value="draft">Draft</option>
          <option value="under_review">Under review</option>
          <option value="needs_user_confirmation">Needs confirmation</option>
          <option value="revision_required">Revision required</option>
          <option value="ready_for_approval">Ready for approval</option>
          <option value="approved">Approved</option>
          <option value="exported">Exported</option>
        </Select>
      </div>

      <div className="mt-5">
        {query.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-24" />)}
          </div>
        ) : query.error ? (
          <Alert tone="danger" title="Could not load documents">Try refreshing the page.</Alert>
        ) : documents.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {documents.map((document) => <DocumentCard key={document.id} document={document} />)}
          </div>
        ) : (
          <EmptyState icon={Files} title="No documents yet"
                      description="Open a job, approve an application strategy, then generate a CV in the Application Studio."
                      action={<Link href="/discover" className={buttonStyles({ size: "sm" })}>
                        <Filter className="h-4 w-4" aria-hidden="true" /> Find a job
                      </Link>} />
        )}
      </div>

      {meta && meta.total_pages > 1 ? (
        <div className="mt-6 flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-xs text-[var(--muted)]">Page {meta.page} of {meta.total_pages}</span>
          <Button variant="outline" size="sm" disabled={page >= meta.total_pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      ) : null}
    </div>
  );
}
