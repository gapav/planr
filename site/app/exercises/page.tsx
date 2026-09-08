"use client";

import { ArrowUpRight, BookOpen, Heart, MoreHorizontal, Plus, Search, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useGrep } from "@/components/app-provider";
import { ExerciseAgeGroupFilter } from "@/components/exercise-age-group-filter";
import { ExerciseCategoryFilter } from "@/components/exercise-category-filter";
import { HelpTip } from "@/components/help-tip";
import { ExerciseDetail } from "@/components/exercise-detail";
import { ExerciseForm } from "@/components/exercise-form";
import { ExerciseThumbnail } from "@/components/exercise-thumbnail";
import { Button, EmptyState, Tag, inputClass } from "@/components/ui";
import { canEditExercise, countExerciseFacets, emptyExerciseFilterState, filterExercises, formatAgeGroup, hasActiveExerciseFilter, parseExerciseFilterParams, serializeExerciseFilterParams, type ExerciseFilter, type ExerciseFilterState } from "@/lib/exercises";
import type { Exercise } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * `useSearchParams` opts the tree below it out of prerendering, so the library
 * sits behind its own boundary and the shell above still ships as static HTML.
 */
export default function ExercisesPage() {
  return <AppShell publicPage>
    <Suspense fallback={<div className="mx-auto min-h-[70vh] max-w-[1440px] px-4 pt-9 sm:px-7 sm:pt-14" />}>
      <ExerciseLibrary />
    </Suspense>
  </AppShell>;
}

function ExerciseLibrary() {
  const searchParams = useSearchParams();
  const { exercises, user, archiveExercise, favoriteExerciseIds, toggleFavoriteExercise } = useGrep();
  // The query string seeds the filters once and is written back from them
  // afterwards; it is not the running source of truth, because routing every
  // keystroke through the router made typing feel like it was fighting back.
  const [filters, setFilters] = useState<ExerciseFilterState>(() => parseExerciseFilterParams(new URLSearchParams(searchParams.toString())));
  const [formOpen, setFormOpen] = useState(false); const [editing, setEditing] = useState<Exercise | null>(null); const [menuId, setMenuId] = useState<string | null>(null); const [viewing, setViewing] = useState<Exercise | null>(null);

  const favorites = useMemo(() => new Set(favoriteExerciseIds), [favoriteExerciseIds]);
  const activeFilter = useMemo<ExerciseFilter>(() => ({ query: filters.query, categories: filters.categories, ageGroups: filters.ageGroups, favoriteIds: filters.favoritesOnly ? favorites : null }), [filters, favorites]);
  const filtered = useMemo(() => filterExercises(exercises, activeFilter), [exercises, activeFilter]);
  const counts = useMemo(() => countExerciseFacets(exercises, activeFilter), [exercises, activeFilter]);
  const filtering = hasActiveExerciseFilter(filters);

  // `replaceState` keeps the router in sync without a navigation, so a filtered
  // library is linkable and survives a reload while the back button still leaves
  // the page rather than replaying every chip the coach touched on the way here.
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = serializeExerciseFilterParams(filters).toString();
      window.history.replaceState(null, "", params ? `?${params}` : window.location.pathname);
    }, 250);
    return () => clearTimeout(timer);
  }, [filters]);

  function patch(next: Partial<ExerciseFilterState>) { setFilters((current) => ({ ...current, ...next })); }
  function openEdit(exercise: Exercise) { setEditing(exercise); setFormOpen(true); setMenuId(null); setViewing(null); }
  function resetFilters() { setFilters(emptyExerciseFilterState()); }

  return <div className="mx-auto max-w-[1440px] px-4 pb-16 pt-9 sm:px-7 sm:pt-14">
    <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end"><div><div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--mint)] px-3 py-1.5 text-xs font-black uppercase tracking-[.12em]"><BookOpen size={14} />Laget av trenere</div><h1 className="max-w-3xl text-4xl font-black tracking-[-.055em] sm:text-6xl">Finn øvelser.<br /><span className="text-[var(--orange)]">Lag bedre økter.</span></h1><p className="mt-5 max-w-2xl text-base leading-7 text-[var(--ink-soft)] sm:text-lg"> Søk og finn de riktige øvelsene til lagets neste økt.</p></div><div className="flex shrink-0 items-center gap-2">{user ? <Button size="lg" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={19} />Legg til øvelse</Button> : <a href="/sign-in?next=/exercises" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--orange)] px-5 font-bold text-white">Logg inn for å bidra</a>}<HelpTip topic="exercises-library" /></div></div>

    <div className="mt-10 grid gap-4 border-y border-[var(--line)] py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-lg">
          <Search className="absolute left-3.5 top-3.5 text-[var(--ink-soft)]" size={18} />
          <input value={filters.query} onChange={(event) => patch({ query: event.target.value })} className={`${inputClass} pl-10 pr-11`} placeholder="Søk etter øvelser, ferdigheter eller trenermomenter …" aria-label="Søk etter øvelser" />
          {filters.query !== "" && <button type="button" onClick={() => patch({ query: "" })} aria-label="Tøm søket" className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full text-[var(--ink-soft)] transition hover:bg-black/5 hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--orange)]"><X size={16} /></button>}
        </div>
        {user && <button type="button" aria-pressed={filters.favoritesOnly} onClick={() => patch({ favoritesOnly: !filters.favoritesOnly })} className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--orange)]", filters.favoritesOnly ? "border-[var(--orange)] bg-[var(--orange)] text-white" : "border-[var(--line)] bg-white text-[var(--ink-soft)] hover:border-[var(--ink-soft)]")}><Heart size={15} fill={filters.favoritesOnly ? "currentColor" : "none"} />Favoritter{favoriteExerciseIds.length > 0 && ` (${favoriteExerciseIds.length})`}</button>}
      </div>
      <ExerciseCategoryFilter value={filters.categories} onChange={(categories) => patch({ categories })} counts={counts} />
      <ExerciseAgeGroupFilter value={filters.ageGroups} onChange={(ageGroups) => patch({ ageGroups })} counts={counts} />
      {/* Directly under the chips that change it, so the number and its cause are in the same glance. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p aria-live="polite" className="text-sm font-semibold text-[var(--ink-soft)]">{filtering ? `${filtered.length} av ${exercises.length} øvelser` : `${exercises.length} øvelser`}</p>
        {filtering && <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-bold text-[var(--ink)] underline underline-offset-4 transition hover:text-[var(--orange)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--orange)]"><X size={14} />Nullstill filtre</button>}
      </div>
    </div>

    {filtered.length ? <div className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{filtered.map((exercise, index) => { const canEdit = canEditExercise(user, exercise); return <article key={exercise.id} className="group relative overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_8px_30px_rgba(16,32,29,.045)] transition hover:-translate-y-1 hover:shadow-[var(--shadow)] soft-in" style={{ animationDelay: `${Math.min(index * 35, 180)}ms` }}>
      <button type="button" onClick={() => setViewing(exercise)} className="absolute inset-0 z-0 rounded-[24px] focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[var(--orange)]" aria-label={`Vis detaljer for ${exercise.name}`} />
      {user && <button type="button" aria-pressed={favorites.has(exercise.id)} aria-label={favorites.has(exercise.id) ? `Fjern ${exercise.name} fra favorittene dine` : `Legg ${exercise.name} til i favorittene dine`} onClick={() => void toggleFavoriteExercise(exercise.id).catch(() => undefined)} className={cn("absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/90 shadow-md backdrop-blur transition hover:scale-105 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--orange)]", favorites.has(exercise.id) ? "text-[var(--orange)]" : "text-[var(--ink-soft)]")}><Heart size={18} fill={favorites.has(exercise.id) ? "currentColor" : "none"} /></button>}
      <div className="pointer-events-none relative">
        <ExerciseThumbnail exercise={exercise} className="aspect-[16/9] w-full" />
        <div className="p-5"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-1.5"><Tag tone="orange">{exercise.category}</Tag>{exercise.ageGroups.map((group) => <Tag key={group} tone="green">{formatAgeGroup(group)}</Tag>)}</div><h2 className="mt-3 text-xl font-black tracking-[-.035em]">{exercise.name}</h2></div>{canEdit && <div className="pointer-events-auto relative"><Button variant="ghost" size="sm" className="-mr-2 -mt-2 px-2" aria-label={`Valg for ${exercise.name}`} onClick={() => setMenuId(menuId === exercise.id ? null : exercise.id)}><MoreHorizontal size={19} /></Button>{menuId === exercise.id && <div className="absolute right-0 z-10 w-36 rounded-xl border border-[var(--line)] bg-white p-1.5 text-sm font-semibold shadow-xl"><button className="w-full rounded-lg px-3 py-2 text-left hover:bg-black/5" onClick={() => openEdit(exercise)}>Rediger</button><button className="w-full rounded-lg px-3 py-2 text-left text-[var(--danger)] hover:bg-red-50" onClick={() => { if (confirm("Vil du arkivere denne øvelsen? Eksisterende økter beholder sin kopi.")) void archiveExercise(exercise.id); }}>Arkiver</button></div>}</div>}</div><p className="clamp-2 mt-2 min-h-12 text-sm leading-6 text-[var(--ink-soft)]">{exercise.description}</p><div className="mt-5 flex items-center justify-between gap-3">{exercise.mediaKind ? <Tag tone={exercise.mediaKind === "image" ? "green" : "blue"}>{exercise.mediaKind === "image" ? "Bilde" : "Video"}</Tag> : <Tag tone="green">Uten medier</Tag>}<span className="flex items-center gap-1 text-xs font-semibold text-[var(--ink-soft)]">av {exercise.createdByName}<ArrowUpRight size={13} /></span></div></div>
      </div>
    </article>; })}</div> : <div className="mt-7"><EmptyState icon={<Search size={22} />} title="Fant ingen øvelser" body="Prøv en annen kategori, en annen aldersgruppe, et bredere søkeord eller nullstill filtrene." action={<Button variant="secondary" onClick={resetFilters}>Nullstill filtre</Button>} /></div>}
    <ExerciseDetail key={viewing?.id ?? "none"} exercise={viewing} onClose={() => setViewing(null)} />
    <ExerciseForm key={`${editing?.id ?? "new"}-${formOpen ? "open" : "closed"}`} open={formOpen} exercise={editing} onClose={() => { setFormOpen(false); setEditing(null); }} />
  </div>;
}
