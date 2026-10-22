"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export function TagsInput({
  value, onChange, placeholder, ariaLabel, id,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  ariaLabel: string;
  id?: string;
}) {
  const [text, setText] = React.useState("");

  const add = () => {
    const cleaned = text.trim().replace(/,$/, "");
    if (!cleaned) return;
    if (!value.includes(cleaned)) onChange([...value, cleaned]);
    setText("");
  };

  return (
    <div className="rounded-xl border bg-[var(--surface)] p-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((item) => (
          <span key={item}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-xs">
            {item}
            <button type="button" aria-label={`Remove ${item}`}
                    onClick={() => onChange(value.filter((entry) => entry !== item))}>
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <Input id={id} value={text} aria-label={ariaLabel}
               placeholder={placeholder ?? "Type and press Enter"}
               className="h-8 border-0 bg-transparent px-1 focus-visible:ring-0"
               onChange={(event) => setText(event.target.value)}
               onKeyDown={(event) => {
                 if (event.key === "Enter" || event.key === ",") {
                   event.preventDefault();
                   add();
                 }
                 if (event.key === "Backspace" && !text && value.length) {
                   onChange(value.slice(0, -1));
                 }
               }} />
        <Button type="button" size="sm" variant="ghost" onClick={add} aria-label="Add item">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

export function RepeatableCard({
  title, subtitle, index, total, onMoveUp, onMoveDown, onRemove, children,
}: {
  title: string;
  subtitle?: string;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(index === 0);
  return (
    <div className="rounded-xl border">
      <div className="flex items-center gap-2 p-3">
        <button type="button" className="min-w-0 flex-1 text-left"
                aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <p className="truncate text-sm font-medium">{title || "Untitled entry"}</p>
          {subtitle ? <p className="truncate text-xs text-[var(--muted)]">{subtitle}</p> : null}
        </button>
        <Button type="button" size="sm" variant="ghost" aria-label="Move up"
                disabled={index === 0} onClick={onMoveUp}>↑</Button>
        <Button type="button" size="sm" variant="ghost" aria-label="Move down"
                disabled={index === total - 1} onClick={onMoveDown}>↓</Button>
        <Button type="button" size="sm" variant="ghost" aria-label={`Remove ${title || "entry"}`}
                onClick={onRemove}>
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
      {open ? <div className="space-y-3 border-t p-3">{children}</div> : null}
    </div>
  );
}

export function CheckGrid({
  options, value, onChange, label,
}: {
  options: { key: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  label: string;
}) {
  return (
    <fieldset>
      <legend className="cp-label">{label}</legend>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {options.map((option) => {
          const checked = value.includes(option.key);
          return (
            <label key={option.key}
                   className={cn("flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm",
                     checked && "border-[var(--brand)] bg-[var(--brand)]/5")}>
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#39FF14]" checked={checked}
                     onChange={() => onChange(checked
                       ? value.filter((entry) => entry !== option.key)
                       : [...value, option.key])} />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
