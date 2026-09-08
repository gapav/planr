import { formatAgeGroup } from "@/lib/exercises";
import { EXERCISE_AGE_GROUPS, type ExerciseAgeGroup } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Age bands read as one scale rather than six unrelated topics, so unlike
 * `ExerciseCategoryFilter` they share a palette and grow darker with age instead
 * of each getting a colour of their own.
 */
const agePresentation: Record<ExerciseAgeGroup, { emoji: string; selected: string; idle: string }> = {
  "6-9": { emoji: "🐣", selected: "border-[#3f8f6b] bg-[#3f8f6b] text-white", idle: "border-[#c3e3d1] bg-[#eef8f2] text-[#2f6a4f] hover:border-[#8ac2a4]" },
  "10-12": { emoji: "🌱", selected: "border-[#357052] bg-[#357052] text-white", idle: "border-[#b6d9c5] bg-[#e8f4ed] text-[#2a5d43] hover:border-[#79b498]" },
  "13-15": { emoji: "🔥", selected: "border-[#27553d] bg-[#27553d] text-white", idle: "border-[#a8d0b9] bg-[#e2f0e8] text-[#234f39] hover:border-[#6aa88c]" },
};

const chipClass = "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-bold sm:px-3.5 sm:py-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--orange)]";

export function ExerciseAgeGroupFilter({ value, onChange }: { value: ExerciseAgeGroup | null; onChange(ageGroup: ExerciseAgeGroup | null): void }) {
  const options: Array<{ label: string; emoji: string; value: ExerciseAgeGroup | null; selected: string; idle: string }> = [
    { label: "Alle aldre", emoji: "👥", value: null, selected: "border-[var(--ink)] bg-[var(--ink)] text-white", idle: "border-[var(--line)] bg-white text-[var(--ink-soft)] hover:border-[var(--ink-soft)]" },
    ...EXERCISE_AGE_GROUPS.map((group) => ({ label: formatAgeGroup(group), value: group, ...agePresentation[group] })),
  ];

  return <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer etter aldersgruppe">
    {options.map((option) => {
      const selected = option.value === value;
      return <button
        key={option.label}
        type="button"
        aria-pressed={selected}
        onClick={() => onChange(option.value)}
        className={cn(chipClass, selected ? option.selected : option.idle)}
      ><span aria-hidden="true">{option.emoji}</span>{option.label}</button>;
    })}
  </div>;
}

/**
 * The form's counterpart: an exercise may suit several bands, so this toggles a
 * set instead of picking one. Choosing none is allowed and means "not stated" —
 * `matchesAgeGroup` then lets the exercise through every filter.
 */
export function ExerciseAgeGroupPicker({ value, onChange }: { value: readonly ExerciseAgeGroup[]; onChange(ageGroups: ExerciseAgeGroup[]): void }) {
  // Reselecting from the constant keeps the saved array in the canonical order
  // whatever order the coach clicked in, so tags read "6-9, 13-15" every time.
  function toggle(group: ExerciseAgeGroup) {
    const next = value.includes(group) ? value.filter((entry) => entry !== group) : [...value, group];
    onChange(EXERCISE_AGE_GROUPS.filter((entry) => next.includes(entry)));
  }

  return <div className="flex flex-wrap gap-2" role="group" aria-label="Aldersgrupper">
    {EXERCISE_AGE_GROUPS.map((group) => {
      const selected = value.includes(group);
      return <button
        key={group}
        type="button"
        aria-pressed={selected}
        onClick={() => toggle(group)}
        className={cn(chipClass, selected ? agePresentation[group].selected : agePresentation[group].idle)}
      ><span aria-hidden="true">{agePresentation[group].emoji}</span>{formatAgeGroup(group)}</button>;
    })}
  </div>;
}
