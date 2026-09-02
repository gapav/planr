"use client";

import { useState } from "react";
import { z } from "zod";
import { useGrep } from "./app-provider";
import { Button, Field, inputClass, Modal, textareaClass } from "./ui";
import { validateExerciseVideo } from "@/lib/media";
import { EXERCISE_CATEGORIES, type Exercise } from "@/lib/types";

const schema = z.object({ name: z.string().trim().min(3, "Use at least 3 characters"), category: z.enum(EXERCISE_CATEGORIES), description: z.string().trim().min(10, "Add a little more detail"), mediaUrl: z.string().trim().refine((url) => !url || (z.url().safeParse(url).success && url.startsWith("https://")), "Enter a valid secure HTTPS image or video URL").transform((url) => url || null) });

export function ExerciseForm({ open, exercise, onClose }: { open: boolean; exercise?: Exercise | null; onClose(): void }) {
  const { addExercise, updateExercise, uploadExerciseVideo, discardExerciseVideo } = useGrep();
  const [values, setValues] = useState(exercise ? { name: exercise.name, category: exercise.category, description: exercise.description, mediaUrl: exercise.mediaUrl ?? "" } : { name: "", category: EXERCISE_CATEGORIES[0], description: "", mediaUrl: "" });
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null); const [submitting, setSubmitting] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); const parsed = schema.safeParse(videoFile ? { ...values, mediaUrl: "" } : values); if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the form"); return; }
    setSubmitting(true); setError(null);
    let uploadedUrl: string | null = null;
    try {
      if (videoFile) { validateExerciseVideo(videoFile); uploadedUrl = await uploadExerciseVideo(videoFile); }
      const input = uploadedUrl ? { ...parsed.data, mediaUrl: uploadedUrl } : parsed.data;
      if (exercise) await updateExercise(exercise.id, input); else await addExercise(input);
      onClose();
    }
    catch (caught) {
      if (uploadedUrl) await discardExerciseVideo(uploadedUrl).catch(() => undefined);
      setError(caught instanceof Error ? caught.message : "Could not save the exercise");
    }
    finally { setSubmitting(false); }
  }
  return <Modal open={open} onClose={onClose} title={exercise ? "Edit exercise" : "Share an exercise"} description="Exercises are shared with the whole coaching community, not just one team.">
    <form className="grid gap-5" onSubmit={submit}>
      <Field label="Exercise name"><input className={inputClass} value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} placeholder="e.g. Three-lane transition" autoFocus /></Field>
      <Field label="Kategori"><select className={`${inputClass} appearance-none`} value={values.category} onChange={(event) => setValues({ ...values, category: event.target.value as Exercise["category"] })}>{EXERCISE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></Field>
      <Field label="Description" hint="Explain the setup, flow and most important coaching points."><textarea className={textareaClass} value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} placeholder="Players work in three lanes..." /></Field>
      <Field label="Image or video URL (optional)" hint="HTTPS images, YouTube, Vimeo and direct video links are supported."><input className={inputClass} type="url" value={values.mediaUrl} onChange={(event) => setValues({ ...values, mediaUrl: event.target.value })} placeholder="https://..." /></Field>
      <div className="relative flex items-center"><span className="h-px flex-1 bg-[var(--line)]" /><span className="px-3 text-xs font-bold uppercase tracking-[.1em] text-[var(--ink-soft)]">or</span><span className="h-px flex-1 bg-[var(--line)]" /></div>
      <Field label="Upload an MP4 video" hint="Maximum file size: 5 MB. The uploaded video replaces the URL above."><input className={`${inputClass} cursor-pointer py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--paper-deep)] file:px-3 file:py-1.5 file:text-xs file:font-bold`} type="file" accept="video/mp4,.mp4" onChange={(event) => { const file = event.target.files?.[0] ?? null; if (!file) { setVideoFile(null); return; } try { validateExerciseVideo(file); setVideoFile(file); setValues({ ...values, mediaUrl: "" }); setError(null); } catch (caught) { event.target.value = ""; setVideoFile(null); setError(caught instanceof Error ? caught.message : "Choose a valid MP4 video"); } }} /></Field>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-[var(--danger)]">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={submitting}>{submitting ? "Saving…" : exercise ? "Save changes" : "Add to library"}</Button></div>
    </form>
  </Modal>;
}
