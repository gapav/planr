import { EXERCISE_CATEGORIES, type ExerciseCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

const categoryPresentation: Record<ExerciseCategory, { emoji: string; selected: string; idle: string }> = {
  Forsvar: { emoji: "🛡️", selected: "border-[#24618b] bg-[#24618b] text-white", idle: "border-[#b9d9ed] bg-[#eaf5fb] text-[#245879] hover:border-[#6fa6c8]" },
  Angrep: { emoji: "⚡", selected: "border-[#c44d24] bg-[#c44d24] text-white", idle: "border-[#f2c4ae] bg-[#fff0e8] text-[#a43d1c] hover:border-[#e18b64]" },
  Skuddferdigheter: { emoji: "🥅", selected: "border-[#a33d68] bg-[#a33d68] text-white", idle: "border-[#e7bfd0] bg-[#fceef4] text-[#873354] hover:border-[#ca7b9d]" },
  Målvakt: { emoji: "🧤", selected: "border-[#75539a] bg-[#75539a] text-white", idle: "border-[#d8c7ea] bg-[#f5effb] text-[#654686] hover:border-[#a98bc8]" },
  Fysisk: { emoji: "💪", selected: "border-[#357052] bg-[#357052] text-white", idle: "border-[#bedcc9] bg-[#edf7f0] text-[#2e6549] hover:border-[#80b594]" },
  Leker: { emoji: "🎯", selected: "border-[#a66b13] bg-[#a66b13] text-white", idle: "border-[#ead29f] bg-[#fff7dc] text-[#86550e] hover:border-[#cda955]" },
};

export function ExerciseCategoryFilter({ value, onChange }: { value: ExerciseCategory | null; onChange(category: ExerciseCategory | null): void }) {
  const options: Array<{ label: string; emoji: string; value: ExerciseCategory | null; selected: string; idle: string }> = [
    { label: "Alle", emoji: "✨", value: null, selected: "border-[var(--ink)] bg-[var(--ink)] text-white", idle: "border-[var(--line)] bg-white text-[var(--ink-soft)] hover:border-[var(--ink-soft)]" },
    ...EXERCISE_CATEGORIES.map((category) => ({ label: category, value: category, ...categoryPresentation[category] })),
  ];

  return <div className="flex gap-2 overflow-x-auto pb-1 thin-scrollbar" role="group" aria-label="Filtrer etter kategori">
    {options.map((option) => {
      const selected = option.value === value;
      return <button
        key={option.label}
        type="button"
        aria-pressed={selected}
        onClick={() => onChange(option.value)}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--orange)]",
          selected ? option.selected : option.idle,
        )}
      ><span aria-hidden="true">{option.emoji}</span>{option.label}</button>;
    })}
  </div>;
}
