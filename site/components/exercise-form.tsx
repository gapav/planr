"use client";

import { useState } from "react";
import { z } from "zod";
import { Link2 as LinkIcon, ShieldCheck, Upload } from "lucide-react";
import { useGrep } from "./app-provider";
import { HelpHint } from "./help-tip";
import { Button, Field, inputClass, Modal, textareaClass } from "./ui";
import { validateExerciseMediaUpload } from "@/lib/media";
import { ExerciseAgeGroupPicker } from "./exercise-age-group-filter";
import { EXERCISE_AGE_GROUPS, EXERCISE_CATEGORIES, type Exercise, type ExerciseAgeGroup } from "@/lib/types";

const schema = z.object({ name: z.string().trim().min(3, "Bruk minst 3 tegn"), category: z.enum(EXERCISE_CATEGORIES), ageGroups: z.array(z.enum(EXERCISE_AGE_GROUPS)), description: z.string().trim().min(10, "Legg til litt mer informasjon"), mediaUrl: z.string().trim().refine((url) => !url || (z.url().safeParse(url).success && url.startsWith("https://")), "Skriv inn en gyldig og sikker HTTPS-lenke til et bilde eller en video").transform((url) => url || null) });

export function ExerciseForm({ open, exercise, onClose }: { open: boolean; exercise?: Exercise | null; onClose(): void }) {
  const { addExercise, updateExercise, uploadExerciseMedia, discardExerciseMedia } = useGrep();
  const [values, setValues] = useState<{ name: string; category: Exercise["category"]; ageGroups: ExerciseAgeGroup[]; description: string; mediaUrl: string }>(
    exercise ? { name: exercise.name, category: exercise.category, ageGroups: exercise.ageGroups, description: exercise.description, mediaUrl: exercise.mediaUrl ?? "" }
      : { name: "", category: EXERCISE_CATEGORIES[0], ageGroups: [], description: "", mediaUrl: "" });
  // A link and an upload are mutually exclusive, and an exercise that already
  // carries one opens on the tab that holds it.
  const [source, setSource] = useState<"link" | "upload">("link");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null); const [submitting, setSubmitting] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); const parsed = schema.safeParse({ ...values, mediaUrl: source === "link" ? values.mediaUrl : "" }); if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Kontroller skjemaet"); return; }
    setSubmitting(true); setError(null);
    let uploadedUrl: string | null = null;
    try {
      if (source === "upload" && mediaFile) { validateExerciseMediaUpload(mediaFile); uploadedUrl = await uploadExerciseMedia(mediaFile); }
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
      {/* Not a <Field>: its wrapping <label> forwards a click to the first
          labelable descendant, so clicking the second chip would toggle it and
          "6-9" both. The picker carries its own group label instead. */}
      <div className="grid min-w-0 gap-2 text-sm font-semibold"><span>Aldersgrupper</span><ExerciseAgeGroupPicker value={values.ageGroups} onChange={(ageGroups) => setValues({ ...values, ageGroups })} /><span className="text-xs font-normal text-[var(--ink-soft)]">Velg alle gruppene øvelsen passer for. Uten en gruppe vises øvelsen bare under «Alle aldre».</span></div>
      <Field label="Beskrivelse" hint="Forklar organiseringen, gjennomføringen og de viktigste trenermomentene."><textarea className={textareaClass} value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} placeholder="Spillerne jobber i tre rekker …" /></Field>
      {/* Link and upload were two independent fields, so nothing on screen said
          they were one choice — a coach could fill both, and the upload would
          quietly win. A segmented control makes the either/or the first thing
          decided, and carries the recommendation we actually have: an embed
          keeps the video credited to whoever made it. Only the chosen source is
          submitted, so the hidden one survives a stray click without leaking
          into the saved exercise. */}
      <div className="grid min-w-0 gap-2.5 text-sm font-semibold">
        <span className="flex items-center gap-1.5">Bilde eller video <span className="font-normal text-[var(--ink-soft)]">(valgfritt)</span><HelpHint topic="media-link" /></span>
        <div className="grep-segments" role="group" aria-label="Velg hvordan du legger ved bilde eller video">
          <button type="button" className="flex-1" aria-pressed={source === "link"} onClick={() => { setSource("link"); setMediaFile(null); setError(null); }}><LinkIcon size={15} />Lim inn lenke<span>Anbefalt</span></button>
          <button type="button" className="flex-1" aria-pressed={source === "upload"} onClick={() => { setSource("upload"); setError(null); }}><Upload size={15} />Last opp fil</button>
        </div>
        {/* Keyed so React unmounts one input and mounts the other: both
            branches put an <input> in the same slot, and without a key the
            controlled url field is reused as the uncontrolled file field. */}
        {source === "link"
          ? <><input key="link" id="exercise-media-url" aria-label="Lenke til bilde eller video" className={inputClass} type="url" value={values.mediaUrl} onChange={(event) => setValues({ ...values, mediaUrl: event.target.value })} placeholder="https://..." /><span className="text-xs font-normal text-[var(--ink-soft)]">HTTPS-bilder, YouTube, Vimeo og direkte videolenker støttes. Videoen blir stående hos den som har laget den.</span></>
          : <><input key="upload" aria-label="Last opp et bilde eller en MP4-video" className={`${inputClass} cursor-pointer py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--paper-deep)] file:px-3 file:py-1.5 file:text-xs file:font-bold`} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,.jpg,.jpeg,.png,.webp,.mp4" onChange={(event) => { const file = event.target.files?.[0] ?? null; if (!file) { setMediaFile(null); return; } try { validateExerciseMediaUpload(file); setMediaFile(file); setError(null); } catch (caught) { event.target.value = ""; setMediaFile(null); setError(caught instanceof Error ? caught.message : "Velg et gyldig bilde eller en MP4-video"); } }} /><span className="text-xs font-normal text-[var(--ink-soft)]">JPG, PNG, WebP og MP4 støttes. Maksimal filstørrelse er 5 MB.</span>
            {/* The upload leaves the coach's own phone and becomes part of a
                library every trener can open, so the rights question is asked
                where the file is chosen rather than buried in the terms. */}
            <p className="mt-0.5 flex items-start gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-xs font-normal leading-5 text-[var(--ink-soft)]"><ShieldCheck size={15} className="mt-px shrink-0 text-[var(--ink)]" aria-hidden /><span><strong className="font-bold text-[var(--ink)]">Husk!</strong> Last bare opp bilder og video du har laget selv eller har lov til å dele. Filen blir synlig for alle trenere i Grep.</span></p></>}
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-[var(--danger)]">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Avbryt</Button><Button type="submit" disabled={submitting}>{submitting ? "Lagrer…" : exercise ? "Lagre endringer" : "Legg til i øvelsesbanken"}</Button></div>
    </form>
  </Modal>;
}
