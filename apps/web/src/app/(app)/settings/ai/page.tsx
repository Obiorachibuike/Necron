"use client";

import * as React from "react";
import Link from "next/link";
import { Activity, Cpu, KeyRound, PlugZap, Plus, ShieldCheck, Sparkles, Trash2, Wallet } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, Alert, Section, Skeleton, EmptyState, StatCard } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import type { AIStatus, ProviderConfig, ProviderTest, UsageSummary } from "@/lib/types";
import { formatDateTime, humanize } from "@/lib/utils";

type FormState = {
  label: string;
  provider: string;
  base_url: string;
  model: string;
  api_key: string;
  temperature: number;
  max_output_tokens: number;
  timeout_seconds: number;
  max_retries: number;
  fallback_model: string;
  monthly_usage_limit_tokens: string;
  disclosure_accepted: boolean;
  is_active: boolean;
};

const EMPTY_FORM: FormState = {
  label: "My AI provider", provider: "openai_compatible", base_url: "https://api.openai.com/v1",
  model: "gpt-4o-mini", api_key: "", temperature: 0.3, max_output_tokens: 1200,
  timeout_seconds: 60, max_retries: 2, fallback_model: "",
  monthly_usage_limit_tokens: "", disclosure_accepted: false, is_active: true,
};

const PRESETS = [
  { label: "OpenAI", provider: "openai", base_url: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { label: "OpenRouter", provider: "openai_compatible", base_url: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
  { label: "Groq", provider: "openai_compatible", base_url: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  { label: "Ollama (local)", provider: "ollama", base_url: "http://127.0.0.1:11434", model: "llama3.1:8b" },
];

export default function AISettingsPage() {
  const client = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ProviderConfig | null>(null);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState("");
  const [testResult, setTestResult] = React.useState<ProviderTest | null>(null);
  const [disclosureOpen, setDisclosureOpen] = React.useState(false);

  const statusQuery = useQuery({
    queryKey: ["ai-status"],
    queryFn: () => api.get<AIStatus>("/ai/status"),
  });
  const configsQuery = useQuery({
    queryKey: ["ai-configs"],
    queryFn: () => api.get<ProviderConfig[]>("/ai/configs"),
  });
  const usageQuery = useQuery({
    queryKey: ["ai-usage", 30],
    queryFn: () => api.get<UsageSummary>("/ai/usage?days=30"),
  });

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["ai-status"] }),
      client.invalidateQueries({ queryKey: ["ai-configs"] }),
      client.invalidateQueries({ queryKey: ["ai-usage"] }),
    ]);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setTestResult(null);
    setDialogOpen(true);
  };

  const openEdit = (config: ProviderConfig) => {
    setEditing(config);
    setForm({
      label: config.label, provider: config.provider, base_url: config.base_url,
      model: config.model, api_key: "",
      temperature: config.temperature, max_output_tokens: config.max_output_tokens,
      timeout_seconds: config.timeout_seconds, max_retries: config.max_retries,
      fallback_model: config.fallback_model,
      monthly_usage_limit_tokens: config.monthly_usage_limit_tokens
        ? String(config.monthly_usage_limit_tokens) : "",
      disclosure_accepted: Boolean(config.disclosure_accepted_at),
      is_active: config.is_active,
    });
    setTestResult(null);
    setDialogOpen(true);
  };

  const save = async () => {
    if (form.is_active && !form.disclosure_accepted) {
      toast({ title: "Confirm the disclosure", description: "Activation requires accepting the AI data disclosure.", tone: "error" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        api_key: form.api_key.trim() || null,
        monthly_usage_limit_tokens: form.monthly_usage_limit_tokens
          ? Number(form.monthly_usage_limit_tokens) : null,
      };
      if (editing) {
        await api.patch(`/ai/configs/${editing.id}`, payload);
      } else {
        await api.post("/ai/configs", payload);
      }
      setDialogOpen(false);
      await refresh();
      toast({ title: editing ? "Provider updated" : "Provider saved",
              description: "Keys are encrypted at rest and never returned to the browser.", tone: "success" });
    } catch (caught) {
      toast({ title: "Could not save provider",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async (config: ProviderConfig) => {
    setTesting(config.id);
    setTestResult(null);
    try {
      const result = await api.post<ProviderTest>(`/ai/configs/${config.id}/test`);
      setTestResult(result);
      toast({ title: result.ok ? "Provider connected" : "Connection failed",
              description: result.message, tone: result.ok ? "success" : "error" });
      await refresh();
    } catch (caught) {
      toast({ title: "Test failed", description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setTesting("");
    }
  };

  const activate = async (config: ProviderConfig) => {
    setTesting(config.id);
    try {
      await api.post(`/ai/configs/${config.id}/activate`);
      await refresh();
      toast({ title: `${config.label} activated`, tone: "success" });
    } catch (caught) {
      toast({ title: "Could not activate", description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setTesting("");
    }
  };

  const remove = async (config: ProviderConfig) => {
    if (!window.confirm(`Delete the configuration “${config.label}”? The encrypted key is removed.`)) return;
    try {
      await api.del(`/ai/configs/${config.id}`);
      await refresh();
      toast({ title: "Configuration deleted", tone: "success" });
    } catch (caught) {
      toast({ title: "Could not delete", description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    }
  };

  const status = statusQuery.data;
  const usage = usageQuery.data;
  const configs = configsQuery.data ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="AI provider"
        title="AI configuration"
        description="Bring your own OpenAI-compatible endpoint or local Ollama. AI is optional and never required for core workflows."
        actions={<Button size="sm" onClick={openCreate}><Plus className="h-4 w-4" aria-hidden="true" /> Add provider</Button>}
      />

      <Alert tone={status?.configured ? "success" : "info"} title={status?.configured ? "AI is configured" : "AI is not configured"}
             className="mb-5">
        {status?.configured ? (
          <p>
            {status.provider_label} · {status.model} · {status.endpoint_kind} endpoint.
            {status.last_test_status ? ` Last test: ${status.last_test_status} (${status.last_test_message}).` : ""}
            {status.daily_token_limit ? ` Daily usage ${status.daily_tokens_used}/${status.daily_token_limit} tokens.` : ""}
          </p>
        ) : (
          <p>
            Every feature works without AI using deterministic drafting, rule-based review and a built-in
            question bank. Configure a provider to enable optional AI drafting and feedback.
            <Link href="/settings/privacy" className="cp-link ml-1">Read the data disclosure.</Link>
          </p>
        )}
      </Alert>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Requests (30d)" value={usage?.requests ?? 0} icon={Activity} hint="Only real provider calls" />
        <StatCard label="Tokens (30d)" value={usage ? usage.input_tokens + usage.output_tokens : 0} icon={Cpu} tone="info" />
        <StatCard label="Failures" value={usage?.failures ?? 0} icon={PlugZap} tone={usage?.failures ? "warning" : "success"} />
        <StatCard label="Estimated cost" value={usage?.estimated_cost_usd != null ? `$${usage.estimated_cost_usd.toFixed(4)}` : "—"}
                  icon={Wallet} hint={usage?.cost_note} tone="neon" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_0.9fr]">
        <Section title="Providers" description="Only one provider can be active at a time.">
          <div className="space-y-3">
            {configsQuery.isLoading ? <Skeleton className="h-28" /> : null}
            {!configsQuery.isLoading && !configs.length ? (
              <EmptyState icon={Sparkles} title="No AI providers configured"
                          description="Add an OpenAI-compatible endpoint or a local Ollama server. Keys are encrypted with Fernet before storage."
                          action={<Button onClick={openCreate}><Plus className="h-4 w-4" aria-hidden="true" /> Add provider</Button>} />
            ) : null}
            {configs.map((config) => (
              <Card key={config.id}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" />
                      {config.label}
                    </span>
                    <span className="flex items-center gap-1.5">
                      {config.is_active ? <Badge tone="success">active</Badge> : <Badge>inactive</Badge>}
                      <Badge tone={config.local_endpoint ? "info" : "neutral"}>
                        {config.local_endpoint ? "local" : "cloud"}
                      </Badge>
                      {config.disclosure_accepted_at ? <Badge tone="success">disclosure accepted</Badge>
                        : <Badge tone="warning">disclosure pending</Badge>}
                    </span>
                  </CardTitle>
                  <CardDescription>
                    {config.provider} · {config.base_url} · model {config.model}
                    {config.api_key_hint ? ` · key ${config.api_key_hint}` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" loading={testing === config.id}
                            onClick={() => void testConnection(config)}>
                      <PlugZap className="h-3.5 w-3.5" aria-hidden="true" /> Test
                    </Button>
                    {!config.is_active ? (
                      <Button size="sm" variant="outline" loading={testing === config.id}
                              onClick={() => void activate(config)}>Activate</Button>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={() => openEdit(config)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => void remove(config)}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-1 text-xs text-[var(--muted)] sm:grid-cols-2">
                    <p>Temperature: {config.temperature}</p>
                    <p>Max output: {config.max_output_tokens} tokens</p>
                    <p>Timeout: {config.timeout_seconds}s · retries {config.max_retries}</p>
                    <p>Monthly limit: {config.monthly_usage_limit_tokens ?? "none"}</p>
                    <p>Fallback model: {config.fallback_model || "none"}</p>
                    <p>Last test: {config.last_tested_at ? formatDateTime(config.last_tested_at) : "never"}</p>
                  </div>
                  {Object.keys(config.task_models ?? {}).length ? (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Task overrides:{" "}
                      {Object.entries(config.task_models).map(([task, model]) => `${humanize(task)} → ${model}`).join(", ")}
                    </p>
                  ) : null}
                  {testResult?.message ? (
                    <p className="mt-2 text-xs text-[var(--muted)]">{testResult.message}</p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" /> Data disclosure
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-[var(--muted)]">
              <p>When you start an AI action, CareerPilot may send: your verified profile fields chosen for the task, the job description, your draft text and the specific instructions.</p>
              <p>CareerPilot does not send passwords, session tokens, API keys, other users&apos; data, or files from your documents library.</p>
              <p>Provider retention and training policies are controlled by the provider you choose. Local Ollama keeps requests inside your network.</p>
              <p>API keys are encrypted with a server-side key and are never returned by the API.</p>
              <Button size="sm" variant="outline" onClick={() => setDisclosureOpen(true)}>Read full disclosure</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Usage by task</CardTitle></CardHeader>
            <CardContent>
              {usage?.by_task?.length ? (
                <ul className="space-y-1.5 text-xs">
                  {usage.by_task.map((entry) => (
                    <li key={entry.task} className="flex items-center justify-between gap-2">
                      <span>{humanize(entry.task)}</span>
                      <span className="text-[var(--muted)]">{entry.requests} calls · {entry.tokens} tokens</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-[var(--muted)]">No usage recorded in the last 30 days.</p>}
              <p className="mt-3 text-[10px] text-[var(--muted)]">{usage?.cost_note}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} size="lg"
              title={editing ? "Edit provider" : "Add AI provider"}
              description="Keys are encrypted before storage and never displayed again."
              footer={
                <>
                  <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button loading={saving} onClick={() => void save()}>{editing ? "Save changes" : "Save provider"}</Button>
                </>
              }>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Button key={preset.label} type="button" size="sm" variant="outline"
                      onClick={() => setForm((current) => ({
                        ...current, label: preset.label, provider: preset.provider,
                        base_url: preset.base_url, model: preset.model,
                      }))}>
                {preset.label}
              </Button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Label" htmlFor="ai-label" required>
              <Input id="ai-label" value={form.label}
                     onChange={(event) => setForm({ ...form, label: event.target.value })} />
            </Field>
            <Field label="Provider" htmlFor="ai-provider">
              <Select id="ai-provider" value={form.provider}
                      onChange={(event) => setForm({ ...form, provider: event.target.value })}>
                <option value="openai_compatible">OpenAI-compatible</option>
                <option value="openai">OpenAI</option>
                <option value="ollama">Ollama (local)</option>
              </Select>
            </Field>
          </div>
          <Field label="Base URL" htmlFor="ai-url" required
                 help="Cloud endpoints must be public HTTPS. Private endpoints are blocked unless the server operator enables them.">
            <Input id="ai-url" value={form.base_url}
                   onChange={(event) => setForm({ ...form, base_url: event.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Model" htmlFor="ai-model" required>
              <Input id="ai-model" value={form.model}
                     onChange={(event) => setForm({ ...form, model: event.target.value })} />
            </Field>
            <Field label={form.provider === "ollama" ? "API key (not required)" : "API key"} htmlFor="ai-key"
                   required={form.provider !== "ollama" && !editing}>
              <Input id="ai-key" type="password" autoComplete="off" value={form.api_key}
                     placeholder={editing ? "Leave blank to keep the stored key" : "sk-…"}
                     onChange={(event) => setForm({ ...form, api_key: event.target.value })} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Temperature" htmlFor="ai-temp">
              <Input id="ai-temp" type="number" step="0.1" min={0} max={2} value={form.temperature}
                     onChange={(event) => setForm({ ...form, temperature: Number(event.target.value) })} />
            </Field>
            <Field label="Max tokens" htmlFor="ai-tokens">
              <Input id="ai-tokens" type="number" min={64} max={8000} value={form.max_output_tokens}
                     onChange={(event) => setForm({ ...form, max_output_tokens: Number(event.target.value) })} />
            </Field>
            <Field label="Timeout (s)" htmlFor="ai-timeout">
              <Input id="ai-timeout" type="number" min={5} max={180} value={form.timeout_seconds}
                     onChange={(event) => setForm({ ...form, timeout_seconds: Number(event.target.value) })} />
            </Field>
            <Field label="Retries" htmlFor="ai-retries">
              <Input id="ai-retries" type="number" min={0} max={4} value={form.max_retries}
                     onChange={(event) => setForm({ ...form, max_retries: Number(event.target.value) })} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Fallback model" htmlFor="ai-fallback" help="Used when the primary model is unavailable.">
              <Input id="ai-fallback" value={form.fallback_model}
                     onChange={(event) => setForm({ ...form, fallback_model: event.target.value })} />
            </Field>
            <Field label="Monthly token limit" htmlFor="ai-limit" help="Leave blank for no application-side limit.">
              <Input id="ai-limit" type="number" min={1000} value={form.monthly_usage_limit_tokens}
                     onChange={(event) => setForm({ ...form, monthly_usage_limit_tokens: event.target.value })} />
            </Field>
          </div>
          <label className="flex items-start gap-2 rounded-xl border p-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#39FF14]" checked={form.disclosure_accepted}
                   onChange={(event) => setForm({ ...form, disclosure_accepted: event.target.checked })} />
            <span>
              <span className="font-medium">I understand AI data transmission.</span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">
                Selected career data and the job description may be sent to the provider above when I start an AI action.
                I can disable AI at any time.
              </span>
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[#39FF14]" checked={form.is_active}
                   onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
            Make this the active provider
          </label>
        </div>
      </Dialog>

      <Dialog open={disclosureOpen} onClose={() => setDisclosureOpen(false)} size="lg" title="AI data disclosure">
        <div className="space-y-3 text-sm text-[var(--muted)]">
          <p><strong className="text-[var(--fg)]">What is sent.</strong> Only task-relevant content that you select or start: verified profile records, the target job description, your current draft, and instructions. Prompts wrap untrusted job text and answers so the model treats them as data, not instructions.</p>
          <p><strong className="text-[var(--fg)]">What is never sent.</strong> Passwords, session cookies, CSRF tokens, API keys, other users&apos; data and stored document files.</p>
          <p><strong className="text-[var(--fg)]">Who receives it.</strong> Only the provider you configure. Cloud providers process data on their infrastructure under their terms; Ollama processes locally.</p>
          <p><strong className="text-[var(--fg)]">What is stored.</strong> Prompts and responses are not stored as raw provider logs. CareerPilot stores token counts, latency, model, task and success state for usage/cost reporting.</p>
          <p><strong className="text-[var(--fg)]">Control.</strong> You can deactivate or delete the configuration and keys at any time. Deleting a provider removes its encrypted key.</p>
          <p><strong className="text-[var(--fg)]">Limits.</strong> AI output is untrusted. CareerPilot validates suggestions against verified profile data, and critical factual findings block document approval.</p>
        </div>
      </Dialog>
    </div>
  );
}
