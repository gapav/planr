"use client";

import { ALL_CHIP_KEY } from "@/components/exercise-category-filter";
import { FilterChipGroup } from "@/components/filter-chips";
import type { TagTone } from "@/components/ui";
import type { ExerciseFacetCounts } from "@/lib/exercises";
import { formatAgeGroup, toggleFilterValue } from "@/lib/exercises";
import { EXERCISE_AGE_GROUPS, type ExerciseAgeGroup } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Age bands read as one scale rather than three unrelated topics, so they share
 * a palette and grow darker with age instead of each getting a colour of its
 * own — which is also what keeps them apart from a topic, where the hue *is* the
 * value. The ramp is the brand lilac: it was a green that nothing else in the
 * app had worn since the rebrand, and a band now sits beside a topic tag on
 * every library card, so the two families have to be told apart at a glance.
 */
const agePresentation: Record<ExerciseAgeGroup, { pressed: string; idle: string }> = {
  "6-9": { pressed: "border-[#7f5fa8] bg-[#7f5fa8] text-white", idle: "border-[#dcc9ef] bg-[var(--tag-band-1)] text-[var(--tag-band-1-ink)] hover:border-[#b394d6]" },
  "10-12": { pressed: "border-[#745295] bg-[#745295] text-white", idle: "border-[#cfb6e8] bg-[var(--tag-band-2)] text-[var(--tag-band-2-ink)] hover:border-[#a37fca]" },
  "13-15": { pressed: "border-[#5c3f79] bg-[#5c3f79] text-white", idle: "border-[#c0a2e0] bg-[var(--tag-band-3)] text-[var(--tag-band-3-ink)] hover:border-[#9269bd]" },
};

/**
 * The same ramp as a `Tag` tone, for the bands printed on a library card and in
 * the exercise dialog. Keyed off the band rather than its position so a fourth
 * entry in `EXERCISE_AGE_GROUPS` is a compile error here — a new band with no
 * colour of its own would silently fall back to the one before it.
 */
export const bandTone: Record<ExerciseAgeGroup, TagTone> = {
  "6-9": "band1",
  "10-12": "band2",
  "13-15": "band3",
};

export function ExerciseAgeGroupFilter({ value, onChange, counts, disabled = false }: { value: readonly ExerciseAgeGroup[]; onChange(ageGroups: ExerciseAgeGroup[]): void; counts: ExerciseFacetCounts; disabled?: boolean }) {
  const chips = [
    { key: ALL_CHIP_KEY, label: "Alle aldre", count: counts.allAgeGroups, pressed: value.length === 0 },
    ...EXERCISE_AGE_GROUPS.map((group) => ({
      key: group,
      label: formatAgeGroup(group),
      count: counts.ageGroups[group],
      pressed: value.includes(group),
    })),
  ];

  return <FilterChipGroup
    label="Filtrer etter aldersgruppe"
    chips={chips}
    disabled={disabled}
    onToggle={(key) => onChange(key === ALL_CHIP_KEY ? [] : toggleFilterValue(value, key as ExerciseAgeGroup, EXERCISE_AGE_GROUPS))}
  />;
}

/**
 * The form's counterpart: an exercise may suit several bands, so this toggles a
 * set instead of picking one. Choosing none is allowed and means "not stated" —
 * `matchesAgeGroup` then keeps the exercise out of every band's filter. It stays
 * a plain group rather than a `FilterChipGroup` because it tags one exercise
 * rather than narrowing a list, so there is nothing to count.
 */
export function ExerciseAgeGroupPicker({ value, onChange }: { value: readonly ExerciseAgeGroup[]; onChange(ageGroups: ExerciseAgeGroup[]): void }) {
  return <div className="flex flex-wrap gap-2" role="group" aria-label="Aldersgrupper">
    {EXERCISE_AGE_GROUPS.map((group) => {
      const selected = value.includes(group);
      return <button
        key={group}
        type="button"
        aria-pressed={selected}
        onClick={() => onChange(toggleFilterValue(value, group, EXERCISE_AGE_GROUPS))}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--orange)] sm:px-3.5 sm:py-2",
          selected ? agePresentation[group].pressed : agePresentation[group].idle,
        )}
      >{formatAgeGroup(group)}</button>;
    })}
  </div>;
}
