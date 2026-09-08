import { Dices, Dumbbell, Hand, LayoutGrid, type LucideIcon, Shield, Target, Zap } from "lucide-react";
import { EXERCISE_CATEGORIES, type ExerciseCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

export const categoryPresentation: Record<ExerciseCategory, { icon: LucideIcon; selected: string; idle: string }> = {
  Forsvar: { icon: Shield, selected: "border-[#24618b] bg-[#24618b] text-white", idle: "border-[#b9d9ed] bg-[#eaf5fb] text-[#245879] hover:border-[#6fa6c8]" },
  Angrep: { icon: Zap, selected: "border-[#c44d24] bg-[#c44d24] text-white", idle: "border-[#f2c4ae] bg-[#fff0e8] text-[#a43d1c] hover:border-[#e18b64]" },
  Skuddferdigheter: { icon: Target, selected: "border-[#a33d68] bg-[#a33d68] text-white", idle: "border-[#e7bfd0] bg-[#fceef4] text-[#873354] hover:border-[#ca7b9d]" },
  Målvakt: { icon: Hand, selected: "border-[#75539a] bg-[#75539a] text-white", idle: "border-[#d8c7ea] bg-[#f5effb] text-[#654686] hover:border-[#a98bc8]" },
  Fysisk: { icon: Dumbbell, selected: "border-[#357052] bg-[#357052] text-white", idle: "border-[#bedcc9] bg-[#edf7f0] text-[#2e6549] hover:border-[#80b594]" },
  Leker: { icon: Dices, selected: "border-[#a66b13] bg-[#a66b13] text-white", idle: "border-[#ead29f] bg-[#fff7dc] text-[#86550e] hover:border-[#cda955]" },
};

export function ExerciseCategoryFilter({ value, onChange }: { value: ExerciseCategory | null; onChange(category: ExerciseCategory | null): void }) {
  const options: Array<{ label: string; icon: LucideIcon; value: ExerciseCategory | null; selected: string; idle: string }> = [
    { label: "Alle", icon: LayoutGrid, value: null, selected: "border-[var(--ink)] bg-[var(--ink)] text-white", idle: "border-[var(--line)] bg-white text-[var(--ink-soft)] hover:border-[var(--ink-soft)]" },
    ...EXERCISE_CATEGORIES.map((category) => ({ label: category, value: category, ...categoryPresentation[category] })),
  ];

  return <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer etter kategori">
    {options.map((option) => {
      const selected = option.value === value;
      const Icon = option.icon;
      return <button
        key={option.label}
        type="button"
        aria-pressed={selected}
        onClick={() => onChange(option.value)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-bold sm:px-3.5 sm:py-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--orange)]",
          selected ? option.selected : option.idle,
        )}
      ><Icon size={15} strokeWidth={2.25} aria-hidden="true" />{option.label}</button>;
    })}
  </div>;
}
