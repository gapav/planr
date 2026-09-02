"use client";
/* eslint-disable @next/next/no-img-element -- exercise media comes from arbitrary coach-provided HTTPS URLs */

import { Play } from "lucide-react";
import { useState } from "react";
import type { Exercise, ExerciseCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

const categoryPlaceholder: Record<ExerciseCategory, { emoji: string; background: string }> = {
  Forsvar: { emoji: "🛡️", background: "bg-[#eaf5fb]" },
  Angrep: { emoji: "⚡", background: "bg-[#fff0e8]" },
  Skuddferdigheter: { emoji: "🥅", background: "bg-[#fceef4]" },
  Målvakt: { emoji: "🧤", background: "bg-[#f5effb]" },
  Fysisk: { emoji: "💪", background: "bg-[#edf7f0]" },
  Leker: { emoji: "🎯", background: "bg-[#fff7dc]" },
};

export function ExerciseThumbnail({ exercise, className }: { exercise: Exercise; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = exercise.thumbnailUrl === failedUrl;
  if (exercise.mediaKind === "video" && exercise.mediaUrl) return <div className={cn("relative overflow-hidden bg-[#dfe4df]", className)}><video src={exercise.mediaUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" /><span className="absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-white/90"><Play size={16} fill="currentColor" /></span></div>;
  if (failed || !exercise.thumbnailUrl) {
    const placeholder = categoryPlaceholder[exercise.category];
    return <div className={cn("grid place-items-center overflow-hidden", placeholder.background, className)}><span className="text-[clamp(2rem,7vw,5rem)] leading-none" role="img" aria-label={`${exercise.category} exercise`}>{placeholder.emoji}</span></div>;
  }
  return <div className={cn("relative overflow-hidden bg-[#dfe4df]", className)}><img src={exercise.thumbnailUrl} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" onError={() => setFailedUrl(exercise.thumbnailUrl)} /><span className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />{exercise.mediaKind && exercise.mediaKind !== "image" && <span className="absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-white/90"><Play size={16} fill="currentColor" /></span>}</div>;
}
