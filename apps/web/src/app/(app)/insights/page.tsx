"use client";

import * as React from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { BarChart3, BriefcaseBusiness, Compass, Lightbulb, Sparkles, TrendingUp } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, Alert, EmptyState, Skeleton, StatCard } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import type { ApplicationStats, JobStats, UsageSummary } from "@/lib/types";
import { formatDate, humanize } from "@/lib/utils";

type Insight = {
  key: string;
  title: string;
  insight: string;
  evidence: string[];
  calculation: string;
  sample_size: number;
  confidence: string;
  actionable: boolean;
  dismissed: boolean;
};

type InsightsResponse = {
  generated_at: string;
  period_days: number;
  data_points: Record<string, number>;
  insights: Insight[];
  notes: string[];
};

const STATUS_ORDER = [
  "saved", "planning", "documents_in_progress", "ready_to_apply", "applied",
  "assessment", "interview", "offer", "rejected", "withdrawn", "closed",
];

const CHART_COLORS = ["#39FF14", "#9BE86B", "#22C55E", "#0EA5E9", "#EAB308", "#F97316", "#EF4444", "#A3E635"];

export default function InsightsPage() {
  const client = useQueryClient();
  const { toast } = useToast();
  const [days, setDays] = React.useState(90);
  const [dismissed, setDismissed] = React.useState<string[]>([]);

  const insightsQuery = useQuery({
    queryKey: ["insights", days],
    queryFn: () => api.get<InsightsResponse>(`/insights?days=${days}`),
  });
  const statsQuery = useQuery({
    queryKey: ["application-stats"],
    queryFn: () => api.get<ApplicationStats>("/applications/stats"),
  });
  const jobStatsQuery = useQuery({
    queryKey: ["jobs", "stats"],
    queryFn: () => api.get<JobStats>("/jobs/stats"),
  });
  const usageQuery = useQuery({
    queryKey: ["ai-usage", days],
    queryFn: () => api.get<UsageSummary>(`/ai/usage?days=${days}`),
  });

  const insights = (insightsQuery.data?.insights ?? []).filter((insight) => !dismissed.includes(insight.key));
  const stats = statsQuery.data;

  const statusChart = STATUS_ORDER
    .map((status) => ({ name: humanize(status), value: stats?.by_status?.[status] ?? 0 }))
    .filter((entry) => entry.value > 0);

  const weekly = (stats?.weekly_activity ?? []).map((week) => ({
    week: formatDate(week.week_start, { month: "short", day: "numeric" }),
    added: week.added,
    applied: week.applied,
    responses: week.responses,
  }));

  const usageByDay = (usageQuery.data?.by_day ?? []).map((entry) => ({
    day: formatDate(String(entry.date ?? ""), { month: "short", day: "numeric" }),
    tokens: Number(entry.tokens ?? 0),
    requests: Number(entry.requests ?? 0),
  }));

  const dismiss = async (key: string) => {
    setDismissed((current) => [...current, key]);
    try {
      await api.post("/insights/dismiss", { key, dismissed: true });
      await client.invalidateQueries({ queryKey: ["insights"] });
    } catch {
      toast({ title: "Could not save the dismissal", tone: "error" });
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Insights"
        title="Career insights"
        description="Every insight cites the real records behind it. Small samples are labelled low confidence."
        actions={
          <Select aria-label="Period" value={String(days)} className="w-36"
                  onChange={(event) => setDays(Number(event.target.value))}>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="180">Last 180 days</option>
            <option value="365">Last year</option>
          </Select>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Saved jobs" value={jobStatsQuery.data?.total ?? "—"} icon={Compass} />
        <StatCard label="Strong matches" value={jobStatsQuery.data?.strong_matches ?? "—"} icon={Sparkles} tone="neon" hint="Score ≥ 80" />
        <StatCard label="Applications" value={stats?.total ?? "—"} icon={BriefcaseBusiness} tone="info" />
        <StatCard label="Response rate" value={stats?.response_rate != null ? `${stats.response_rate}%` : "—"}
                  hint="Responses ÷ applied" icon={TrendingUp} tone="success" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Weekly activity</CardTitle>
            <CardDescription>Jobs added, applications sent and responses recorded per week.</CardDescription>
          </CardHeader>
          <CardContent>
            {weekly.length ? (
              <div className="h-64" role="img" aria-label="Bar chart of weekly job and application activity">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekly} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="var(--muted)" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted)" />
                    <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)",
                      borderRadius: 12, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="added" name="Jobs added" fill="#39FF14" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="applied" name="Applied" fill="#22C55E" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="responses" name="Responses" fill="#0EA5E9" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="text-sm text-[var(--muted)]">No activity recorded yet.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Application pipeline</CardTitle>
            <CardDescription>Current status distribution, including empty stages.</CardDescription>
          </CardHeader>
          <CardContent>
            {statusChart.length ? (
              <div className="h-64" role="img" aria-label="Pie chart of applications by status">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusChart} dataKey="value" nameKey="name" innerRadius={55}
                         outerRadius={90} paddingAngle={2}>
                      {statusChart.map((entry, index) => (
                        <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)",
                      borderRadius: 12, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState icon={BarChart3} title="No applications yet"
                          description="Add applications to your tracker to see the pipeline breakdown." />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-5">
        <h2 className="mb-2 font-semibold">Insight reports</h2>
        {insightsQuery.isLoading ? <Skeleton className="h-40" /> : null}
        {insightsQuery.error ? (
          <Alert tone="danger" title="Could not load insights">Try again in a moment.</Alert>
        ) : null}
        {!insightsQuery.isLoading && !insights.length ? (
          <EmptyState icon={Lightbulb} title="Not enough data for an insight"
                      description="Save jobs, score matches and track applications. Insights appear only when there is evidence to support them." />
        ) : null}
        <div className="grid gap-3 lg:grid-cols-2">
          {insights.map((insight) => (
            <Card key={insight.key}>
              <CardHeader>
                <CardTitle className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" />
                    {insight.title}
                  </span>
                  <Badge tone={insight.confidence === "high" ? "success"
                    : insight.confidence === "medium" ? "warning" : "neutral"}>
                    {insight.confidence} confidence
                  </Badge>
                </CardTitle>
                <CardDescription>Based on {insight.sample_size} record(s)</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{insight.insight}</p>
                {insight.evidence.length ? (
                  <div className="mt-3">
                    <p className="text-xs font-semibold">Evidence</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-[var(--muted)]">
                      {insight.evidence.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                ) : null}
                <p className="mt-2 text-xs text-[var(--muted)]">
                  <span className="font-semibold">Calculation:</span> {insight.calculation}
                </p>
                <div className="mt-3 flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => void dismiss(insight.key)}>
                    Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {(insightsQuery.data?.notes ?? []).length ? (
          <div className="mt-4 text-xs text-[var(--muted)]">
            <p className="font-semibold">Method notes</p>
            <ul className="mt-1 list-disc pl-4">
              {insightsQuery.data?.notes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          </div>
        ) : null}
      </div>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>AI usage</CardTitle>
          <CardDescription>
            {usageQuery.data?.configured
              ? `${usageQuery.data.provider_label} · ${usageQuery.data.endpoint_kind} endpoint · ${usageQuery.data.requests} request(s) in this period`
              : "No AI provider configured. All features fall back to deterministic logic."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usageByDay.length ? (
            <div className="h-56" role="img" aria-label="Bar chart of AI token usage by day">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={usageByDay} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--muted)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--muted)" />
                  <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)",
                    borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="tokens" name="Tokens" fill="#39FF14" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              No AI usage recorded. Token counts and estimated cost appear only after real provider calls.
            </p>
          )}
          {usageQuery.data?.cost_note ? (
            <p className="mt-2 text-xs text-[var(--muted)]">{usageQuery.data.cost_note}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
