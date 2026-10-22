"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/providers";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-xl border text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)]",
        className
      )}
    >
      {resolved === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}
