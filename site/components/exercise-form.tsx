"use client";

import { useState } from "react";
import { z } from "zod";
import { usePlannr } from "./app-provider";
import { Button, Field, inputClass, Modal, textareaClass } from "./ui";
import type { Exercise } from "@/lib/types";

const schema = z.object({ name: z.string().trim().min(3, "Use at least 3 characters"), description: z.string().trim().min(10, "Add a little more detail"), mediaUrl: z.url("Enter a valid image or video URL").refine((url) => url.startsWith("https://"), "Use a secure HTTPS URL") });

export function ExerciseForm({ open, exercise, onClose }: { open: boolean; exercise?: Exercise | null; onClose(): void }) {
  const { addExercise, updateExercise } = usePlannr();
  const [values, setValues] = useState(exercise ? { name: exercise.name, description: exercise.description, mediaUrl: exercise.mediaUrl } : { name: "", description: "", mediaUrl: "" });
  const [error, setError] = useState<string | null>(null); const [submitting, setSubmitting] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); const parsed = schema.safeParse(values); if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the form"); return; }
    setSubmitting(true); setError(null);
    try { if (exercise) await updateExercise(exercise.id, parsed.data); else await addExercise(parsed.data); onClose(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save the exercise"); }
    finally { setSubmitting(false); }
  }
  return <Modal open={open} onClose={onClose} title={exercise ? "Edit exercise" : "Share an exercise"} description="Exercises are shared with the whole coaching community, not just one team.">
    <form className="grid gap-5" onSubmit={submit}>
      <Field label="Exercise name"><input className={inputClass} value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} placeholder="e.g. Three-lane transition" autoFocus /></Field>
      <Field label="Description" hint="Explain the setup, flow and most important coaching points."><textarea className={textareaClass} value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} placeholder="Players work in three lanes..." /></Field>
      <Field label="Image or video URL" hint="HTTPS images, YouTube, Vimeo and direct video links are supported."><input className={inputClass} type="url" value={values.mediaUrl} onChange={(event) => setValues({ ...values, mediaUrl: event.target.value })} placeholder="https://..." /></Field>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-[var(--danger)]">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={submitting}>{submitting ? "Saving…" : exercise ? "Save changes" : "Add to library"}</Button></div>
    </form>
  </Modal>;
}
