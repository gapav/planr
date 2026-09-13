import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join(""); }
/**
 * Ink or paper for a label on a solid background, by WCAG relative luminance.
 *
 * Avatars are tinted per coach, and the palette holds both a deep purple and a
 * pale lilac, so the initials cannot commit to white. Anything but a six-digit
 * hex falls back to white, which is what the old fixed-colour avatars used.
 */
export function readableInk(background: string) {
  const hex = /^#([0-9a-f]{6})$/i.exec(background.trim());
  if (!hex) return "#ffffff";
  const channel = (offset: number) => {
    const value = parseInt(hex[1].slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return luminance > 0.36 ? "#2e1b3d" : "#ffffff";
}
export function makeUuid() { return crypto.randomUUID(); }
export function minutesLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60); const rest = minutes % 60;
  return rest ? `${hours} t ${rest} min` : `${hours} t`;
}
/** `16:05` — the clock as a Norwegian coach reads it. `timeZone` is only passed by tests. */
export function clockTime(date: Date, timeZone?: string) {
  return new Intl.DateTimeFormat("nb-NO", { hour: "2-digit", minute: "2-digit", ...(timeZone ? { timeZone } : {}) }).format(date);
}
export function formatSessionDate(startsAt: string | null) {
  if (!startsAt) return "Dato ikke satt";
  return new Intl.DateTimeFormat("nb-NO", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(startsAt));
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
