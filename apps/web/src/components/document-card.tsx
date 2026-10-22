import Link from "next/link";
import { FileText, Mail } from "lucide-react";
import type { Document } from "@/lib/types";
import { StatusBadge } from "@/components/ui/badge";
import { relativeTime } from "@/lib/utils";

export function DocumentCard({ document }: { document: Document }) {
  const Icon = document.doc_type === "cv" ? FileText : Mail;
  return (
    <Link href={`/documents/${document.id}`}
          className="cp-card flex items-start gap-3 p-4 transition-colors hover:border-[#39FF14]/40">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--surface-2)] text-[var(--brand)]">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{document.title}</span>
        <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
          {document.company || "Master / general"} · v{document.current_version} ·{" "}
          {relativeTime(document.updated_at)}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={document.status} />
          {document.unresolved_critical > 0 ? (
            <StatusBadge status="critical" label={`${document.unresolved_critical} critical`} />
          ) : null}
        </span>
      </span>
    </Link>
  );
}
