"use client";

import { ALL_CHIP_KEY } from "@/components/exercise-category-filter";
import { FilterChipGroup } from "@/components/filter-chips";
import type { ExerciseFacetCounts } from "@/lib/exercises";
import { formatAgeGroup, toggleFilterValue } from "@/lib/exercises";
import { EXERCISE_AGE_GROUPS, type ExerciseAgeGroup } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Age bands read as one scale rather than three unrelated topics, so they share
 * a palette and grow darker with age instead of each getting a colour of its
 * own. Only `ExerciseAgeGroupPicker` wears it: a chip inside `.grep-filter-chips`
 * is painted by the rebrand's own rules, and the picker tags an exercise in a
 * form, where nothing else states which bands are set.
 */
const agePresentation: Record<ExerciseAgeGroup, { pressed: string; idle: string }> = {
  "6-9": { pressed: "border-[#3f8f6b] bg-[#3f8f6b] text-white", idle: "border-[#c3e3d1] bg-[#eef8f2] text-[#2f6a4f] hover:border-[#8ac2a4]" },
  "10-12": { pressed: "border-[#357052] bg-[#357052] text-white", idle: "border-[#b6d9c5] bg-[#e8f4ed] text-[#2a5d43] hover:border-[#79b498]" },
  "13-15": { pressed: "border-[#27553d] bg-[#27553d] text-white", idle: "border-[#a8d0b9] bg-[#e2f0e8] text-[#234f39] hover:border-[#6aa88c]" },
};

export function ExerciseAgeGroupFilter({ value, onChange, counts }: { value: readonly ExerciseAgeGroup[]; onChange(ageGroups: ExerciseAgeGroup[]): void; counts: ExerciseFacetCounts }) {
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
