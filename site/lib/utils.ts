import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join(""); }
export function makeUuid() { return crypto.randomUUID(); }
export function minutesLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60); const rest = minutes % 60;
  return rest ? `${hours} t ${rest} min` : `${hours} t`;
}
export function formatSessionDate(startsAt: string | null) {
  if (!startsAt) return "Dato ikke satt";
  return new Intl.DateTimeFormat("nb-NO", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(startsAt));
}
export function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value); const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

// The session list shows the date as a calendar chip, so the pieces are
// formatted separately rather than as one sentence. `timeZone` is only passed
// by tests; the app always renders in the viewer's zone.
export function sessionDateParts(startsAt: string | null, timeZone?: string) {
  if (!startsAt) return null;
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return null;
  const part = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("nb-NO", { ...options, ...(timeZone ? { timeZone } : {}) }).format(date);
  return { weekday: part({ weekday: "short" }), day: part({ day: "numeric" }), month: part({ month: "short" }), time: part({ hour: "2-digit", minute: "2-digit" }) };
}
