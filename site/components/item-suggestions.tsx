"use client";

import { ArrowLeftRight, Lightbulb, Undo2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useGrep } from "./app-provider";
import { ExerciseDetail } from "./exercise-detail";
import { ExercisePicker } from "./exercise-picker";
import { ExerciseThumbnail } from "./exercise-thumbnail";
import { Avatar, Button, Tag } from "./ui";
import { canSuggestOnItem, ownSuggestion, suggestionCountLabel, suggestionsForItem, type SuggestionView } from "@/lib/suggestions";
import type { Exercise, PlannedSession, Profile, SessionItem } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The suggestions on one activity's card (decisions 14 and 15), in the plan
 * view and the builder alike: what coaches on the team have suggested for it,
 * each with what they can do about it.
 *
 * Making one is an editing action, so only the builder offers it — from the
 * activity's ⋮ menu, which owns `picking` and hands it here: this component
 * mounts the picker because it knows one's own earlier suggestion to pre-fill.
 * The plan view passes no `picking`, so it never opens.
 *
 * Nothing here prints (`data-print="hide"`), and the live session never
 * renders it: suggestions are the plan's conversation, not the plan.
 *
 * `readOnly` is a global admin reading another team's plan: the suggestions
 * show, and nothing can be done with them.
 */
export function ItemSuggestions({ session, item, members, readOnly = false, picking = false, onClosePicker, className }: {
  session: PlannedSession;
  item: SessionItem;
  members: readonly Profile[];
  readOnly?: boolean;
  /** The picker in suggest mode is open (the builder's «Foreslå alternativ»). */
  picking?: boolean;
  onClosePicker?(): void;
  className?: string;
}) {
  const { user, exercises, suggestAlternative, acceptSuggestion, dismissSuggestion } = useGrep();
  const [preview, setPreview] = useState<Exercise | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const library = useMemo(() => new Map((exercises ?? []).map((exercise) => [exercise.id, exercise])), [exercises]);
  const views = suggestionsForItem(item, { session, library, members, userId: user?.id ?? null, canAct: !readOnly && Boolean(user) });
  const canSuggest = picking && !readOnly && Boolean(user) && canSuggestOnItem(item, session);
  if (!views.length && !canSuggest) return null;
  const mine = ownSuggestion(item, user?.id ?? null);

  async function act(id: string, action: () => Promise<void>) {
    setBusy(id);
    // A refusal is the provider's to report; the suggestion is back on screen.
    try { await action(); } catch { /* shown as the notice */ } finally { setBusy(null); }
  }

  return <div data-print="hide" className={cn("grid gap-2", className)}>
    {views.length > 0 && <span className="inline-flex items-center gap-1.5 justify-self-start rounded-full bg-[var(--accent-fill)] px-2.5 py-1 text-xs font-black text-[var(--on-accent)]"><Lightbulb size={13} aria-hidden />{suggestionCountLabel(views.length)}</span>}
    {views.length > 0 && <ul aria-label={`Forslag til ${item.title}`} className="grid gap-2">
      {views.map((view) => <li key={view.suggestion.id}><SuggestionRow view={view} busy={busy === view.suggestion.id} onPreview={() => view.exercise && setPreview(view.exercise)}
        onAccept={() => void act(view.suggestion.id, () => acceptSuggestion(session.id, view.suggestion.id))}
        onDismiss={() => void act(view.suggestion.id, () => dismissSuggestion(session.id, view.suggestion.id))} /></li>)}
    </ul>}
    {canSuggest && <ExercisePicker open sessionId={session.id} blockId={null} blockTitle="" teamId={session.teamId} onClose={() => onClosePicker?.()}
      suggest={{ itemTitle: item.title, currentExerciseId: item.exerciseId, initialExerciseId: mine?.exerciseId ?? null, initialComment: mine?.comment ?? "", onSubmit: (exercise, comment) => suggestAlternative(session.id, item.id, exercise, comment) }} />}
    <ExerciseDetail key={preview?.id ?? "none"} exercise={preview} exerciseId={preview && !preview.archivedAt ? preview.id : null} onClose={() => setPreview(null)} />
  </div>;
}

/**
 * One suggestion: the alternative (thumbnail and title, opening the exercise),
 * who suggested it and why, and the actions this coach has on it.
 */
function SuggestionRow({ view, busy, onPreview, onAccept, onDismiss }: { view: SuggestionView; busy: boolean; onPreview(): void; onAccept(): void; onDismiss(): void }) {
  const { suggestion, exercise, suggester } = view;
  const name = exercise?.name ?? "Øvelsen er slettet";
  const by = suggester?.fullName ?? "en tidligere trener";
  return <div className="grid grid-cols-[48px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-xl border border-[var(--lilac-line)] bg-[var(--lilac-wash)] p-2.5 sm:grid-cols-[56px_minmax(0,1fr)_auto] sm:items-center">
    <button type="button" onClick={onPreview} disabled={!exercise} aria-label={`Vis ${name}`} className="relative h-10 w-12 overflow-hidden rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:h-11 sm:w-14">
      {exercise ? <ExerciseThumbnail exercise={exercise} className="h-full w-full" /> : <span className="block h-full w-full bg-[var(--paper-deep)]" />}
    </button>
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1"><button type="button" onClick={onPreview} disabled={!exercise} className="text-left text-[var(--ink)] hover:underline disabled:no-underline"><span className="text-sm font-black leading-5 [overflow-wrap:anywhere]">{name}</span></button>{view.archived && <Tag>Arkivert</Tag>}</p>
      <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-[var(--ink-soft)]">{suggester && <Avatar name={suggester.fullName} initials={suggester.initials} color={suggester.color} size="sm" />}<span className="min-w-0 truncate">Foreslått av {by}</span></p>
      {suggestion.comment && <p className="mt-1 text-sm leading-5 text-[var(--ink)] [overflow-wrap:anywhere]">«{suggestion.comment}»</p>}
    </div>
    {(view.canAccept || view.canDismiss || view.canWithdraw) && <div className="col-span-2 flex flex-wrap justify-end gap-1.5 sm:col-span-1">
      {view.canAccept && <Button size="sm" onClick={onAccept} disabled={busy} aria-label={`Bytt til ${name}`}><ArrowLeftRight size={15} aria-hidden />Bytt</Button>}
      {view.canDismiss && <Button size="sm" variant="ghost" onClick={onDismiss} disabled={busy} aria-label={`Avvis forslaget fra ${by}`}><X size={15} aria-hidden />Avvis</Button>}
      {view.canWithdraw && <Button size="sm" variant="ghost" onClick={onDismiss} disabled={busy} aria-label="Trekk tilbake forslaget ditt"><Undo2 size={15} aria-hidden />Trekk tilbake</Button>}
    </div>}
  </div>;
}
