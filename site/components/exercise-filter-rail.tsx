"use client";

import { Bookmark, Heart, Plus, SlidersHorizontal, X } from "lucide-react";
import { type CSSProperties, useState } from "react";
import { bandTone } from "@/components/exercise-age-group-filter";
import { categoryPresentation } from "@/components/exercise-category-filter";
import { Button, Modal, tagTones, type TagTone } from "@/components/ui";
import type { ExerciseFacetCounts, ExerciseFilterState, ExerciseShortlist } from "@/lib/exercises";
import { formatAgeGroup, sameShortlist, toggleFilterValue } from "@/lib/exercises";
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

/** One samling as the rail needs it: a name and how much is in it. */
export interface RailCollection { id: string; name: string; size: number }

/** Age narrows to one band; a topic is a union, so the two rows read differently. */
interface RailProps {
  filters: ExerciseFilterState;
  counts: ExerciseFacetCounts;
  /** The band the current team's own name implies, called out where it is offered. */
  suggested: ExerciseAgeGroup | null;
  /** Hidden for a signed-out visitor, who has neither hearts nor a team. */
  canFavorite: boolean;
  favoriteCount: number;
  /** The current team's samlinger, already ordered by the provider. */
  collections: readonly RailCollection[];
  /** How many exercises the current filters leave. Only the sheet shows it. */
  resultCount: number;
  onChange(patch: Partial<ExerciseFilterState>): void;
  /**
   * Opens the create dialog, which the page owns because it also writes. Left
   * out inside the phone sheet: that is itself a dialog, and a second one over
   * it would be two modals deep for something the card's bookmark already
   * offers.
   */
  onNewCollection?(): void;
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
  const active = props.filters.categories.length + props.filters.ageGroups.length + (props.filters.shortlist ? 1 : 0);
  return <>
    <button type="button" onClick={() => setOpen(true)} className="grep-rail-open">
      <SlidersHorizontal size={17} />Filter{active > 0 && <span>{active}</span>}
    </button>
    <Modal open={open} onClose={() => setOpen(false)} title="Filtrer øvelser" description="Samlinger, alder og tema. Treffene oppdateres mens du velger." size="sm">
      <RailBody {...props} onNewCollection={undefined} />
      {/* The grid is behind the sheet, so the button is where a phone finds out
          what the choice was worth. */}
      <div className="mt-6 flex justify-end"><Button onClick={() => setOpen(false)}>Vis {props.resultCount} {props.resultCount === 1 ? "øvelse" : "øvelser"}</Button></div>
    </Modal>
  </>;
}

function RailBody({ filters, counts, suggested, canFavorite, favoriteCount, collections, onChange, onNewCollection }: RailProps) {
  // A link may carry several bands — the page filtered by chips before this —
  // and they still or- together correctly, so the rail marks each of them
  // selected rather than pretending only one is.
  const ages = filters.ageGroups;
  // Favourites and samlinger are stored apart but chosen together: picking one
  // releases the other, because "favorittene mine and oktoberfokus" is an
  // intersection nobody asks for.
  //
  // Either also hands the age and topic choices back. The library opens on the
  // band the team's name implies, which nobody chose, and it would otherwise
  // quietly drop the 13-15 exercise a coach put in a samling on purpose — a
  // shortlist is an explicit act and outranks a guess. The same goes for a
  // topic left standing from before: a samling is a list somebody wrote down,
  // and it is shown whole.
  const chooseShortlist = (shortlist: ExerciseShortlist) =>
    onChange({ shortlist: sameShortlist(filters.shortlist, shortlist) ? null : shortlist, ageGroups: [], categories: [] });
  // …and while it stands, the two rows below it are off rather than gone. Gone
  // would leave a rail that is mostly empty space and a coach with no idea the
  // taxonomy is still there; off says the samling is doing the narrowing. The
  // search box above the grid is untouched — looking for a name inside a
  // samling is the one narrowing that still reads.
  //
  // Read off the name rather than off `filters.shortlist`, so a link to a
  // samling since deleted leaves the rail working: `shortlistExerciseIds`
  // resolves that id to the whole library, and switching the axes off over a
  // shortlist that is not actually narrowing anything would strand the coach.
  const shortlist = filters.shortlist;
  const shortlistName = shortlist === null ? null
    : shortlist.kind === "favorites" ? "Favoritter"
    : collections.find((entry) => entry.id === shortlist.id)?.name ?? null;
  const narrowed = shortlistName !== null;
  // Nothing hearted is a shortlist that leads to an empty grid, so the pill
  // says how many and then stays out of the way.
  const favoritesOn = shortlist?.kind === "favorites";
  const emptyFavorites = !favoritesOn && favoriteCount === 0;
  return <div className="grep-rail-body">
    {canFavorite && <button
      type="button"
      aria-pressed={favoritesOn}
      aria-disabled={emptyFavorites || undefined}
      // The count is carried at nought too, like every other row in the rail:
      // that number is the whole explanation for why the row does not respond.
      aria-label={`Favoritter — ${favoriteCount} ${favoriteCount === 1 ? "øvelse" : "øvelser"}`}
      onClick={() => { if (!emptyFavorites) chooseShortlist({ kind: "favorites" }); }}
      className={cn("grep-rail-favorites", favoritesOn && "is-on", emptyFavorites && "is-empty")}
    >
      <Heart size={16} fill={favoritesOn ? "currentColor" : "none"} />Favoritter
      <span className="grep-rail-count">{favoriteCount}</span>
    </button>}

    {/* Samlinger sit above the taxonomy because they are the coach's own
        structure over it, and a coach reaches for "det vi jobber med nå" before
        they reach for "angrep". The counts here are memberships, not facet
        counts: this row answers how big the samling is, and a number that
        jittered while someone typed in the search box would answer nothing. */}
    {canFavorite && <section className="grep-rail-section">
      <h2 className="grep-rail-heading">Samlinger</h2>
      <ul className="grep-rail-list">
        {collections.map((collection) => <li key={collection.id}><RailOption
          label={collection.name}
          icon={Bookmark}
          count={collection.size}
          selected={sameShortlist(filters.shortlist, { kind: "collection", id: collection.id })}
          onSelect={() => chooseShortlist({ kind: "collection", id: collection.id })}
        /></li>)}
        {onNewCollection && <li><button type="button" onClick={onNewCollection} className="grep-rail-new"><Plus size={15} aria-hidden />Ny samling</button></li>}
        {/* Without this the group is a heading over nothing on a phone, where
            the create row is deliberately absent. */}
        {!collections.length && !onNewCollection && <li><p className="grep-rail-empty">Ingen samlinger ennå.</p></li>}
      </ul>
      {/* Two greyed rows on their own read as a bug, so the rail says whose
          list it is showing and how to get the taxonomy back. */}
      {shortlistName && <p className="grep-rail-note">Viser «{shortlistName}» i sin helhet. Fjern den for å filtrere på alder og tema.</p>}
    </section>}

    <section className={cn("grep-rail-section", narrowed && "is-off")}>
      {/* A coach coaches one team at one age, so this narrows rather than
          unions: picking a band replaces the one before it. */}
      <h2 className="grep-rail-heading">Alder</h2>
      <ul className="grep-rail-list">
        <li><RailOption label="Alle aldre" count={counts.allAgeGroups} selected={ages.length === 0} disabled={narrowed} onSelect={() => onChange({ ageGroups: [] })} /></li>
        {EXERCISE_AGE_GROUPS.map((group) => <li key={group}><RailOption
          label={formatAgeGroup(group)}
          tone={bandTone[group]}
          count={counts.ageGroups[group]}
          selected={ages.includes(group)}
          disabled={narrowed}
          // Said once, on the band it explains: a coach who opens the library
          // already narrowed should be able to see why.
          note={group === suggested ? "laget ditt" : undefined}
          onSelect={() => onChange({ ageGroups: ages.length === 1 && ages[0] === group ? [] : [group] })}
        /></li>)}
      </ul>
    </section>

    <section className={cn("grep-rail-section", narrowed && "is-off")}>
      {/* Topics union: "angrep or skudd" is how a coach looks for an idea. */}
      <h2 className="grep-rail-heading">Tema</h2>
      <ul className="grep-rail-list">
        <li><RailOption label="Alle tema" count={counts.allCategories} selected={filters.categories.length === 0} disabled={narrowed} onSelect={() => onChange({ categories: [] })} /></li>
        {EXERCISE_CATEGORIES.map((category) => <li key={category}><RailOption
          label={category}
          icon={categoryPresentation[category].icon}
          tone={categoryPresentation[category].tone}
          count={counts.categories[category]}
          selected={filters.categories.includes(category)}
          disabled={narrowed}
          onSelect={() => onChange({ categories: toggleFilterValue(filters.categories, category as ExerciseCategory, EXERCISE_CATEGORIES) })}
        /></li>)}
      </ul>
    </section>
  </div>;
}

/**
 * One line of the rail. `depth` is where a nested topic will indent from; it is
 * always 0 while the taxonomy is flat. `tone` is the hue this row's value wears
 * as a tag on a card, handed to the CSS as `--rail-tint`: a chosen topic or band
 * should look in the rail like what it then picks out of the grid. A row that
 * stands for the absence of a choice passes none and keeps the brand lilac.
 */
function RailOption({ label, icon: Icon, tone, count, selected, note, depth = 0, disabled = false, onSelect }: {
  label: string;
  icon?: typeof Heart;
  tone?: TagTone;
  count: number;
  selected: boolean;
  note?: string;
  depth?: number;
  /** Suspended by a chosen shortlist: still readable, no longer clickable. */
  disabled?: boolean;
  onSelect(): void;
}) {
  // A selected row stays live however empty it is, or a filter that emptied
  // itself could never be taken off again.
  const empty = !selected && count === 0;
  const style: CSSProperties = {
    ...(depth ? { paddingLeft: `${12 + depth * 14}px` } : null),
    ...(tone ? { "--rail-tint": tagTones[tone].tint, "--rail-tint-ink": tagTones[tone].ink } as CSSProperties : null),
  };
  return <button
    type="button"
    aria-pressed={selected}
    // Without this the row is announced as "Alle tema nine" — the count runs
    // straight into the label, and the note explaining a band nobody chose is
    // never read at all.
    aria-label={`${label} — ${count} ${count === 1 ? "øvelse" : "øvelser"}${note ? `, ${note}` : ""}`}
    disabled={disabled}
    // An empty topic keeps its place and its count — that number is the whole
    // answer to "why is the grid empty" — but it leads nowhere, so it stops
    // acting. `aria-disabled` rather than the attribute, which is spoken for by
    // the suspension above and would also take the row out of the reading
    // order that makes the count worth keeping.
    aria-disabled={empty || undefined}
    onClick={() => { if (!empty) onSelect(); }}
    className={cn("grep-rail-option", selected && "is-on", empty && "is-empty")}
    style={style}
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
export function ActiveExerciseFilters({ filters, shortlistLabel, onChange, onReset }: {
  filters: ExerciseFilterState;
  /** What the chosen shortlist is called — «Favoritter», or the samling's name. */
  shortlistLabel: string | null;
  onChange(patch: Partial<ExerciseFilterState>): void;
  onReset(): void;
}) {
  const chips: Array<{ key: string; label: string; clear(): void }> = [
    ...(filters.query.trim() ? [{ key: "q", label: `«${filters.query.trim()}»`, clear: () => onChange({ query: "" }) }] : []),
    ...filters.ageGroups.map((group) => ({ key: `age-${group}`, label: formatAgeGroup(group), clear: () => onChange({ ageGroups: filters.ageGroups.filter((entry) => entry !== group) }) })),
    ...filters.categories.map((category) => ({ key: `cat-${category}`, label: category, clear: () => onChange({ categories: filters.categories.filter((entry) => entry !== category) }) })),
    ...(shortlistLabel ? [{ key: "shortlist", label: shortlistLabel, clear: () => onChange({ shortlist: null }) }] : []),
  ];
  if (!chips.length) return null;
  return <div className="grep-active-filters">
    {chips.map((chip) => <button key={chip.key} type="button" onClick={chip.clear} aria-label={`Fjern filteret ${chip.label}`} className="grep-active-chip">{chip.label}<X size={13} /></button>)}
    <button type="button" onClick={onReset} className="grep-active-reset">Nullstill</button>
  </div>;
}
