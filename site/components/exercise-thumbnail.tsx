"use client";
/* eslint-disable @next/next/no-img-element -- exercise media comes from arbitrary coach-provided HTTPS URLs */

import { BookOpen, ClipboardList, type LucideIcon, Play, Sparkles } from "lucide-react";
import { useState } from "react";
import { useGrep } from "@/components/app-provider";
import { categoryPresentation } from "@/components/exercise-category-filter";
import type { Exercise, ExerciseCategory, SessionItem } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The icon and the tag tone come from the filter chips so a category reads the same everywhere; only the placeholder's own colours live here, one wash of the same hue its tag wears. */
const categoryPlaceholder: Record<ExerciseCategory, { background: string; tint: string }> = {
  Forsvar: { background: "bg-[#eaf5fb]", tint: "text-[#7aa8c4]" },
  Angrep: { background: "bg-[#fff0e8]", tint: "text-[#dd9270]" },
  Skuddferdigheter: { background: "bg-[#fceef4]", tint: "text-[#d08faa]" },
  Målvakt: { background: "bg-[#e8f5f2]", tint: "text-[#79b3ab]" },
  Fysisk: { background: "bg-[#edf7f0]", tint: "text-[#88b89b]" },
  Leker: { background: "bg-[#fff7dc]", tint: "text-[#cdac60]" },
};
const genericPlaceholder = { background: "bg-[var(--paper-deep)]", tint: "text-[var(--ink-soft)]" };

/** Session items copy an exercise's media without its category, so category is optional here. */
export type ThumbnailSubject = Pick<Exercise, "mediaUrl" | "mediaKind" | "thumbnailUrl"> & { category?: ExerciseCategory | null };

export function ExerciseThumbnail({ exercise, className, iconClassName }: { exercise: ThumbnailSubject; className?: string; iconClassName?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = exercise.thumbnailUrl === failedUrl;
  if (exercise.mediaKind === "video" && exercise.mediaUrl) return <div className={cn("relative overflow-hidden bg-[#dfe4df]", className)}><video src={exercise.mediaUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" /><span className="absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-white/90"><Play size={16} fill="currentColor" /></span></div>;
  if (failed || !exercise.thumbnailUrl) {
    return <ThumbnailPlaceholder category={exercise.category ?? null} className={className} iconClassName={iconClassName} />;
  }
  return <div className={cn("relative overflow-hidden bg-[#dfe4df]", className)}><img src={exercise.thumbnailUrl} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" onError={() => setFailedUrl(exercise.thumbnailUrl)} /><span className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />{exercise.mediaKind && exercise.mediaKind !== "image" && <span className="absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-white/90"><Play size={16} fill="currentColor" /></span>}</div>;
}

/** The wash and icon a thumbnail shows when there is no picture to show. */
export function ThumbnailPlaceholder({ category, fallbackIcon = ClipboardList, className, iconClassName = "h-[clamp(1.75rem,6vw,4rem)] w-[clamp(1.75rem,6vw,4rem)]" }: {
  category: ExerciseCategory | null; fallbackIcon?: LucideIcon; className?: string; iconClassName?: string;
}) {
  const placeholder = category ? categoryPlaceholder[category] : genericPlaceholder;
  const Icon: LucideIcon = category ? categoryPresentation[category].icon : fallbackIcon;
  return <div className={cn("grid place-items-center overflow-hidden", placeholder.background, className)} role="img" aria-label={category ? `${category}-øvelse` : "Aktivitet"}><Icon className={cn(iconClassName, placeholder.tint)} strokeWidth={1.5} aria-hidden="true" /></div>;
}

/**
 * Session and warm-up items copy an exercise's media but not its category, so
 * the category is read from the library at render time. A custom activity, or
 * one whose exercise has been archived or deleted, has none.
 */
export function linkedCategory(item: Pick<SessionItem, "kind" | "exerciseId">, exercises: readonly Pick<Exercise, "id" | "category">[]): ExerciseCategory | null {
  if (item.kind !== "exercise" || !item.exerciseId) return null;
  return exercises.find((exercise) => exercise.id === item.exerciseId)?.category ?? null;
}

/** The small square an item card shows in place of a missing picture. */
export function ItemThumbnailPlaceholder({ item }: { item: Pick<SessionItem, "kind" | "exerciseId"> }) {
  const { exercises } = useGrep();
  const category = linkedCategory(item, exercises);
  return <ThumbnailPlaceholder category={category} fallbackIcon={item.kind === "exercise" ? BookOpen : Sparkles} className="h-full w-full" iconClassName="h-[18px] w-[18px]" />;
}
