"use client";

import { Dices, Dumbbell, Hand, LayoutGrid, type LucideIcon, Shield, Target, Zap } from "lucide-react";
import { FilterChipGroup } from "@/components/filter-chips";
import type { ExerciseFacetCounts } from "@/lib/exercises";
import { toggleFilterValue } from "@/lib/exercises";
import { EXERCISE_CATEGORIES, type ExerciseCategory } from "@/lib/types";

export const categoryPresentation: Record<ExerciseCategory, { icon: LucideIcon; pressed: string; idle: string }> = {
  Forsvar: { icon: Shield, pressed: "border-[#24618b] bg-[#24618b] text-white", idle: "border-[#b9d9ed] bg-[#eaf5fb] text-[#245879] hover:border-[#6fa6c8]" },
  Angrep: { icon: Zap, pressed: "border-[#c44d24] bg-[#c44d24] text-white", idle: "border-[#f2c4ae] bg-[#fff0e8] text-[#a43d1c] hover:border-[#e18b64]" },
  Skuddferdigheter: { icon: Target, pressed: "border-[#a33d68] bg-[#a33d68] text-white", idle: "border-[#e7bfd0] bg-[#fceef4] text-[#873354] hover:border-[#ca7b9d]" },
  Målvakt: { icon: Hand, pressed: "border-[#75539a] bg-[#75539a] text-white", idle: "border-[#d8c7ea] bg-[#f5effb] text-[#654686] hover:border-[#a98bc8]" },
  Fysisk: { icon: Dumbbell, pressed: "border-[#357052] bg-[#357052] text-white", idle: "border-[#bedcc9] bg-[#edf7f0] text-[#2e6549] hover:border-[#80b594]" },
  Leker: { icon: Dices, pressed: "border-[#a66b13] bg-[#a66b13] text-white", idle: "border-[#ead29f] bg-[#fff7dc] text-[#86550e] hover:border-[#cda955]" },
};

/**
 * "Alle" is the absence of a filter, so it is deliberately the quietest chip in
 * the row even while it is the active one: a filled ink pill shouted louder than
 * every real choice, which put the page's strongest emphasis on the state that
 * carries no information. Selected here is a ring, not a fill; the fill is
 * reserved for a category actually doing work.
 */
export const ALL_CHIP_KEY = "__alle__";
export const allChipTone = {
  pressed: "border-[var(--ink)] bg-white text-[var(--ink)] shadow-[inset_0_0_0_1px_var(--ink)]",
  idle: "border-[var(--line)] bg-white text-[var(--ink-soft)] hover:border-[var(--ink-soft)]",
};

export function ExerciseCategoryFilter({ value, onChange, counts }: { value: readonly ExerciseCategory[]; onChange(categories: ExerciseCategory[]): void; counts: ExerciseFacetCounts }) {
  const chips = [
    { key: ALL_CHIP_KEY, label: "Alle", icon: LayoutGrid, count: counts.allCategories, pressed: value.length === 0, tone: allChipTone },
    ...EXERCISE_CATEGORIES.map((category) => ({
      key: category,
      label: category,
      icon: categoryPresentation[category].icon,
      count: counts.categories[category],
      pressed: value.includes(category),
      tone: categoryPresentation[category],
    })),
  ];

  return <FilterChipGroup
    label="Filtrer etter kategori"
    chips={chips}
    onToggle={(key) => onChange(key === ALL_CHIP_KEY ? [] : toggleFilterValue(value, key as ExerciseCategory, EXERCISE_CATEGORIES))}
  />;
}
