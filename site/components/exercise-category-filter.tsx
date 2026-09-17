"use client";

import { Dices, Dumbbell, Hand, LayoutGrid, type LucideIcon, Shield, Target, Zap } from "lucide-react";
import { FilterChipGroup } from "@/components/filter-chips";
import type { TagTone } from "@/components/ui";
import type { ExerciseFacetCounts } from "@/lib/exercises";
import { toggleFilterValue } from "@/lib/exercises";
import { EXERCISE_CATEGORIES, type ExerciseCategory } from "@/lib/types";

/**
 * How each category reads: the icon it wears on a chip and on a card with no
 * media of its own (`ExerciseThumbnail`), and the `Tag` tone its name wears on
 * a library card and in the detail dialog. Six topics in one apricot told a
 * coach scanning the grid nothing the label had not already said.
 *
 * `tone` is for tags only. Each category used to carry a bespoke pressed/idle
 * chip palette here as well; the rebrand's `.grep-filter-chips` rules outrank
 * every one of them, so all six rendered identically for months while the code
 * claimed otherwise. That palette stays deleted — one accent doing the work of
 * "this chip is on" is the rest of the app's rule, and a hue that says *which*
 * topic is a different job from a state that says *whether* it is chosen.
 */
export const categoryPresentation: Record<ExerciseCategory, { icon: LucideIcon; tone: TagTone }> = {
  Forsvar: { icon: Shield, tone: "sky" },
  Angrep: { icon: Zap, tone: "apricot" },
  Skuddferdigheter: { icon: Target, tone: "rose" },
  Målvakt: { icon: Hand, tone: "teal" },
  Fysisk: { icon: Dumbbell, tone: "sage" },
  Leker: { icon: Dices, tone: "gold" },
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
