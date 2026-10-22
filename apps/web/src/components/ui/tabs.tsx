"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Tabs({
  tabs, value, onChange, className, ariaLabel,
}: {
  tabs: { value: string; label: string; count?: number }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel}
         className={cn("flex flex-wrap gap-1 rounded-xl border bg-[var(--surface)] p-1", className)}>
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            role="tab"
            type="button"
            id={`tab-${tab.value}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.value}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
              event.preventDefault();
              const index = tabs.findIndex((t) => t.value === value);
              const next = event.key === "ArrowRight"
                ? tabs[(index + 1) % tabs.length]
                : tabs[(index - 1 + tabs.length) % tabs.length];
              onChange(next.value);
              document.getElementById(`tab-${next.value}`)?.focus();
            }}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              selected
                ? "bg-[var(--fg)] text-[var(--bg)]"
                : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
            )}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span className="ml-1.5 rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--fg)]">
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
