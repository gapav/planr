"use client";

import { Heart, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import { categoryPresentation } from "@/components/exercise-category-filter";
import { Button, Modal } from "@/components/ui";
import type { ExerciseFacetCounts, ExerciseFilterState } from "@/lib/exercises";
import { formatAgeGroup, toggleFilterValue } from "@/lib/exercises";
import { EXERCISE_AGE_GROUPS, EXERCISE_CATEGORIES, type ExerciseAgeGroup, type ExerciseCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The library's filters, as a rail beside the results rather than a panel above
 * them.
 *
 * The panel it replaces cost 242px of every screen and grew a row per axis; the
 * grid started 508px down an 813px viewport. A rail scrolls on its own, so the
 * taxonomy can get deeper — the forbund's own bank nests three levels under
 * Forsvar and Angrep — without ever pushing an exercise off screen. Nothing here
 * nests yet: `EXERCISE_CATEGORIES` is still six flat values, and a `depth` on
 * `RailOption` is what the nesting will hang off when the topics table arrives.
 */

/** Age narrows to one band; a topic is a union, so the two rows read differently. */
interface RailProps {
  filters: ExerciseFilterState;
  counts: ExerciseFacetCounts;
  /** The band the current team's own name implies, called out where it is offered. */
  suggested: ExerciseAgeGroup | null;
  /** Hidden for a signed-out visitor, who has no shortlist. */
  canFavorite: boolean;
  favoriteCount: number;
  /** How many exercises the current filters leave. Only the sheet shows it. */
  resultCount: number;
  onChange(patch: Partial<ExerciseFilterState>): void;
}

export function ExerciseFilterRail(props: RailProps) {
  return <aside className="grep-rail" aria-label="Filtrer øvelser"><RailBody {...props} /></aside>;
}

/**
 * On a phone the rail has nowhere to be, so it becomes one button and the same
 * body inside a dialog. The button carries the number of filters standing, which
 * is the thing a coach otherwise has to open it to find out.
 */
export function ExerciseFilterSheet(props: RailProps) {
  const [open, setOpen] = useState(false);
  const active = props.filters.categories.length + props.filters.ageGroups.length + (props.filters.favoritesOnly ? 1 : 0);
  return <>
    <button type="button" onClick={() => setOpen(true)} className="grep-rail-open">
      <SlidersHorizontal size={17} />Filter{active > 0 && <span>{active}</span>}
    </button>
    <Modal open={open} onClose={() => setOpen(false)} title="Filtrer øvelser" description="Alder, tema og favoritter. Treffene oppdateres mens du velger." size="sm">
      <RailBody {...props} />
      {/* The grid is behind the sheet, so the button is where a phone finds out
          what the choice was worth. */}
      <div className="mt-6 flex justify-end"><Button onClick={() => setOpen(false)}>Vis {props.resultCount} {props.resultCount === 1 ? "øvelse" : "øvelser"}</Button></div>
    </Modal>
  </>;
}

function RailBody({ filters, counts, suggested, canFavorite, favoriteCount, onChange }: RailProps) {
  // A link may carry several bands — the page filtered by chips before this —
  // and they still or- together correctly, so the rail marks each of them
  // selected rather than pretending only one is.
  const ages = filters.ageGroups;
  return <div className="grep-rail-body">
    {canFavorite && <button
      type="button"
      aria-pressed={filters.favoritesOnly}
      aria-label={favoriteCount > 0 ? `Favoritter — ${favoriteCount} ${favoriteCount === 1 ? "øvelse" : "øvelser"}` : "Favoritter"}
      onClick={() => onChange({ favoritesOnly: !filters.favoritesOnly })}
      className={cn("grep-rail-favorites", filters.favoritesOnly && "is-on")}
    >
      <Heart size={16} fill={filters.favoritesOnly ? "currentColor" : "none"} />Favoritter
      {favoriteCount > 0 && <span className="grep-rail-count">{favoriteCount}</span>}
    </button>}

    <section className="grep-rail-section">
      {/* A coach coaches one team at one age, so this narrows rather than
          unions: picking a band replaces the one before it. */}
      <h2 className="grep-rail-heading">Alder</h2>
      <ul className="grep-rail-list">
        <li><RailOption label="Alle aldre" count={counts.allAgeGroups} selected={ages.length === 0} onSelect={() => onChange({ ageGroups: [] })} /></li>
        {EXERCISE_AGE_GROUPS.map((group) => <li key={group}><RailOption
          label={formatAgeGroup(group)}
          count={counts.ageGroups[group]}
          selected={ages.includes(group)}
          // Said once, on the band it explains: a coach who opens the library
          // already narrowed should be able to see why.
          note={group === suggested ? "laget ditt" : undefined}
          onSelect={() => onChange({ ageGroups: ages.length === 1 && ages[0] === group ? [] : [group] })}
        /></li>)}
      </ul>
    </section>

    <section className="grep-rail-section">
      {/* Topics union: "angrep or skudd" is how a coach looks for an idea. */}
      <h2 className="grep-rail-heading">Tema</h2>
      <ul className="grep-rail-list">
        <li><RailOption label="Alle tema" count={counts.allCategories} selected={filters.categories.length === 0} onSelect={() => onChange({ categories: [] })} /></li>
        {EXERCISE_CATEGORIES.map((category) => <li key={category}><RailOption
          label={category}
          icon={categoryPresentation[category].icon}
          count={counts.categories[category]}
          selected={filters.categories.includes(category)}
          onSelect={() => onChange({ categories: toggleFilterValue(filters.categories, category as ExerciseCategory, EXERCISE_CATEGORIES) })}
        /></li>)}
      </ul>
    </section>
  </div>;
}

/**
 * One line of the rail. `depth` is where a nested topic will indent from; it is
 * always 0 while the taxonomy is flat.
 */
function RailOption({ label, icon: Icon, count, selected, note, depth = 0, onSelect }: {
  label: string;
  icon?: typeof Heart;
  count: number;
  selected: boolean;
  note?: string;
  depth?: number;
  onSelect(): void;
}) {
  return <button
    type="button"
    aria-pressed={selected}
    // Without this the row is announced as "Alle tema nine" — the count runs
    // straight into the label, and the note explaining a band nobody chose is
    // never read at all.
    aria-label={`${label} — ${count} ${count === 1 ? "øvelse" : "øvelser"}${note ? `, ${note}` : ""}`}
    onClick={onSelect}
    // An empty topic stays reachable — the count is the answer, and disabling it
    // would hide why the grid is empty — but it does not ask for attention.
    className={cn("grep-rail-option", selected && "is-on", !selected && count === 0 && "is-empty")}
    style={depth ? { paddingLeft: `${12 + depth * 14}px` } : undefined}
  >
    {Icon && <Icon size={15} className="grep-rail-icon" aria-hidden />}
    <span className="grep-rail-label">{label}{note && <small>{note}</small>}</span>
    <span className="grep-rail-count">{count}</span>
  </button>;
}

/**
 * What is standing right now, above the grid it explains. The rail says what can
 * be chosen; this says what was, and is the one place to undo it — scrolled down
 * among the cards, the rail is off screen on a phone and easy to forget on a
 * laptop.
 */
export function ActiveExerciseFilters({ filters, favoritesOnly, onChange, onReset }: {
  filters: ExerciseFilterState;
  favoritesOnly: boolean;
  onChange(patch: Partial<ExerciseFilterState>): void;
  onReset(): void;
}) {
  const chips: Array<{ key: string; label: string; clear(): void }> = [
    ...(filters.query.trim() ? [{ key: "q", label: `«${filters.query.trim()}»`, clear: () => onChange({ query: "" }) }] : []),
    ...filters.ageGroups.map((group) => ({ key: `age-${group}`, label: formatAgeGroup(group), clear: () => onChange({ ageGroups: filters.ageGroups.filter((entry) => entry !== group) }) })),
    ...filters.categories.map((category) => ({ key: `cat-${category}`, label: category, clear: () => onChange({ categories: filters.categories.filter((entry) => entry !== category) }) })),
    ...(favoritesOnly ? [{ key: "fav", label: "Favoritter", clear: () => onChange({ favoritesOnly: false }) }] : []),
  ];
  if (!chips.length) return null;
  return <div className="grep-active-filters">
    {chips.map((chip) => <button key={chip.key} type="button" onClick={chip.clear} aria-label={`Fjern filteret ${chip.label}`} className="grep-active-chip">{chip.label}<X size={13} /></button>)}
    <button type="button" onClick={onReset} className="grep-active-reset">Nullstill</button>
  </div>;
}
