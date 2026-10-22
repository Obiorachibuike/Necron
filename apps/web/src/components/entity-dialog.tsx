"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

export type EntityField = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "date" | "number" | "select" | "checkbox" | "list";
  options?: [string, string][];
  placeholder?: string;
  help?: string;
  required?: boolean;
  full?: boolean;
  min?: number;
  max?: number;
  step?: number;
};

type Values = Record<string, unknown>;

function toInput(field: EntityField, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (field.type === "list" && Array.isArray(value)) return value.join(", ");
  if (field.type === "date") return String(value).slice(0, 10);
  return String(value);
}

export function EntityDialog({
  open, onClose, title, description, fields, initial, onSubmit, submitLabel = "Save",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  fields: EntityField[];
  initial?: Values;
  onSubmit: (values: Values) => Promise<void>;
  submitLabel?: string;
}) {
  const [values, setValues] = React.useState<Values>({});
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const next: Values = {};
    for (const field of fields) {
      const current = initial?.[field.key];
      next[field.key] = field.type === "checkbox" ? Boolean(current)
        : field.type === "list" && Array.isArray(current) ? current.join(", ")
        : field.type === "date" ? toInput(field, current)
        : current ?? "";
    }
    setValues(next);
    setError("");
  }, [open, initial, fields]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const output: Values = {};
      for (const field of fields) {
        const raw = values[field.key];
        if (field.type === "checkbox") output[field.key] = Boolean(raw);
        else if (field.type === "number") output[field.key] = raw === "" ? null : Number(raw);
        else if (field.type === "list") {
          output[field.key] = String(raw ?? "").split(/[\n,]/).map((v) => v.trim()).filter(Boolean);
        } else if (field.type === "date") output[field.key] = raw ? String(raw) : null;
        else output[field.key] = String(raw ?? "");
      }
      await onSubmit(output);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this entry.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={title} description={description} size="lg"
            footer={
              <>
                <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
                <Button type="submit" form="entity-form" loading={saving}>{submitLabel}</Button>
              </>
            }>
      <form id="entity-form" onSubmit={submit} className="space-y-4" noValidate>
        {error ? <p className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 p-3 text-sm text-[var(--danger)]" role="alert">{error}</p> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => {
            const id = `entity-${field.key}`;
            const raw = values[field.key];
            return (
              <Field key={field.key} label={field.label} htmlFor={id} help={field.help}
                     required={field.required}
                     className={field.full ? "sm:col-span-2" : undefined}>
                {field.type === "textarea" || field.type === "list" ? (
                  <Textarea id={id} rows={field.type === "list" ? 2 : 4}
                            value={String(raw ?? "")}
                            placeholder={field.placeholder}
                            onChange={(event) => setValues((current) => ({
                              ...current, [field.key]: event.target.value,
                            }))} />
                ) : field.type === "select" ? (
                  <Select id={id} value={String(raw ?? "")}
                          onChange={(event) => setValues((current) => ({
                            ...current, [field.key]: event.target.value,
                          }))}>
                    {(field.options ?? []).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </Select>
                ) : field.type === "checkbox" ? (
                  <label className="flex h-10 items-center gap-2 rounded-xl border px-3 text-sm">
                    <input id={id} type="checkbox" className="h-4 w-4 accent-[#39FF14]"
                           checked={Boolean(raw)}
                           onChange={(event) => setValues((current) => ({
                             ...current, [field.key]: event.target.checked,
                           }))} />
                    {field.placeholder ?? field.label}
                  </label>
                ) : (
                  <Input id={id} type={field.type ?? "text"} value={String(raw ?? "")}
                         placeholder={field.placeholder} min={field.min} max={field.max}
                         step={field.step}
                         onChange={(event) => setValues((current) => ({
                           ...current, [field.key]: event.target.value,
                         }))} />
                )}
              </Field>
            );
          })}
        </div>
      </form>
    </Dialog>
  );
}
