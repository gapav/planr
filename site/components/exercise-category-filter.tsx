"use client";

import { Dices, Dumbbell, Hand, LayoutGrid, type LucideIcon, Shield, Target, Zap } from "lucide-react";
import { FilterChipGroup } from "@/components/filter-chips";
import type { ExerciseFacetCounts } from "@/lib/exercises";
import { toggleFilterValue } from "@/lib/exercises";
import { EXERCISE_CATEGORIES, type ExerciseCategory } from "@/lib/types";

/**
 * The icon each category wears — on a chip, and on a card with no media of its
 * own (`ExerciseThumbnail`).
 *
 * Each category used to carry a bespoke pressed/idle palette here as well. The
 * rebrand's `.grep-filter-chips` rules outrank every one of them, so all six
 * rendered identically for months while the code claimed otherwise; the palette
 * is deleted rather than revived, because one accent doing the work of "this
 * chip is on" is the rest of the app's rule.
 */
export const categoryPresentation: Record<ExerciseCategory, { icon: LucideIcon }> = {
  Forsvar: { icon: Shield },
  Angrep: { icon: Zap },
  Skuddferdigheter: { icon: Target },
  Målvakt: { icon: Hand },
  Fysisk: { icon: Dumbbell },
  Leker: { icon: Dices },
};

/** "Alle" is the absence of a filter, not a seventh category. */
export const ALL_CHIP_KEY = "__alle__";

export function ExerciseCategoryFilter({ value, onChange, counts }: { value: readonly ExerciseCategory[]; onChange(categories: ExerciseCategory[]): void; counts: ExerciseFacetCounts }) {
  const chips = [
    { key: ALL_CHIP_KEY, label: "Alle", icon: LayoutGrid, count: counts.allCategories, pressed: value.length === 0 },
    ...EXERCISE_CATEGORIES.map((category) => ({
      key: category,
      label: category,
      icon: categoryPresentation[category].icon,
      count: counts.categories[category],
      pressed: value.includes(category),
    })),
  ];

  return <FilterChipGroup
    label="Filtrer etter kategori"
    chips={chips}
    onToggle={(key) => onChange(key === ALL_CHIP_KEY ? [] : toggleFilterValue(value, key as ExerciseCategory, EXERCISE_CATEGORIES))}
  />;
}
