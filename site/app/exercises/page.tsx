"use client";

import { ArrowUpRight, Heart, MoreHorizontal, Plus, Search, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/page-heading";
import { useGrep } from "@/components/app-provider";
import { ActiveExerciseFilters, ExerciseFilterRail, ExerciseFilterSheet } from "@/components/exercise-filter-rail";
import { HelpTip } from "@/components/help-tip";
import { ExerciseDetail } from "@/components/exercise-detail";
import { ExerciseForm } from "@/components/exercise-form";
import { ExerciseThumbnail } from "@/components/exercise-thumbnail";
import { Button, EmptyState, Tag, inputClass } from "@/components/ui";
import { canEditExercise, countExerciseFacets, emptyExerciseFilterState, filterExercises, formatAgeGroup, hasActiveExerciseFilter, parseExerciseFilterParams, serializeExerciseFilterParams, teamAgeGroup, type ExerciseFilter, type ExerciseFilterState } from "@/lib/exercises";
import type { Exercise } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * `useSearchParams` opts the tree below it out of prerendering, so the library
 * sits behind its own boundary and the shell above still ships as static HTML.
 */
export default function ExercisesPage() {
  return <AppShell>
    <Suspense fallback={<div className="mx-auto min-h-[70vh] max-w-[1440px] px-4 pt-9 sm:px-7 sm:pt-14" />}>
      <ExerciseLibrary />
    </Suspense>
  </AppShell>;
}

function ExerciseLibrary() {
  const searchParams = useSearchParams();
  const { exercises, user, currentTeam, archiveExercise, favoriteExerciseIds, toggleFavoriteExercise } = useGrep();
  // The query string seeds the filters once and is written back from them
  // afterwards; it is not the running source of truth, because routing every
  // keystroke through the router made typing feel like it was fighting back.
  const [filters, setFilters] = useState<ExerciseFilterState>(() => parseExerciseFilterParams(new URLSearchParams(searchParams.toString())));
  const [formOpen, setFormOpen] = useState(false); const [editing, setEditing] = useState<Exercise | null>(null); const [menuId, setMenuId] = useState<string | null>(null); const [viewing, setViewing] = useState<Exercise | null>(null);

  // A coach coaches one team, and its name already says which band it trains in,
  // so the library opens there rather than on everything. The band is derived at
  // render instead of written into state: there is no effect racing the
  // workspace load, and switching team re-derives it for free. A link carrying
  // `?alder=` arrives already chosen, and the first touch of the age control —
  // including clearing it to "alle aldre" — hands the choice over for good.
  const suggestedAge = useMemo(() => teamAgeGroup(currentTeam), [currentTeam]);
  const [ageChosen, setAgeChosen] = useState(() => new URLSearchParams(searchParams.toString()).has("alder"));
  const active = useMemo<ExerciseFilterState>(() => ({
    ...filters,
    ageGroups: ageChosen ? filters.ageGroups : suggestedAge ? [suggestedAge] : [],
  }), [filters, ageChosen, suggestedAge]);

  const favorites = useMemo(() => new Set(favoriteExerciseIds), [favoriteExerciseIds]);
  const activeFilter = useMemo<ExerciseFilter>(() => ({ query: active.query, categories: active.categories, ageGroups: active.ageGroups, favoriteIds: active.favoritesOnly ? favorites : null }), [active, favorites]);
  const filtered = useMemo(() => filterExercises(exercises, activeFilter), [exercises, activeFilter]);
  const counts = useMemo(() => countExerciseFacets(exercises, activeFilter), [exercises, activeFilter]);
  const filtering = hasActiveExerciseFilter(active);

  // `replaceState` keeps the router in sync without a navigation, so a filtered
  // library is linkable and survives a reload while the back button still leaves
  // the page rather than replaying every chip the coach touched on the way here.
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = serializeExerciseFilterParams(active).toString();
      window.history.replaceState(null, "", params ? `?${params}` : window.location.pathname);
    }, 250);
    return () => clearTimeout(timer);
  }, [active]);

  // Touching the age control — picking a band or clearing it — is the coach
  // taking the scope over from the team's name.
  function patch(next: Partial<ExerciseFilterState>) { if (next.ageGroups !== undefined) setAgeChosen(true); setFilters((current) => ({ ...current, ...next })); }


  function openEdit(exercise: Exercise) { setEditing(exercise); setFormOpen(true); setMenuId(null); setViewing(null); }
  function resetFilters() { setAgeChosen(true); setFilters(emptyExerciseFilterState()); }

  useEffect(() => {
    if (!menuId) return;
    const closeOutside = (event: PointerEvent) => { if (!(event.target as Element).closest("[data-exercise-menu]")) setMenuId(null); };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { document.getElementById(`exercise-menu-${menuId}`)?.focus(); setMenuId(null); } };
    document.addEventListener("pointerdown", closeOutside); document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, [menuId]);

  const railProps = { filters: active, counts, suggested: suggestedAge, canFavorite: Boolean(user), favoriteCount: favoriteExerciseIds.length, resultCount: filtered.length, onChange: patch };

  return <div className="grep-page grep-library">
    <PageHeading eyebrow="Små ideer. Gode økter." title="Øvelsesbank" description="Finn noe som får laget i gang." actions={<><Button size="lg" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={19} />Opprett øvelse</Button><HelpTip topic="exercises-library" /></>} />

    <div className="grep-library-layout">
      <ExerciseFilterRail {...railProps} />
      <div className="grep-library-main">
        <div className="grep-library-toolbar">
          <div className="grep-library-search">
            <Search size={18} aria-hidden />
            <input value={active.query} onChange={(event) => patch({ query: event.target.value })} className={inputClass} placeholder="Søk etter øvelser, konsepter eller ferdigheter" aria-label="Søk etter øvelser" />
            {active.query !== "" && <button type="button" onClick={() => patch({ query: "" })} aria-label="Tøm søket"><X size={16} /></button>}
          </div>
          {/* The rail has nowhere to be on a phone, so it moves behind this. */}
          <ExerciseFilterSheet {...railProps} />
        </div>
        {/* What is standing, and the one place to undo it — the rail is off
            screen on a phone and above the fold on a laptop once you scroll. */}
        <ActiveExerciseFilters filters={active} favoritesOnly={active.favoritesOnly} onChange={patch} onReset={resetFilters} />
        <p aria-live="polite" className="grep-library-count">{filtering && filtered.length !== exercises.length ? `${filtered.length} av ${exercises.length} øvelser` : `${filtered.length} ${filtered.length === 1 ? "øvelse" : "øvelser"}`}</p>

    {filtered.length ? <div className="grep-library-grid">{filtered.map((exercise, index) => { const canEdit = canEditExercise(user, exercise); return <article key={exercise.id} className="grep-exercise-card group relative overflow-hidden border border-[var(--line)] bg-[var(--surface)] transition soft-in" style={{ animationDelay: `${Math.min(index * 35, 180)}ms` }}>
      <button type="button" onClick={() => setViewing(exercise)} className="absolute inset-0 z-0 rounded-[24px] focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[var(--orange)]" aria-label={`Vis detaljer for ${exercise.name}`} />
      {user && <button type="button" aria-pressed={favorites.has(exercise.id)} aria-label={favorites.has(exercise.id) ? `Fjern ${exercise.name} fra favorittene dine` : `Legg ${exercise.name} til i favorittene dine`} onClick={() => void toggleFavoriteExercise(exercise.id).catch(() => undefined)} className={cn("absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/90 shadow-md backdrop-blur transition hover:scale-105 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--orange)]", favorites.has(exercise.id) ? "text-[var(--orange)]" : "text-[var(--ink-soft)]")}><Heart size={18} fill={favorites.has(exercise.id) ? "currentColor" : "none"} /></button>}
      <div className="pointer-events-none relative">
        <ExerciseThumbnail exercise={exercise} className="aspect-[16/9] w-full" />
        <div className="p-5"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-1.5"><Tag tone="orange">{exercise.category}</Tag>{exercise.ageGroups.map((group) => <Tag key={group} tone="green">{formatAgeGroup(group)}</Tag>)}</div><h2 className="mt-3 text-xl font-black tracking-[-.035em]">{exercise.name}</h2></div>{canEdit && <div data-exercise-menu className="pointer-events-auto relative"><Button variant="ghost" size="sm" className="-mr-2 -mt-2 px-2" id={`exercise-menu-${exercise.id}`} aria-expanded={menuId === exercise.id} aria-label={`Valg for ${exercise.name}`} onClick={() => setMenuId(menuId === exercise.id ? null : exercise.id)}><MoreHorizontal size={19} /></Button>{menuId === exercise.id && <div className="absolute right-0 z-10 w-36 rounded-xl border border-[var(--line)] bg-white p-1.5 text-sm font-semibold shadow-xl"><button className="w-full rounded-lg px-3 py-2 text-left hover:bg-black/5" onClick={() => openEdit(exercise)}>Rediger</button><button className="w-full rounded-lg px-3 py-2 text-left text-[var(--danger)] hover:bg-red-50" onClick={() => { if (confirm("Vil du arkivere denne øvelsen? Eksisterende økter beholder sin kopi.")) { setMenuId(null); void archiveExercise(exercise.id).catch(() => undefined); } }}>Arkiver</button></div>}</div>}</div><p className="clamp-2 mt-2 min-h-12 text-sm leading-6 text-[var(--ink-soft)]">{exercise.description}</p><div className="mt-5 flex items-center justify-between gap-3">{exercise.mediaKind ? <Tag tone={exercise.mediaKind === "image" ? "green" : "blue"}>{exercise.mediaKind === "image" ? "Bilde" : "Video"}</Tag> : <Tag tone="green">Uten medier</Tag>}<span className="flex items-center gap-1 text-xs font-semibold text-[var(--ink-soft)]">av {exercise.createdByName}<ArrowUpRight size={13} /></span></div></div>
      </div>
    </article>; })}</div> : <EmptyState icon={<Search size={22} />} title="Fant ingen øvelser" body="Prøv et annet tema, en annen aldersgruppe, et bredere søkeord eller nullstill filtrene." action={<Button variant="secondary" onClick={resetFilters}>Nullstill filtre</Button>} />}
      </div>
    </div>
    <ExerciseDetail key={viewing?.id ?? "none"} exercise={viewing} onClose={() => setViewing(null)} />
    <ExerciseForm key={`${editing?.id ?? "new"}-${formOpen ? "open" : "closed"}`} open={formOpen} exercise={editing} onClose={() => { setFormOpen(false); setEditing(null); }} />
  </div>;
}
