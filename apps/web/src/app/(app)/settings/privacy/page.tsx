"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Database, Download, FileJson, LockKeyhole, Mail, ShieldCheck, Trash2, TriangleAlert,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, Alert, Section, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { useAuth } from "@/components/providers";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";

type PrivacySummary = {
  data_categories: { category: string; data: string; purpose: string }[];
  retention: string;
  account_deletion: string;
  ai_transmission: string;
  export_available: boolean;
  email_configured: boolean;
  email_note: string;
  storage_note: string;
};

export default function PrivacySettingsPage() {
  const { logout } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [exporting, setExporting] = React.useState(false);

  const summaryQuery = useQuery({
    queryKey: ["privacy-summary"],
    queryFn: () => api.get<PrivacySummary>("/privacy/summary"),
  });

  const exportData = async () => {
    setExporting(true);
    try {
      const response = await fetch("/api/v1/privacy/export", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Export failed (${response.status})`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `careerpilot-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Export downloaded", description: "Your data was exported as JSON.", tone: "success" });
    } catch (caught) {
      toast({ title: "Export failed", description: caught instanceof Error ? caught.message : undefined, tone: "error" });
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async () => {
    setBusy("delete");
    try {
      await api.post("/auth/delete-account", { password, confirm });
      toast({ title: "Account deleted", tone: "success" });
      await logout();
      router.push("/");
    } catch (caught) {
      toast({ title: "Deletion failed",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
      setBusy("");
    }
  };

  const summary = summaryQuery.data;

  return (
    <div>
      <PageHeader
        eyebrow="Privacy"
        title="Privacy & data management"
        description="Export everything, inspect what is stored, or delete your account permanently."
      />

      <div className="grid gap-5 lg:grid-cols-[1.3fr_0.8fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" /> What CareerPilot stores
              </CardTitle>
              <CardDescription>Data categories in this deployment.</CardDescription>
            </CardHeader>
            <CardContent>
              {summaryQuery.isLoading ? <Skeleton className="h-32" /> : (
                <div className="space-y-2">
                  {(summary?.data_categories ?? []).map((category) => (
                    <div key={category.category} className="rounded-xl border p-3">
                      <p className="text-sm font-medium">{category.category}</p>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">{category.data}</p>
                      <p className="mt-1 text-xs"><span className="font-medium">Purpose:</span>{" "}
                        <span className="text-[var(--muted)]">{category.purpose}</span></p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" /> Export your data
              </CardTitle>
              <CardDescription>Complete JSON of profile, jobs, documents metadata, applications, interviews, tasks and AI usage.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button loading={exporting} onClick={() => void exportData()}>
                <FileJson className="h-4 w-4" aria-hidden="true" /> Download JSON export
              </Button>
              <p className="text-xs text-[var(--muted)]">
                Generated files are included as metadata and download links; the export does not embed binary files.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" /> Retention & storage
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-[var(--muted)]">
              <p>{summary?.retention}</p>
              <p>{summary?.storage_note}</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LockKeyhole className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" /> AI transmission
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-[var(--muted)]">
              <p>{summary?.ai_transmission}</p>
              <Link href="/settings/ai" className="cp-link text-sm">Manage AI providers</Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" /> Email
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-[var(--muted)]">
              <Badge tone={summary?.email_configured ? "success" : "warning"}>
                {summary?.email_configured ? "Email delivery configured" : "Email delivery not configured"}
              </Badge>
              <p>{summary?.email_note}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[var(--danger)]">
                <TriangleAlert className="h-4 w-4" aria-hidden="true" /> Danger zone
              </CardTitle>
              <CardDescription>{summary?.account_deletion}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="danger" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete my account
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete account permanently"
              description="This removes your profile, jobs, documents, applications and uploaded files."
              footer={
                <>
                  <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
                  <Button variant="danger" loading={busy === "delete"}
                          disabled={!password || confirm.trim().toUpperCase() !== "DELETE"}
                          onClick={() => void deleteAccount()}>
                    Delete account
                  </Button>
                </>
              }>
        <div className="space-y-3">
          <Alert tone="danger" title="Irreversible action">
            Account deletion cannot be undone. Export your data first if you may need it.
          </Alert>
          <Field label="Password" htmlFor="delete-password">
            <Input id="delete-password" type="password" autoComplete="current-password"
                   value={password} onChange={(event) => setPassword(event.target.value)} />
          </Field>
          <Field label="Type DELETE to confirm" htmlFor="delete-confirm">
            <Input id="delete-confirm" value={confirm} autoComplete="off"
                   onChange={(event) => setConfirm(event.target.value)} />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
