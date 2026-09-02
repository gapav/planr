"use client";
/* eslint-disable @next/next/no-img-element -- exercise media comes from arbitrary coach-provided HTTPS URLs */

import { ImageOff, Play } from "lucide-react";
import { useState } from "react";
import type { Exercise } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ExerciseThumbnail({ exercise, className }: { exercise: Exercise; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (exercise.mediaKind === "video" && exercise.mediaUrl) return <div className={cn("relative overflow-hidden bg-[#dfe4df]", className)}><video src={exercise.mediaUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" /><span className="absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-white/90"><Play size={16} fill="currentColor" /></span></div>;
  if (failed || !exercise.thumbnailUrl) return <div className={cn("grid place-items-center bg-gradient-to-br from-[#d8e5dd] to-[#d9e4ed] text-[var(--ink-soft)]", className)}><ImageOff size={24} /><span className="sr-only">Media preview unavailable</span></div>;
  return <div className={cn("relative overflow-hidden bg-[#dfe4df]", className)}><img src={exercise.thumbnailUrl} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" onError={() => setFailed(true)} /><span className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />{exercise.mediaKind && exercise.mediaKind !== "image" && <span className="absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-white/90"><Play size={16} fill="currentColor" /></span>}</div>;
}
