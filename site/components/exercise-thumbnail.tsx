"use client";
/* eslint-disable @next/next/no-img-element -- exercise media comes from arbitrary coach-provided HTTPS URLs */

import { ClipboardList, type LucideIcon, Play } from "lucide-react";
import { useState } from "react";
import { categoryPresentation } from "@/components/exercise-category-filter";
import type { Exercise, ExerciseCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The icon comes from the filter chips so a category reads the same everywhere; only the placeholder's own colours live here. */
const categoryPlaceholder: Record<ExerciseCategory, { background: string; tint: string }> = {
  Forsvar: { background: "bg-[#eaf5fb]", tint: "text-[#7aa8c4]" },
  Angrep: { background: "bg-[#fff0e8]", tint: "text-[#dd9270]" },
  Skuddferdigheter: { background: "bg-[#fceef4]", tint: "text-[#d08faa]" },
  Målvakt: { background: "bg-[#f5effb]", tint: "text-[#ac93c9]" },
  Fysisk: { background: "bg-[#edf7f0]", tint: "text-[#88b89b]" },
  Leker: { background: "bg-[#fff7dc]", tint: "text-[#cdac60]" },
};
const genericPlaceholder = { background: "bg-[var(--paper-deep)]", tint: "text-[var(--ink-soft)]" };

/** Session items copy an exercise's media without its category, so category is optional here. */
export type ThumbnailSubject = Pick<Exercise, "mediaUrl" | "mediaKind" | "thumbnailUrl"> & { category?: ExerciseCategory | null };

export function ExerciseThumbnail({ exercise, className }: { exercise: ThumbnailSubject; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = exercise.thumbnailUrl === failedUrl;
  if (exercise.mediaKind === "video" && exercise.mediaUrl) return <div className={cn("relative overflow-hidden bg-[#dfe4df]", className)}><video src={exercise.mediaUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" /><span className="absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-white/90"><Play size={16} fill="currentColor" /></span></div>;
  if (failed || !exercise.thumbnailUrl) {
    const placeholder = exercise.category ? categoryPlaceholder[exercise.category] : genericPlaceholder;
    const Icon: LucideIcon = exercise.category ? categoryPresentation[exercise.category].icon : ClipboardList;
    return <div className={cn("grid place-items-center overflow-hidden", placeholder.background, className)} role="img" aria-label={exercise.category ? `${exercise.category}-øvelse` : "Aktivitet"}><Icon className={cn("h-[clamp(1.75rem,6vw,4rem)] w-[clamp(1.75rem,6vw,4rem)]", placeholder.tint)} strokeWidth={1.5} aria-hidden="true" /></div>;
  }
  return <div className={cn("relative overflow-hidden bg-[#dfe4df]", className)}><img src={exercise.thumbnailUrl} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" onError={() => setFailedUrl(exercise.thumbnailUrl)} /><span className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />{exercise.mediaKind && exercise.mediaKind !== "image" && <span className="absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-white/90"><Play size={16} fill="currentColor" /></span>}</div>;
}
