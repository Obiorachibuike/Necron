"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Label({ className, children, htmlFor, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label htmlFor={htmlFor} className={cn("cp-label", className)} {...props}>
      {children}
    </label>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn("cp-input", className)} {...props} />
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 4, ...props }, ref) => (
    <textarea ref={ref} rows={rows} className={cn("cp-input resize-y", className)} {...props} />
  )
);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn("cp-input appearance-none bg-[var(--bg)]", className)} {...props}>
      {children}
    </select>
  )
);
Select.displayName = "Select";

export function Field({
  label, htmlFor, error, help, children, required, className,
}: {
  label?: string; htmlFor?: string; error?: string; help?: string;
  children: React.ReactNode; required?: boolean; className?: string;
}) {
  return (
    <div className={className}>
      {label ? (
        <Label htmlFor={htmlFor}>
          {label}
          {required ? <span aria-hidden="true" className="ml-0.5 text-[var(--danger)]">*</span> : null}
        </Label>
      ) : null}
      {children}
      {error ? (
        <p className="cp-error" role="alert" id={htmlFor ? `${htmlFor}-error` : undefined}>
          {error}
        </p>
      ) : help ? <p className="cp-help" id={htmlFor ? `${htmlFor}-help` : undefined}>{help}</p> : null}
    </div>
  );
}

export function Checkbox({
  label, description, className, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode; description?: string }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm", className)}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#39FF14]" {...props} />
      <span>
        <span className="font-medium">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-[var(--muted)]">{description}</span> : null}
      </span>
    </label>
  );
}

export function Toggle({
  checked, onChange, label, description, id,
}: {
  checked: boolean; onChange: (next: boolean) => void; label: string;
  description?: string; id: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border p-3">
      <div>
        <label htmlFor={id} className="cursor-pointer text-sm font-medium">{label}</label>
        {description ? <p className="mt-0.5 text-xs text-[var(--muted)]">{description}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
          checked ? "border-[#39FF14] bg-[#39FF14]" : "border-[var(--border)] bg-[var(--surface-2)]"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full transition-transform",
            checked ? "left-0.5 translate-x-5 bg-[#061007]" : "left-0.5 translate-x-0 bg-[var(--muted)]"
          )}
        />
      </button>
    </div>
  );
}
