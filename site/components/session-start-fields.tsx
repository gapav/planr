"use client";

import { Calendar, ChevronDown, Clock3 } from "lucide-react";
import { inputClass } from "./ui";
import { SESSION_HOUR_OPTIONS, sessionMinuteOptions, splitSessionTime } from "@/lib/session";
import { cn } from "@/lib/utils";

/**
 * When a session is held, as the two fields it is actually decided in. Shared
 * by the builder, which saves each change straight away, and the copy dialog,
 * which holds the pair until the copy is made — so both offer the same grid and
 * the same default, and a date set in one place reads the same in the other.
 */
export function SessionStartFields({ date, time, onChange }: { date: string; time: string; onChange(date: string, time: string): void }) {
  return <div className="flex min-w-0 flex-wrap items-center gap-2">
    <div className="relative min-w-[9.5rem] flex-1">
      <Calendar className="absolute left-3.5 top-3.5 text-[var(--ink-soft)]" size={17} />
      <input type="date" aria-label="Dato" className={`${inputClass} min-w-0 appearance-none pl-10 pr-3`} value={date} onChange={(event) => onChange(event.target.value, time)} />
    </div>
    <TimeOfDayPicker value={time} disabled={!date} onChange={(next) => onChange(date, next)} />
  </div>;
}

/**
 * Two short dropdowns rather than one holding all 96 quarter hours: the long
 * list was what made picking a time a chore. The hour is 24 options and the
 * minute, on the quarter-hour grid, is four.
 */
export function TimeOfDayPicker({ value, disabled, onChange }: { value: string; disabled: boolean; onChange(next: string): void }) {
  const { hour, minute } = splitSessionTime(value);
  const select = cn(inputClass, "appearance-none text-center tabular-nums disabled:opacity-45");
  return <div className="flex items-center gap-1">
    <div className="relative">
      <Clock3 className="absolute left-2.5 top-3.5 text-[var(--ink-soft)]" size={16} />
      <select aria-label="Time" disabled={disabled} value={hour} onChange={(event) => onChange(`${event.target.value}:${minute}`)} className={cn(select, "w-[4.9rem] pl-8 pr-5")}>{SESSION_HOUR_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select>
      <ChevronDown className="pointer-events-none absolute right-2 top-3.5 text-[var(--ink-soft)]" size={15} />
    </div>
    <span className="text-sm font-black text-[var(--ink-soft)]">:</span>
    <div className="relative">
      <select aria-label="Minutt" disabled={disabled} value={minute} onChange={(event) => onChange(`${hour}:${event.target.value}`)} className={cn(select, "w-[3.3rem] pl-2 pr-5")}>{sessionMinuteOptions(minute).map((option) => <option key={option} value={option}>{option}</option>)}</select>
      <ChevronDown className="pointer-events-none absolute right-2 top-3.5 text-[var(--ink-soft)]" size={15} />
    </div>
  </div>;
}
