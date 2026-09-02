"use client";
/* eslint-disable @next/next/no-img-element -- exercise media comes from arbitrary coach-provided HTTPS URLs */

import { Play } from "lucide-react";
import { useState } from "react";
import { ExerciseThumbnail } from "./exercise-thumbnail";
import { Modal, Tag } from "./ui";
import { getExerciseEmbedUrl, parseExerciseMedia } from "@/lib/media";
import type { Exercise } from "@/lib/types";

function withAutoplay(embedUrl: string) {
  const url = new URL(embedUrl);
  url.searchParams.set("autoplay", "1");
  return url.toString();
}

export function ExerciseDetail({ exercise, onClose }: { exercise: Exercise | null; onClose(): void }) {
  const [playing, setPlaying] = useState(false);
  if (!exercise) return null;

  let mediaKind: ReturnType<typeof parseExerciseMedia>["kind"] | null = null;
  let embedUrl: string | null = null;
  if (exercise.mediaUrl) {
    try {
      mediaKind = parseExerciseMedia(exercise.mediaUrl).kind;
      embedUrl = getExerciseEmbedUrl(exercise.mediaUrl);
    } catch {
      mediaKind = null;
    }
  }
  const hasMedia = Boolean(exercise.mediaUrl && mediaKind);

  function close() { setPlaying(false); onClose(); }

  return <Modal open size="lg" title={exercise.name} onClose={close}>
    <div className="grid gap-5">
      {playing && exercise.mediaUrl && embedUrl ? <div className="aspect-video overflow-hidden rounded-[20px] bg-black"><iframe src={withAutoplay(embedUrl)} title={`${exercise.name} video`} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div>
        : playing && exercise.mediaUrl && mediaKind === "video" ? <video src={exercise.mediaUrl} controls autoPlay playsInline preload="metadata" className="aspect-video w-full rounded-[20px] bg-black object-contain" />
        : playing && exercise.mediaUrl && mediaKind === "image" ? <img src={exercise.mediaUrl} alt={exercise.name} className="max-h-[60vh] w-full rounded-[20px] bg-[var(--paper)] object-contain" />
        : hasMedia ? <button type="button" onClick={() => setPlaying(true)} className="group relative block w-full overflow-hidden rounded-[20px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--orange)]" aria-label={mediaKind === "image" ? `Vis bildet for ${exercise.name}` : `Spill av videoen for ${exercise.name}`}>
            <ExerciseThumbnail exercise={exercise} className="aspect-[16/9] w-full" />
            <span className="absolute inset-0 grid place-items-center bg-black/15 transition group-hover:bg-black/25"><span className="grid h-14 w-14 place-items-center rounded-full bg-white/90 shadow-lg">{mediaKind === "image" ? <span className="text-lg">🔍</span> : <Play size={22} fill="currentColor" />}</span></span>
          </button>
        : <ExerciseThumbnail exercise={exercise} className="aspect-[16/9] w-full overflow-hidden rounded-[20px]" />}

      <div className="flex flex-wrap items-center gap-2">
        <Tag tone="orange">{exercise.category}</Tag>
        {exercise.mediaKind ? <Tag tone={exercise.mediaKind === "image" ? "green" : "blue"}>{exercise.mediaKind === "image" ? "Bilde" : "Video"}</Tag> : <Tag tone="green">Uten medier</Tag>}
        <span className="text-xs font-semibold text-[var(--ink-soft)]">av {exercise.createdByName}</span>
      </div>

      <section><p className="text-xs font-black uppercase tracking-[.12em] text-[var(--orange)]">Beskrivelse</p><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[var(--ink-soft)]">{exercise.description}</p></section>

      {exercise.mediaUrl && <a href={exercise.mediaUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-[var(--orange)] underline underline-offset-4">Åpne mediet i ny fane</a>}
    </div>
  </Modal>;
}
