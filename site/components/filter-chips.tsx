"use client";

import type { LucideIcon } from "lucide-react";
import { type KeyboardEvent as ReactKeyboardEvent, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface FilterChip {
  /** Stable identity for the chip; `onToggle` reports it back. */
  key: string;
  label: string;
  icon?: LucideIcon;
  /** How many exercises the chip is worth right now — see `countExerciseFacets`. */
  count: number;
  pressed: boolean;
  /** Palette for the pressed and unpressed states. */
  tone: { pressed: string; idle: string };
}

const chipClass = "inline-flex select-none items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--orange)] sm:px-3.5 sm:py-2";

/**
 * A wrapping row of filter chips. It is a toolbar rather than a plain group so
 * the whole row is one tab stop: eleven chips sit between the search box and the
 * first result, and tabbing through every one of them to reach the exercises was
 * the single worst thing about the page on a keyboard. Arrow keys move between
 * chips, Home and End jump to the ends, and Space/Enter toggle as usual.
 */
export function FilterChipGroup({ label, chips, onToggle }: { label: string; chips: readonly FilterChip[]; onToggle(key: string): void }) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  // Resolved on every render rather than stored as an index, because the chip
  // list is stable but its contents are not: focus should survive a relabelled
  // count, and fall back to the first chip if its owner disappears.
  const focusIndex = Math.max(0, chips.findIndex((chip) => chip.key === focusKey));

  function moveFocus(index: number) {
    const wrapped = (index + chips.length) % chips.length;
    setFocusKey(chips[wrapped].key);
    buttons.current[wrapped]?.focus();
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step !== undefined) moveFocus(index + step);
    else if (event.key === "Home") moveFocus(0);
    else if (event.key === "End") moveFocus(chips.length - 1);
    else return;
    event.preventDefault();
  }

  return <div className="flex flex-wrap gap-2" role="toolbar" aria-orientation="horizontal" aria-label={label}>
    {chips.map((chip, index) => {
      const Icon = chip.icon;
      return <button
        key={chip.key}
        ref={(node) => { buttons.current[index] = node; }}
        type="button"
        aria-pressed={chip.pressed}
        tabIndex={index === focusIndex ? 0 : -1}
        onKeyDown={(event) => onKeyDown(event, index)}
        onFocus={() => setFocusKey(chip.key)}
        onClick={() => onToggle(chip.key)}
        aria-label={`${chip.label} — ${chip.count} ${chip.count === 1 ? "øvelse" : "øvelser"}`}
        className={cn(chipClass, chip.pressed ? chip.tone.pressed : chip.tone.idle, !chip.pressed && chip.count === 0 && "opacity-50")}
      >
        {Icon && <Icon size={15} strokeWidth={2.25} aria-hidden="true" />}
        {chip.label}
        <span className="text-xs font-black tabular-nums opacity-60">{chip.count}</span>
      </button>;
    })}
  </div>;
}
