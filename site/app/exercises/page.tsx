"use client";

import { ArrowUpRight, BookOpen, MoreHorizontal, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useGrep } from "@/components/app-provider";
import { ExerciseCategoryFilter } from "@/components/exercise-category-filter";
import { HelpTip } from "@/components/help-tip";
import { ExerciseDetail } from "@/components/exercise-detail";
import { ExerciseForm } from "@/components/exercise-form";
import { ExerciseThumbnail } from "@/components/exercise-thumbnail";
import { Button, EmptyState, Tag, inputClass } from "@/components/ui";
import { filterExercises } from "@/lib/exercises";
import type { Exercise, ExerciseCategory } from "@/lib/types";

export default function ExercisesPage() {
  const { exercises, user, archiveExercise } = useGrep(); const [query, setQuery] = useState(""); const [category, setCategory] = useState<ExerciseCategory | null>(null); const [formOpen, setFormOpen] = useState(false); const [editing, setEditing] = useState<Exercise | null>(null); const [menuId, setMenuId] = useState<string | null>(null); const [viewing, setViewing] = useState<Exercise | null>(null);
  const filtered = useMemo(() => filterExercises(exercises, query, category), [exercises, query, category]);
  function openEdit(exercise: Exercise) { setEditing(exercise); setFormOpen(true); setMenuId(null); setViewing(null); }
  return <AppShell publicPage><div className="mx-auto max-w-[1440px] px-4 pb-16 pt-9 sm:px-7 sm:pt-14">
    <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end"><div><div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--mint)] px-3 py-1.5 text-xs font-black uppercase tracking-[.12em]"><BookOpen size={14} />Laget av trenere</div><h1 className="max-w-3xl text-4xl font-black tracking-[-.055em] sm:text-6xl">Finn øvelser.<br /><span className="text-[var(--orange)]">Lag bedre økter.</span></h1><p className="mt-5 max-w-2xl text-base leading-7 text-[var(--ink-soft)] sm:text-lg"> Søk og finn de riktige øvelsene til lagets neste økt.</p></div><div className="flex shrink-0 items-center gap-2">{user ? <Button size="lg" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={19} />Legg til øvelse</Button> : <a href="/sign-in?next=/exercises" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--orange)] px-5 font-bold text-white">Logg inn for å bidra</a>}<HelpTip topic="exercises-library" /></div></div>
    <div className="mt-10 grid gap-4 border-y border-[var(--line)] py-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="relative w-full sm:max-w-lg"><Search className="absolute left-3.5 top-3.5 text-[var(--ink-soft)]" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} className={`${inputClass} pl-10`} placeholder="Søk etter øvelser, ferdigheter eller trenermomenter …" aria-label="Søk etter øvelser" /></div><p className="text-sm font-semibold text-[var(--ink-soft)]">{filtered.length} tilgjengelige øvelser</p></div><ExerciseCategoryFilter value={category} onChange={setCategory} /></div>
    {filtered.length ? <div className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{filtered.map((exercise, index) => { const canEdit = user && (user.id === exercise.createdBy || user.isGlobalAdmin); return <article key={exercise.id} className="group relative overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_8px_30px_rgba(16,32,29,.045)] transition hover:-translate-y-1 hover:shadow-[var(--shadow)] soft-in" style={{ animationDelay: `${Math.min(index * 35, 180)}ms` }}>
      <button type="button" onClick={() => setViewing(exercise)} className="absolute inset-0 z-0 rounded-[24px] focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[var(--orange)]" aria-label={`Vis detaljer for ${exercise.name}`} />
      <div className="pointer-events-none relative">
        <ExerciseThumbnail exercise={exercise} className="aspect-[16/9] w-full" />
        <div className="p-5"><div className="flex items-start justify-between gap-3"><div><Tag tone="orange">{exercise.category}</Tag><h2 className="mt-3 text-xl font-black tracking-[-.035em]">{exercise.name}</h2></div>{canEdit && <div className="pointer-events-auto relative"><Button variant="ghost" size="sm" className="-mr-2 -mt-2 px-2" aria-label={`Valg for ${exercise.name}`} onClick={() => setMenuId(menuId === exercise.id ? null : exercise.id)}><MoreHorizontal size={19} /></Button>{menuId === exercise.id && <div className="absolute right-0 z-10 w-36 rounded-xl border border-[var(--line)] bg-white p-1.5 text-sm font-semibold shadow-xl"><button className="w-full rounded-lg px-3 py-2 text-left hover:bg-black/5" onClick={() => openEdit(exercise)}>Rediger</button><button className="w-full rounded-lg px-3 py-2 text-left text-[var(--danger)] hover:bg-red-50" onClick={() => { if (confirm("Vil du arkivere denne øvelsen? Eksisterende økter beholder sin kopi.")) void archiveExercise(exercise.id); }}>Arkiver</button></div>}</div>}</div><p className="clamp-2 mt-2 min-h-12 text-sm leading-6 text-[var(--ink-soft)]">{exercise.description}</p><div className="mt-5 flex items-center justify-between gap-3">{exercise.mediaKind ? <Tag tone={exercise.mediaKind === "image" ? "green" : "blue"}>{exercise.mediaKind === "image" ? "Bilde" : "Video"}</Tag> : <Tag tone="green">Uten medier</Tag>}<span className="flex items-center gap-1 text-xs font-semibold text-[var(--ink-soft)]">av {exercise.createdByName}<ArrowUpRight size={13} /></span></div></div>
      </div>
    </article>; })}</div> : <div className="mt-7"><EmptyState icon={<Search size={22} />} title="Fant ingen øvelser" body="Prøv en annen kategori, et bredere søkeord eller nullstill filtrene." action={<Button variant="secondary" onClick={() => { setQuery(""); setCategory(null); }}>Nullstill filtre</Button>} /></div>}
    <ExerciseDetail key={viewing?.id ?? "none"} exercise={viewing} onClose={() => setViewing(null)} />
    <ExerciseForm key={`${editing?.id ?? "new"}-${formOpen ? "open" : "closed"}`} open={formOpen} exercise={editing} onClose={() => { setFormOpen(false); setEditing(null); }} />
  </div></AppShell>;
}
