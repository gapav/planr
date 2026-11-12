"use client";

import { categoryPresentation } from "@/components/exercise-category-filter";
import { tagTones } from "@/components/ui";
import { formatSubtopic, subtopicsOf, toggleFilterValue } from "@/lib/exercises";
import type { ExerciseCategory, ExerciseSubtopic } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The form's undertema picker. It offers only the chosen topic's subtopics — an
 * exercise may carry several, but never one from another topic, which
 * `exercises_subtopics_check` enforces as well — and choosing none is allowed:
 * the exercise then shows under its topic and under none of its subtopics. Like
 * the age picker it tags one exercise rather than narrowing a list, so there is
 * nothing to count. A chosen chip wears the topic's tag tone, the way the rail
 * and the detail view show it.
 */
export function ExerciseSubtopicPicker({ category, value, onChange }: { category: ExerciseCategory; value: readonly ExerciseSubtopic[]; onChange(subtopics: ExerciseSubtopic[]): void }) {
  const options = subtopicsOf(category);
  const { tint, ink } = tagTones[categoryPresentation[category].tone];
  return <div className="flex flex-wrap gap-2" role="group" aria-label="Undertema">
    {options.map((subtopic) => {
      const selected = value.includes(subtopic);
      return <button
        key={subtopic}
        type="button"
        aria-pressed={selected}
        onClick={() => onChange(toggleFilterValue(value, subtopic, options))}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:px-3.5 sm:py-2",
          selected ? "border-transparent" : "border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-mid)] hover:border-[var(--line-hover)]",
        )}
        style={selected ? { background: tint, color: ink } : undefined}
      >{formatSubtopic(subtopic)}</button>;
    })}
  </div>;
}
