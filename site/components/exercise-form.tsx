"use client";

import { useState } from "react";
import { z } from "zod";
import { useGrep } from "./app-provider";
import { Button, Field, inputClass, Modal, textareaClass } from "./ui";
import { validateExerciseMediaUpload } from "@/lib/media";
import { EXERCISE_CATEGORIES, type Exercise } from "@/lib/types";

const schema = z.object({ name: z.string().trim().min(3, "Bruk minst 3 tegn"), category: z.enum(EXERCISE_CATEGORIES), description: z.string().trim().min(10, "Legg til litt mer informasjon"), mediaUrl: z.string().trim().refine((url) => !url || (z.url().safeParse(url).success && url.startsWith("https://")), "Skriv inn en gyldig og sikker HTTPS-lenke til et bilde eller en video").transform((url) => url || null) });

export function ExerciseForm({ open, exercise, onClose }: { open: boolean; exercise?: Exercise | null; onClose(): void }) {
  const { addExercise, updateExercise, uploadExerciseMedia, discardExerciseMedia } = useGrep();
  const [values, setValues] = useState(exercise ? { name: exercise.name, category: exercise.category, description: exercise.description, mediaUrl: exercise.mediaUrl ?? "" } : { name: "", category: EXERCISE_CATEGORIES[0], description: "", mediaUrl: "" });
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null); const [submitting, setSubmitting] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); const parsed = schema.safeParse(mediaFile ? { ...values, mediaUrl: "" } : values); if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Kontroller skjemaet"); return; }
    setSubmitting(true); setError(null);
    let uploadedUrl: string | null = null;
    try {
      if (mediaFile) { validateExerciseMediaUpload(mediaFile); uploadedUrl = await uploadExerciseMedia(mediaFile); }
      const input = uploadedUrl ? { ...parsed.data, mediaUrl: uploadedUrl } : parsed.data;
      if (exercise) await updateExercise(exercise.id, input); else await addExercise(input);
      onClose();
    }
    catch (caught) {
      if (uploadedUrl) await discardExerciseMedia(uploadedUrl).catch(() => undefined);
      setError(caught instanceof Error ? caught.message : "Øvelsen kunne ikke lagres");
    }
    finally { setSubmitting(false); }
  }
  return <Modal open={open} onClose={onClose} title={exercise ? "Rediger øvelse" : "Del en øvelse"} description="Øvelser deles med hele trenerfellesskapet, ikke bare ett lag.">
    <form className="grid gap-5" onSubmit={submit}>
      <Field label="Navn på øvelsen"><input className={inputClass} value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} placeholder="f.eks. Tre rekker i kontring" autoFocus /></Field>
      <Field label="Kategori"><select className={`${inputClass} appearance-none`} value={values.category} onChange={(event) => setValues({ ...values, category: event.target.value as Exercise["category"] })}>{EXERCISE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></Field>
      <Field label="Beskrivelse" hint="Forklar organiseringen, gjennomføringen og de viktigste trenermomentene."><textarea className={textareaClass} value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} placeholder="Spillerne jobber i tre rekker …" /></Field>
      <Field label="Lenke til bilde eller video (valgfritt)" hint="HTTPS-bilder, YouTube, Vimeo og direkte videolenker støttes."><input className={inputClass} type="url" value={values.mediaUrl} onChange={(event) => setValues({ ...values, mediaUrl: event.target.value })} placeholder="https://..." /></Field>
      <div className="relative flex items-center"><span className="h-px flex-1 bg-[var(--line)]" /><span className="px-3 text-xs font-bold uppercase tracking-[.1em] text-[var(--ink-soft)]">eller</span><span className="h-px flex-1 bg-[var(--line)]" /></div>
      <Field label="Last opp et bilde eller en MP4-video" hint="JPG, PNG, WebP og MP4 støttes. Maksimal filstørrelse er 5 MB. Den opplastede filen erstatter lenken ovenfor."><input className={`${inputClass} cursor-pointer py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--paper-deep)] file:px-3 file:py-1.5 file:text-xs file:font-bold`} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,.jpg,.jpeg,.png,.webp,.mp4" onChange={(event) => { const file = event.target.files?.[0] ?? null; if (!file) { setMediaFile(null); return; } try { validateExerciseMediaUpload(file); setMediaFile(file); setValues({ ...values, mediaUrl: "" }); setError(null); } catch (caught) { event.target.value = ""; setMediaFile(null); setError(caught instanceof Error ? caught.message : "Velg et gyldig bilde eller en MP4-video"); } }} /></Field>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-[var(--danger)]">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Avbryt</Button><Button type="submit" disabled={submitting}>{submitting ? "Lagrer…" : exercise ? "Lagre endringer" : "Legg til i øvelsesbanken"}</Button></div>
    </form>
  </Modal>;
}
