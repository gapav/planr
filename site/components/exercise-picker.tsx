"use client";

import { Check, Eye, Lightbulb, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useGrep } from "./app-provider";
import { ExerciseAges } from "./exercise-age-group-filter";
import { categoryPresentation } from "./exercise-category-filter";
import { ExerciseDetail } from "./exercise-detail";
import { ActiveExerciseFilters, RailBody } from "./exercise-filter-rail";
import { ExerciseThumbnail } from "./exercise-thumbnail";
import { Button, inputClass, LoadingState, Modal, Tag, textareaClass } from "./ui";
import { collectionsForTeam } from "@/lib/collections";
import { countExerciseFacets, emptyExerciseFilterState, filterExercises, formatSubtopic, shortlistExerciseIds, teamAgeGroup, type ExerciseFilterState } from "@/lib/exercises";
import type { Exercise } from "@/lib/types";
import { SUGGESTION_COMMENT_MAX_LENGTH } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * «Legg til øvelser»: the exercise library as the session builder reaches it.
 *
 * It is the library's own rail beside a list, so undertema, samlinger and the
 * team's age band behave exactly as on /exercises, and a change to the rail
 * reaches both. The rows are a compact library card — the same topic tag and
 * age display — with an explicit add, and the dialog stays open, because a bolk is
 * usually built from more than one exercise.
 *
 * The filters live here rather than in the body below the modal, which unmounts
 * on close: the next bolk is usually built from the same corner of the library.
 *
 * With `suggest` it is «Foreslå alternativ» instead (decision 14): the same
 * library and filters, but one exercise is picked rather than several added,
 * with an optional comment, and nothing reaches the plan until «Foreslå».
 */
export interface SuggestAlternativeMode {
  /** The activity the alternative is for. */
  itemTitle: string;
  /** Left out of the list: suggesting what the activity already has is refused. */
  currentExerciseId: string | null;
  /** The coach's own earlier suggestion, which this one replaces. */
  initialExerciseId?: string | null;
  initialComment?: string;
  onSubmit(exercise: Exercise, comment: string): Promise<void>;
}

export function ExercisePicker({ open, sessionId, blockId, blockTitle, teamId, onClose, suggest }: {
  open: boolean;
  sessionId: string;
  blockId: string | null;
  blockTitle: string;
  /** The plan's team, whose samlinger and age band the picker opens on. */
  teamId: string;
  onClose(): void;
  suggest?: SuggestAlternativeMode;
}) {
  const { exercises, exercisesLoaded, user, teams, currentTeam, favoriteExerciseIds, collections, addExerciseItem } = useGrep();
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
  const excludedId = suggest?.currentExerciseId ?? null;
  const offered = useMemo(() => excludedId ? exercises.filter((exercise) => exercise.id !== excludedId) : exercises, [exercises, excludedId]);
  const filtered = useMemo(() => filterExercises(offered, filter), [offered, filter]);
  const counts = useMemo(() => countExerciseFacets(offered, filter), [offered, filter]);
  // «Foreslå alternativ»: the one exercise picked, and the comment with it.
  const [picked, setPicked] = useState<string | null>(suggest?.initialExerciseId ?? null);
  const [comment, setComment] = useState(suggest?.initialComment ?? "");
  const [submitting, setSubmitting] = useState(false);
  const pickedExercise = picked ? offered.find((exercise) => exercise.id === picked) ?? null : null;
  const collectionRows = useMemo(() => teamCollections.map((collection) => ({ id: collection.id, name: collection.name, size: collection.exerciseIds.length })), [teamCollections]);
  const shortlistLabel = active.shortlist?.kind === "favorites" ? "Favoritter" : teamCollections.find((entry) => active.shortlist?.kind === "collection" && entry.id === active.shortlist.id)?.name ?? null;
  const standing = active.categories.length + active.subtopics.length + active.ageGroups.length + (active.shortlist ? 1 : 0);
  const addedCount = Object.values(added).reduce((sum, count) => sum + count, 0);

  function patch(next: Partial<ExerciseFilterState>) { if (next.ageGroups !== undefined) setAgeChosen(true); setFilters((current) => ({ ...current, ...next })); }
  function resetFilters() { setAgeChosen(true); setFilters(emptyExerciseFilterState()); }
  function close() { setPreview(null); setAdded({}); setFiltersOpen(false); onClose(); }
  async function submitSuggestion() {
    if (!suggest || !pickedExercise) return;
    setSubmitting(true);
    // The dialog closes once the provider has it: a refusal rolls the
    // suggestion back, and the coach keeps what they picked to try again.
    try { await suggest.onSubmit(pickedExercise, comment); } catch { setSubmitting(false); return; }
    setSubmitting(false);
    close();
  }
  async function add(exercise: Exercise) {
    if (!blockId) return;
    // Counted once the provider has it: a refusal rolls the item back, and a
    // «Lagt til» left standing over it would read as saved.
    try { await addExerciseItem(sessionId, blockId, exercise); } catch { return; }
    setAdded((current) => ({ ...current, [exercise.id]: (current[exercise.id] ?? 0) + 1 }));
  }

  return <>
    <Modal open={open} onClose={close} title={suggest ? "Foreslå alternativ" : "Legg til øvelser"} description={suggest ? `I stedet for «${suggest.itemTitle}». Velg én øvelse fra øvelsesbanken — laget ser forslaget ditt på kortet og kan bytte med ett trykk.` : `Til bolken «${blockTitle}». Detaljene kopieres inn i økta, så planen endres ikke om øvelsen endres senere.`} size="xl">
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
          <p aria-live="polite" className="mt-3 text-xs font-semibold text-[var(--ink-soft)]">{filtered.length === offered.length ? `${filtered.length} ${filtered.length === 1 ? "øvelse" : "øvelser"}` : `${filtered.length} av ${offered.length} øvelser`}</p>
          {filtered.length ? <ul className="grep-picker-list thin-scrollbar">
            {filtered.map((exercise) => <li key={exercise.id}>{suggest
              ? <PickerRow exercise={exercise} picked={picked === exercise.id} onPick={() => setPicked((current) => current === exercise.id ? null : exercise.id)} onPreview={() => setPreview(exercise)} />
              : <PickerRow exercise={exercise} added={added[exercise.id] ?? 0} onAdd={() => void add(exercise)} onPreview={() => setPreview(exercise)} />}</li>)}
          </ul> : !exercisesLoaded ? <LoadingState compact>Henter øvelser …</LoadingState> : <div className="mt-3 rounded-2xl bg-[var(--paper)] px-5 py-8 text-center"><p className="font-black">Fant ingen øvelser</p><p className="mt-1 text-sm text-[var(--ink-soft)]">Prøv et annet tema, en annen aldersgruppe eller et annet søkeord.</p><Button variant="ghost" size="sm" className="mt-3" onClick={resetFilters}>Nullstill filtre</Button></div>}
        </div>
      </div>
      {suggest ? <div className="grep-picker-foot flex-wrap">
        <label className="grid min-w-0 flex-1 basis-full gap-1 sm:basis-auto">
          <span className="flex items-baseline justify-between gap-2 text-xs font-bold text-[var(--ink-soft)]"><span>Kommentar (valgfritt)</span><span aria-hidden className="tabular-nums">{comment.length}/{SUGGESTION_COMMENT_MAX_LENGTH}</span></span>
          <textarea value={comment} onChange={(event) => setComment(event.target.value.slice(0, SUGGESTION_COMMENT_MAX_LENGTH))} maxLength={SUGGESTION_COMMENT_MAX_LENGTH} rows={2} placeholder="F.eks. «Mindre kø, flere ballberøringer»" className={cn(textareaClass, "min-h-0 resize-none py-2 text-sm")} />
        </label>
        <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:flex-col sm:items-end">
          <p aria-live="polite" className="text-sm text-[var(--ink-soft)]">{pickedExercise ? <>Valgt: <strong className="text-[var(--ink)]">{pickedExercise.name}</strong></> : "Velg én øvelse."}</p>
          <div className="flex gap-2"><Button variant="ghost" onClick={close}>Avbryt</Button><Button onClick={() => void submitSuggestion()} disabled={!pickedExercise || submitting}><Lightbulb size={16} aria-hidden />{submitting ? "Foreslår…" : "Foreslå"}</Button></div>
        </div>
      </div> : <div className="grep-picker-foot">
        <p aria-live="polite" className="text-sm text-[var(--ink-soft)]">{addedCount ? `${addedCount} ${addedCount === 1 ? "øvelse" : "øvelser"} lagt til i «${blockTitle}»` : "Velg øvelsene bolken skal ha."}</p>
        <Button onClick={close}>Ferdig</Button>
      </div>}
    </Modal>
    <ExerciseDetail key={preview?.id ?? "none"} exercise={open ? preview : null} onClose={() => setPreview(null)} />
  </>;
}

/**
 * One exercise as a row: the library card's topic tag, age and corner, one line of
 * description, and an add that says what it did. The topic tag is the most
 * specific one the exercise has — its undertema, or the topic when untagged —
 * since the topic alone mostly repeats the filter standing above the list.
 */
function PickerRow({ exercise, added = 0, onAdd, picked, onPick, onPreview }: { exercise: Exercise; added?: number; onAdd?(): void; picked?: boolean; onPick?(): void; onPreview(): void }) {
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
      {/* The age reads as on the library card — squares and one range — after
          the topic, and wraps under it when the row is narrow. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {topicTags.map((label) => <Tag key={label} tone={tone}>{label}</Tag>)}
        <ExerciseAges ageGroups={exercise.ageGroups} />
      </div>
    </div>
    {onPick ? <button
      type="button"
      onClick={onPick}
      aria-pressed={picked}
      aria-label={picked ? `${exercise.name} er valgt` : `Velg ${exercise.name}`}
      className={cn("inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        picked ? "border-transparent bg-[var(--accent-fill)] text-[var(--on-accent)]" : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--ink)]")}
    >
      {picked ? <Check size={16} strokeWidth={2.5} aria-hidden /> : <Plus size={16} aria-hidden />}
      <span className={picked ? undefined : "hidden sm:inline"}>{picked ? "Valgt" : "Velg"}</span>
    </button> : <button
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
    </button>}
  </div>;
}
