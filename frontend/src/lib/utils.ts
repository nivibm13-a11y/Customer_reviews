import { type ClassValue, clsx } from "clsx";
import { isAxiosError } from "axios";
import { twMerge } from "tailwind-merge";

import type { ApiErrorBody } from "@/types";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatWeek(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const s = new Date(`${start}T00:00:00`).toLocaleDateString("en-IN", opts);
  const e = new Date(`${end}T00:00:00`).toLocaleDateString("en-IN", { ...opts, year: "numeric" });
  return `${s} – ${e}`;
}

/** Human-readable message from an API error. */
export function errorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (isAxiosError<ApiErrorBody>(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
    if (!error.response) return "Cannot reach the server. Is the backend running?";
  }
  return fallback;
}
