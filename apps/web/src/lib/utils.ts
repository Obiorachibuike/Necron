import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value?: string | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, options ?? {
    year: "numeric", month: "short", day: "numeric",
  }).format(date);
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

export function relativeTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 1000 * 60 * 60 * 24 * 365],
    ["month", 1000 * 60 * 60 * 24 * 30],
    ["week", 1000 * 60 * 60 * 24 * 7],
    ["day", 1000 * 60 * 60 * 24],
    ["hour", 1000 * 60 * 60],
    ["minute", 1000 * 60],
  ];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, ms] of units) {
    if (abs >= ms) return formatter.format(Math.round(diff / ms), unit);
  }
  return "just now";
}

export function formatNumber(value?: number | null) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat().format(value);
}

export function formatMoney(value?: number | null, currency = "USD") {
  if (value === null || value === undefined) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency", currency: currency || "USD", maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value}`;
  }
}

export function initials(name: string, email = "") {
  const source = name.trim() || email.split("@")[0] || "?";
  return source
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function humanize(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export function sanitizeFilename(value: string) {
  return value.replace(/[^A-Za-z0-9._ -]/g, "").trim() || "document";
}

export function isoDate(value?: string | Date | null) {
  if (!value) return "";
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}
