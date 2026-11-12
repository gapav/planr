"use client";

import { Check, Eye, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useGrep } from "./app-provider";
import { bandTone } from "./exercise-age-group-filter";
import { categoryPresentation } from "./exercise-category-filter";
import { ExerciseDetail } from "./exercise-detail";
import { ActiveExerciseFilters, RailBody } from "./exercise-filter-rail";
import { ExerciseThumbnail } from "./exercise-thumbnail";
import { Button, inputClass, Modal, Tag } from "./ui";
import { collectionsForTeam } from "@/lib/collections";
import { countExerciseFacets, emptyExerciseFilterState, filterExercises, formatAgeGroup, formatSubtopic, shortlistExerciseIds, teamAgeGroup, type ExerciseFilterState } from "@/lib/exercises";
import type { Exercise } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * «Legg til øvelser»: the exercise library as the session builder reaches it.
 *
 * It is the library's own rail beside a list, so undertema, samlinger and the
 * team's age band behave exactly as on /exercises, and a change to the rail
 * reaches both. The rows are a compact library card — the same topic and age
 * tags — with an explicit add, and the dialog stays open, because a bolk is
 * usually built from more than one exercise.
 *
 * The filters live here rather than in the body below the modal, which unmounts
 * on close: the next bolk is usually built from the same corner of the library.
 */
export function ExercisePicker({ open, sessionId, blockId, blockTitle, teamId, onClose }: {
  open: boolean;
  sessionId: string;
  blockId: string | null;
  blockTitle: string;
  /** The plan's team, whose samlinger and age band the picker opens on. */
  teamId: string;
  onClose(): void;
}) {
  const { exercises, user, teams, currentTeam, favoriteExerciseIds, collections, addExerciseItem } = useGrep();
  const team = teams.find((entry) => entry.id === teamId) ?? currentTeam ?? null;
  const [filters, setFilters] = useState<ExerciseFilterState>(emptyExerciseFilterState);
  // As in the library: the band the team's name implies until the coach
  // touches the age control, and theirs from then on.
  const suggestedAge = useMemo(() => teamAgeGroup(team), [team]);
  const [ageChosen, setAgeChosen] = useState(false);
  const active = useMemo<ExerciseFilterState>(() => ({ ...filters, ageGroups: ageChosen ? filters.ageGroups : suggestedAge ? [suggestedAge] : [] }), [filters, ageChosen, suggestedAge]);
  // How many times each exercise went into the bolk while the dialog was open.
  const [added, setAdded] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<Exercise | null>(null);
  // The rail sits beside the list from a tablet up; on a phone it folds away
  // behind a button, inline rather than as a second dialog over this one.
  const [filtersOpen, setFiltersOpen] = useState(false);

  const teamCollections = useMemo(() => collectionsForTeam(collections, team?.id), [collections, team]);
  const shortlistIds = useMemo(() => shortlistExerciseIds(active.shortlist, favoriteExerciseIds, teamCollections), [active.shortlist, favoriteExerciseIds, teamCollections]);
  const filter = useMemo(() => ({ query: active.query, categories: active.categories, subtopics: active.subtopics, ageGroups: active.ageGroups, shortlistIds }), [active, shortlistIds]);
  const filtered = useMemo(() => filterExercises(exercises, filter), [exercises, filter]);
  const counts = useMemo(() => countExerciseFacets(exercises, filter), [exercises, filter]);
  const collectionRows = useMemo(() => teamCollections.map((collection) => ({ id: collection.id, name: collection.name, size: collection.exerciseIds.length })), [teamCollections]);
  const shortlistLabel = active.shortlist?.kind === "favorites" ? "Favoritter" : teamCollections.find((entry) => active.shortlist?.kind === "collection" && entry.id === active.shortlist.id)?.name ?? null;
  const standing = active.categories.length + active.subtopics.length + active.ageGroups.length + (active.shortlist ? 1 : 0);
  const addedCount = Object.values(added).reduce((sum, count) => sum + count, 0);

  function patch(next: Partial<ExerciseFilterState>) { if (next.ageGroups !== undefined) setAgeChosen(true); setFilters((current) => ({ ...current, ...next })); }
  function resetFilters() { setAgeChosen(true); setFilters(emptyExerciseFilterState()); }
  function close() { setPreview(null); setAdded({}); setFiltersOpen(false); onClose(); }
  async function add(exercise: Exercise) {
    if (!blockId) return;
    // Counted once the provider has it: a refusal rolls the item back, and a
    // «Lagt til» left standing over it would read as saved.
    try { await addExerciseItem(sessionId, blockId, exercise); } catch { return; }
    setAdded((current) => ({ ...current, [exercise.id]: (current[exercise.id] ?? 0) + 1 }));
  }

  return <>
    <Modal open={open} onClose={close} title="Legg til øvelser" description={`Til bolken «${blockTitle}». Detaljene kopieres inn i økta, så planen endres ikke om øvelsen endres senere.`} size="xl">
      <div className="grep-picker">
        <aside className={cn("grep-picker-rail", filtersOpen && "is-open")} aria-label="Filtrer øvelser">
          <RailBody filters={active} counts={counts} suggested={suggestedAge} canFavorite={Boolean(user)} favoriteCount={favoriteExerciseIds.length} collections={collectionRows} resultCount={filtered.length} onChange={patch} />
        </aside>
        <div className="grep-picker-main">
          <div className="flex items-center gap-2">
            <div className="grep-library-search">
              <Search size={18} aria-hidden />
              <input value={active.query} onChange={(event) => patch({ query: event.target.value })} className={inputClass} placeholder="Søk etter øvelser …" aria-label="Søk etter øvelser" autoFocus />
              {active.query !== "" && <button type="button" onClick={() => patch({ query: "" })} aria-label="Tøm søket"><X size={16} /></button>}
            </div>
            <button type="button" onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen} className="grep-rail-open grep-picker-filter-toggle"><SlidersHorizontal size={17} />Filter{standing > 0 && <span>{standing}</span>}</button>
          </div>
          <ActiveExerciseFilters filters={active} shortlistLabel={shortlistLabel} onChange={patch} onReset={resetFilters} />
          <p aria-live="polite" className="mt-3 text-xs font-semibold text-[var(--ink-soft)]">{filtered.length === exercises.length ? `${filtered.length} ${filtered.length === 1 ? "øvelse" : "øvelser"}` : `${filtered.length} av ${exercises.length} øvelser`}</p>
          {filtered.length ? <ul className="grep-picker-list thin-scrollbar">
            {filtered.map((exercise) => <li key={exercise.id}><PickerRow exercise={exercise} added={added[exercise.id] ?? 0} onAdd={() => void add(exercise)} onPreview={() => setPreview(exercise)} /></li>)}
          </ul> : <div className="mt-3 rounded-2xl bg-[var(--paper)] px-5 py-8 text-center"><p className="font-black">Fant ingen øvelser</p><p className="mt-1 text-sm text-[var(--ink-soft)]">Prøv et annet tema, en annen aldersgruppe eller et annet søkeord.</p><Button variant="ghost" size="sm" className="mt-3" onClick={resetFilters}>Nullstill filtre</Button></div>}
        </div>
      </div>
      <div className="grep-picker-foot">
        <p aria-live="polite" className="text-sm text-[var(--ink-soft)]">{addedCount ? `${addedCount} ${addedCount === 1 ? "øvelse" : "øvelser"} lagt til i «${blockTitle}»` : "Velg øvelsene bolken skal ha."}</p>
        <Button onClick={close}>Ferdig</Button>
      </div>
    </Modal>
    <ExerciseDetail key={preview?.id ?? "none"} exercise={open ? preview : null} onClose={() => setPreview(null)} />
  </>;
}

/**
 * One exercise as a row: the library card's tags and corner, one line of
 * description, and an add that says what it did. The topic tag is the most
 * specific one the exercise has — its undertema, or the topic when untagged —
 * since the topic alone mostly repeats the filter standing above the list.
 */
function PickerRow({ exercise, added, onAdd, onPreview }: { exercise: Exercise; added: number; onAdd(): void; onPreview(): void }) {
  const tone = categoryPresentation[exercise.category].tone;
  const topicTags = exercise.subtopics?.length ? exercise.subtopics.map(formatSubtopic) : [exercise.category];
  return <div className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 rounded-[16px_6px_16px_16px] border border-[var(--line)] bg-[var(--surface)] p-2.5 transition hover:border-[var(--line-hover-strong)] sm:grid-cols-[88px_minmax(0,1fr)_auto] sm:gap-4">
    <button type="button" className="group/media relative h-12 w-16 overflow-hidden rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:h-[62px] sm:w-[88px]" aria-label={`Vis detaljer for ${exercise.name}`} onClick={onPreview}>
      <ExerciseThumbnail exercise={exercise} className="h-full w-full" />
      <span className="absolute inset-0 grid place-items-center bg-black/25 opacity-0 transition group-hover/media:opacity-100 group-focus-visible/media:opacity-100"><span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--surface-raised)]/90"><Eye size={15} /></span></span>
    </button>
    <div className="min-w-0">
      <p className="text-[15px] font-black leading-snug tracking-[-.015em]">{exercise.name}</p>
      {exercise.description && <p className="mt-0.5 truncate text-xs leading-5 text-[var(--ink-soft)]">{exercise.description}</p>}
      <div className="mt-1.5 flex flex-wrap gap-1">
        {topicTags.map((label) => <Tag key={label} tone={tone}>{label}</Tag>)}
        {exercise.ageGroups.map((group) => <Tag key={group} tone={bandTone[group]}>{formatAgeGroup(group)}</Tag>)}
      </div>
    </div>
    <button
      type="button"
      onClick={onAdd}
      aria-label={added ? `Legg ${exercise.name} til i bolken en gang til` : `Legg ${exercise.name} til i bolken`}
      className={cn("inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        added ? "border-transparent bg-[var(--success-bg)] text-[var(--success-ink)]" : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--ink)]")}
    >
      {added ? <Check size={16} strokeWidth={2.5} aria-hidden /> : <Plus size={16} aria-hidden />}
      {/* On a phone an unadded row is a bare «+», but «Lagt til» stays written
          out: it is the one thing the row has to say after a tap. */}
      <span className={added ? undefined : "hidden sm:inline"}>{added ? (added > 1 ? `Lagt til ×${added}` : "Lagt til") : "Legg til"}</span>
    </button>
  </div>;
}
