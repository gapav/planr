"use client";

import { Bookmark, BookmarkCheck, Check, Heart, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useGrep } from "./app-provider";
import { FilterChipGroup } from "./filter-chips";
import { Button, Field, Modal, inputClass } from "./ui";
import { useDismissable } from "@/hooks/use-dismissable";
import { collectionNameError, collectionsForTeam } from "@/lib/collections";
import { FAVORITES_SHORTLIST_PARAM, sameShortlist, shortlistExerciseIds, type ExerciseShortlist } from "@/lib/exercises";
import { COLLECTION_NAME_MAX_LENGTH, type ExerciseCollection } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Samlinger: the named shortlists a coaching team keeps over the øvelsesbank.
 *
 * Everything that writes one lives here — the bookmark on a card, the dialog
 * that names one, and the strip that manages the one being read through — so
 * the library page, the exercise view and the two pickers can each borrow the
 * piece they need without owning any of the wiring.
 *
 * Favoritter is deliberately not part of this: a heart is private to the coach
 * and a samling belongs to the team, so they are two controls on a card even
 * though the rail offers them as one choice.
 */

/** Everything the bookmark needs to know about a samling, in one place. */
function useTeamCollections() {
  const { collections, currentTeam } = useGrep();
  return useMemo(() => collectionsForTeam(collections, currentTeam?.id), [collections, currentTeam]);
}

/**
 * The one control in the corner of an exercise card: where this exercise is
 * kept, and the only place to change it.
 *
 * It was briefly two circles — a heart and a bookmark — and two round buttons
 * over a thumbnail is one too many for a grid a coach scans. So the heart moved
 * inside: the trigger says *whether* the exercise is kept anywhere, the menu
 * says *where*, and Favoritter is simply its first row.
 *
 * The rows are checkboxes rather than menu items because membership is a set of
 * independent answers — an exercise belongs in «Oktober 2026 fokus» and in
 * «Kantspill» at once — so the menu stays open until it is dismissed and ticking
 * three costs three clicks rather than three open-and-close cycles.
 *
 * The two halves stay visibly different, because they are: a heart is private to
 * the coach, a samling belongs to the whole coaching team, and the row notes say
 * so rather than leaving a coach to guess which of their ticks their colleagues
 * can see.
 */
export function ShortlistMenu({ exerciseId, exerciseName, labelled = false, className }: {
  exerciseId: string;
  exerciseName: string;
  /**
   * A pill with words instead of the circle the card corner wears. The corner
   * sits on a thumbnail where a bare icon reads fine; in the exercise view the
   * control stands in a column of text and has to say what it does.
   */
  labelled?: boolean;
  className?: string;
}) {
  const { user, currentTeam, favoriteExerciseIds, toggleFavoriteExercise, toggleCollectionExercise, createCollection } = useGrep();
  const collections = useTeamCollections();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [creating, setCreating] = useState(false);
  const closeTimer = useRef<number | null>(null);
  useEffect(() => () => { if (closeTimer.current) window.clearTimeout(closeTimer.current); }, []);

  // Closing plays out before the menu leaves the tree. The unmount is on a
  // timer rather than on `animationend`, which never fires when the reader asks
  // for reduced motion and would leave the menu open for good.
  const close = useCallback(() => {
    setClosing(true);
    closeTimer.current = window.setTimeout(() => { setOpen(false); setClosing(false); }, 130);
  }, []);
  useDismissable(open && !closing, `[data-shortlist-menu="${exerciseId}"]`, close, () => document.getElementById(`shortlist-button-${exerciseId}`)?.focus());

  // The library is readable signed out, and there is nothing to keep it in.
  if (!user) return null;

  const favorited = favoriteExerciseIds.includes(exerciseId);
  // A coach between teams still has their own hearts; only the shared half of
  // the menu needs a team to belong to.
  const holding = currentTeam ? collections.filter((collection) => collection.exerciseIds.includes(exerciseId)) : [];
  const kept = favorited || holding.length > 0;
  // The glyph answers with the strongest fact it has, so a hearted exercise
  // still reads as one at a glance from across the grid.
  const Icon = favorited ? Heart : kept ? BookmarkCheck : Bookmark;

  let rowIndex = 0;
  const staggered = () => ({ animationDelay: `${Math.min(rowIndex++ * 22, 130)}ms` });

  return <span data-shortlist-menu={exerciseId} className={cn("relative", className)}>
    <button
      type="button"
      id={`shortlist-button-${exerciseId}`}
      aria-expanded={open}
      aria-haspopup="true"
      aria-label={kept ? `${exerciseName} er lagret. Endre favoritter og samlinger` : `Lagre ${exerciseName} i favoritter eller en samling`}
      onClick={() => open ? close() : setOpen(true)}
      className={cn("transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--orange)]",
        labelled
          ? "inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--line)] bg-white px-4 text-sm font-bold hover:border-[var(--ink)]"
          : "grid h-10 w-10 place-items-center rounded-full bg-white/90 shadow-md backdrop-blur hover:scale-105 hover:bg-white",
        kept ? "text-[var(--orange)]" : "text-[var(--ink-soft)]")}
    >
      <Icon size={18} fill={favorited ? "currentColor" : "none"} />
      {labelled && <span>{kept ? "Lagret" : "Lagre øvelsen"}</span>}
    </button>

    {open && <div
      role="menu"
      aria-label={`Lagre ${exerciseName}`}
      className={cn("grep-pop absolute z-20 w-64 rounded-2xl border border-[var(--line)] bg-white p-1.5 text-left shadow-xl",
        closing && "is-closing", labelled ? "grep-pop-left left-0 top-[52px]" : "right-0 top-12")}
    >
      <ShortlistRow
        label="Favoritter"
        note="privat"
        icon={Heart}
        checked={favorited}
        style={staggered()}
        onToggle={() => void toggleFavoriteExercise(exerciseId).catch(() => undefined)}
      />

      {/* A group rather than a run of rows after a heading: the heading is the
          group's name, so a screen reader says "hele laget" once instead of on
          every samling — and the rows stay the menu's own children. */}
      {currentTeam && <div role="group" aria-label="Samlinger — hele laget">
        <p aria-hidden="true" className="grep-pop-row mt-1.5 border-t border-[var(--line)] px-2.5 pb-1 pt-2 text-[10px] font-black uppercase tracking-[.09em] text-[var(--ink-soft)]" style={staggered()}>Samlinger · hele laget</p>
        {collections.length > 0 && <ul role="none" className="max-h-56 overflow-y-auto thin-scrollbar">
          {collections.map((collection) => <li role="none" key={collection.id}><ShortlistRow
            label={collection.name}
            icon={Bookmark}
            checked={collection.exerciseIds.includes(exerciseId)}
            style={staggered()}
            onToggle={() => void toggleCollectionExercise(collection.id, exerciseId).catch(() => undefined)}
          /></li>)}
        </ul>}
        {!collections.length && <p className="grep-pop-row px-2.5 pb-1 text-sm leading-5 text-[var(--ink-soft)]" style={staggered()}>Ingen samlinger ennå. Lag én for det dere jobber med nå.</p>}
        <button type="button" role="menuitem" onClick={() => setCreating(true)} className="grep-pop-row mt-0.5 flex w-full items-center gap-2 rounded-xl px-2.5 py-2.5 text-left text-sm font-black hover:bg-black/5" style={staggered()}>
          <Plus size={15} />Ny samling
        </button>
      </div>}
    </div>}

    {/* Created from here, the samling is made *for* this exercise, so the new
        one is filled in the same gesture rather than leaving the coach to tick
        it themselves. */}
    <CollectionDialog
      open={creating}
      onClose={() => setCreating(false)}
      onSubmit={async (name) => {
        const id = await createCollection(name);
        await toggleCollectionExercise(id, exerciseId);
      }}
    />
  </span>;
}

/** One tickable place to keep an exercise: the heart, or a samling. */
function ShortlistRow({ label, note, icon: Icon, checked, style, onToggle }: {
  label: string;
  note?: string;
  icon: typeof Heart;
  checked: boolean;
  style?: CSSProperties;
  onToggle(): void;
}) {
  return <button
    type="button"
    role="menuitemcheckbox"
    aria-checked={checked}
    aria-label={note ? `${label} — ${note}` : label}
    onClick={onToggle}
    style={style}
    className="grep-pop-row flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-semibold hover:bg-black/5"
  >
    <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-md border transition", checked ? "border-[var(--orange)] bg-[var(--orange)] text-white" : "border-[var(--line)] bg-white")}>
      {checked && <Check size={13} strokeWidth={3} />}
    </span>
    <Icon size={15} className={cn("shrink-0", checked ? "text-[var(--orange)]" : "text-[var(--ink-soft)]")} fill={checked && Icon === Heart ? "currentColor" : "none"} />
    <span className="min-w-0 flex-1 truncate">{label}</span>
    {note && <span className="shrink-0 text-[10px] font-bold uppercase tracking-[.06em] text-[var(--ink-soft)]">{note}</span>}
  </button>;
}

/**
 * Naming a samling, new or renamed. The refusal is worked out from the team's
 * other samlinger before anything is sent, because the uniqueness that would
 * otherwise answer is a Postgres index and its error is not a sentence.
 */
export function CollectionDialog({ open, collection, onClose, onSubmit }: {
  open: boolean;
  /** The samling being renamed; absent when one is being made. */
  collection?: Pick<ExerciseCollection, "id" | "name"> | null;
  onClose(): void;
  onSubmit(name: string): Promise<void>;
}) {
  const collections = useTeamCollections();
  const [value, setValue] = useState(collection?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The dialog is mounted before it is opened, so the field has to follow the
  // samling it is opened on rather than keep the first one it ever saw.
  const [stored, setStored] = useState(collection?.id ?? null);
  if ((collection?.id ?? null) !== stored) { setStored(collection?.id ?? null); setValue(collection?.name ?? ""); }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const refusal = collectionNameError(value, collections, collection?.id);
    if (refusal) { setError(refusal); return; }
    setBusy(true); setError(null);
    try {
      await onSubmit(value);
      if (!collection) setValue("");
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Samlingen kunne ikke lagres.");
    } finally { setBusy(false); }
  }

  return <Modal
    open={open}
    onClose={onClose}
    size="sm"
    title={collection ? "Gi samlingen nytt navn" : "Ny samling"}
    description={collection ? undefined : "En samling er en snarvei til øvelsene dere jobber med nå. Hele trenerteamet ser den."}
  >
    <form className="grid gap-4" onSubmit={(event) => void save(event)}>
      <Field label="Navn" htmlFor="collection-name" hint={`Høyst ${COLLECTION_NAME_MAX_LENGTH} tegn`}>
        <input
          id="collection-name"
          className={inputClass}
          value={value}
          maxLength={COLLECTION_NAME_MAX_LENGTH}
          onChange={(event) => { setValue(event.target.value); setError(null); }}
          placeholder="Oktober 2026 fokus"
          autoFocus
        />
      </Field>
      {error && <p role="alert" className="text-sm font-semibold text-[var(--danger)]">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>Avbryt</Button>
        <Button type="submit" disabled={busy}>{busy ? "Lagrer …" : collection ? "Lagre navnet" : "Lag samling"}</Button>
      </div>
    </form>
  </Modal>;
}

/**
 * The samling the library is being read through, above the grid it explains.
 *
 * Renaming and deleting live here rather than on the rail rows: a menu button
 * on every row is either hidden behind a hover a phone does not have, or always
 * visible and turning a quiet list of counts into a column of controls. This
 * appears only for the samling actually in use, which is also the only one a
 * coach is thinking about.
 */
export function SelectedCollectionBar({ collection, onDeleted }: { collection: ExerciseCollection; onDeleted(): void }) {
  const { renameCollection, deleteCollection } = useGrep();
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  useDismissable(menuOpen, "[data-collection-manage]", () => setMenuOpen(false), () => document.getElementById("collection-manage")?.focus());

  const size = collection.exerciseIds.length;
  return <div className="mt-4 flex items-center gap-4 rounded-[20px] border border-[var(--line)] bg-[var(--paper)] px-5 py-4">
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-[var(--orange)] shadow-sm"><Bookmark size={20} /></span>
    <div className="min-w-0 flex-1">
      <p className="truncate text-[15px] font-black">{collection.name}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">{size} {size === 1 ? "øvelse" : "øvelser"} · hele trenerteamet ser samlingen</p>
    </div>
    <span data-collection-manage className="relative shrink-0">
      <Button variant="ghost" size="sm" className="px-2" id="collection-manage" aria-expanded={menuOpen} aria-label={`Valg for ${collection.name}`} onClick={() => setMenuOpen(!menuOpen)}><MoreHorizontal size={19} /></Button>
      {menuOpen && <div className="absolute right-0 z-10 w-44 rounded-xl border border-[var(--line)] bg-white p-1.5 text-sm font-semibold shadow-xl">
        <button type="button" className="w-full rounded-lg px-3 py-2 text-left hover:bg-black/5" onClick={() => { setMenuOpen(false); setRenaming(true); }}>Gi nytt navn</button>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[var(--danger)] hover:bg-red-50"
          onClick={() => {
            // Only the samling goes: the exercises in it are the shared library
            // and are not touched, which is what the wording has to promise
            // before a coach can say yes to this.
            if (!confirm(`Vil du slette samlingen «${collection.name}»? Øvelsene blir liggende i øvelsesbanken.`)) return;
            setMenuOpen(false);
            void deleteCollection(collection.id).then(onDeleted).catch(() => undefined);
          }}
        ><Trash2 size={15} />Slett samling</button>
      </div>}
    </span>
    <CollectionDialog
      open={renaming}
      collection={collection}
      onClose={() => setRenaming(false)}
      onSubmit={(name) => renameCollection(collection.id, name)}
    />
  </div>;
}

/**
 * The exercises one chosen shortlist stands for, for a picker that keeps its own
 * filter state. The library page resolves this itself because it also has to
 * survive a page load with the choice in the URL; a dialog has neither problem.
 */
export function useShortlistIds(shortlist: ExerciseShortlist | null): ReadonlySet<string> | null {
  const { favoriteExerciseIds } = useGrep();
  const collections = useTeamCollections();
  return useMemo(() => shortlistExerciseIds(shortlist, favoriteExerciseIds, collections), [shortlist, favoriteExerciseIds, collections]);
}

/**
 * Favoritter and the team's samlinger as a row of chips, for the two places a
 * coach adds an exercise to a plan.
 *
 * This is the whole point of the feature: curating a shortlist in the library
 * is worth nothing if it is invisible at the moment the session is being built.
 * Single-select for the same reason the rail is — one shortlist answers "what
 * am I working from" — and absent entirely for a coach with neither, so a
 * picker nobody has curated for looks exactly as it did before.
 */
export function ShortlistChips({ value, onChange }: { value: ExerciseShortlist | null; onChange(next: ExerciseShortlist | null): void }) {
  const { user, favoriteExerciseIds } = useGrep();
  const collections = useTeamCollections();
  if (!user || (!favoriteExerciseIds.length && !collections.length)) return null;

  const chips = [
    { key: FAVORITES_SHORTLIST_PARAM, label: "Favoritter", icon: Heart, count: favoriteExerciseIds.length, pressed: value?.kind === "favorites" },
    ...collections.map((collection) => ({
      key: collection.id,
      label: collection.name,
      icon: Bookmark,
      count: collection.exerciseIds.length,
      pressed: value?.kind === "collection" && value.id === collection.id,
    })),
  ];

  // A shortlist is a list somebody wrote down on purpose, so the picker shows it
  // whole: the topic and age rows go quiet while it stands (`ExercisePicker`
  // clears and disables them), and this line says so, because a row of dimmed
  // chips on its own reads like a bug rather than a decision.
  const chosen = chips.find((chip) => chip.pressed);

  return <div className="grid gap-2">
    <FilterChipGroup label="Filtrer på favoritter og samlinger" chips={chips} onToggle={(key) => {
      const picked: ExerciseShortlist = key === FAVORITES_SHORTLIST_PARAM ? { kind: "favorites" } : { kind: "collection", id: key };
      onChange(sameShortlist(value, picked) ? null : picked);
    }} />
    {chosen && <p className="text-xs font-semibold text-[var(--ink-soft)]">Viser «{chosen.label}» — fjern den for å filtrere på tema og alder.</p>}
  </div>;
}
