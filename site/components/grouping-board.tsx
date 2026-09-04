"use client";

import { GripVertical } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { movePlayerToGroup } from "@/lib/grouping";
import type { PlayerGroup, TeamPlayer } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button, Modal } from "./ui";

const DRAG_THRESHOLD_PX = 8;
const TOUCH_HOLD_MS = 250;

interface DragState { playerId: string; fromGroupId: string; pointerType: string; x: number; y: number; active: boolean }

/**
 * Hand adjustment of a generated draw. Dragging uses pointer events rather than
 * HTML5 drag-and-drop, which does not exist on touch: a mouse drag starts once
 * the pointer has moved, a finger has to rest on the player first so that an
 * ordinary swipe still scrolls the page. Tapping or activating a player from
 * the keyboard opens the same move as a list of groups.
 */
export function GroupingBoard({ groups, players, onMove }: { groups: PlayerGroup[]; players: TeamPlayer[]; onMove(next: PlayerGroup[]): void }) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [overGroupId, setOverGroupId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<{ playerId: string; groupId: string } | null>(null);
  const holdTimer = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const suppressClick = useRef(false);

  // touch-action cannot be flipped once a gesture is under way, so scrolling is
  // held off with a non-passive listener for exactly as long as a drag runs.
  useEffect(() => {
    if (!drag?.active) return;
    const block = (event: TouchEvent) => event.preventDefault();
    document.addEventListener("touchmove", block, { passive: false });
    return () => document.removeEventListener("touchmove", block);
  }, [drag?.active]);

  useEffect(() => () => { if (holdTimer.current) window.clearTimeout(holdTimer.current); }, []);

  function playerName(playerId: string) {
    return players.find((player) => player.id === playerId)?.fullName ?? "Fjernet spiller";
  }

  function clearHold() {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }

  function reset() {
    clearHold();
    setDrag(null);
    setOverGroupId(null);
  }

  function groupAt(x: number, y: number) {
    const element = document.elementFromPoint(x, y);
    return element?.closest?.("[data-group-id]")?.getAttribute("data-group-id") ?? null;
  }

  function beginPointer(event: React.PointerEvent<HTMLButtonElement>, playerId: string, groupId: string) {
    if (event.button > 0) return;
    origin.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ playerId, fromGroupId: groupId, pointerType: event.pointerType, x: event.clientX, y: event.clientY, active: false });
    if (event.pointerType !== "touch") return;
    clearHold();
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      setDrag((current) => (current ? { ...current, active: true } : current));
      setOverGroupId(groupId);
    }, TOUCH_HOLD_MS);
  }

  function movePointer(event: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const far = Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > DRAG_THRESHOLD_PX;
    if (!drag.active) {
      // The finger left before the hold finished: that is a scroll, not a drag.
      if (drag.pointerType === "touch") { if (far) reset(); return; }
      if (!far) return;
    }
    setDrag({ ...drag, active: true, x: event.clientX, y: event.clientY });
    setOverGroupId(groupAt(event.clientX, event.clientY));
  }

  function endPointer(event: React.PointerEvent<HTMLButtonElement>) {
    clearHold();
    if (drag?.active) {
      suppressClick.current = true;
      const targetId = groupAt(event.clientX, event.clientY) ?? overGroupId;
      if (targetId && targetId !== drag.fromGroupId) {
        const next = movePlayerToGroup(groups, drag.playerId, targetId);
        if (next !== groups) onMove(next);
      }
    }
    reset();
  }

  function openMenu(playerId: string, groupId: string) {
    if (suppressClick.current) { suppressClick.current = false; return; }
    setMenuFor({ playerId, groupId });
  }

  function moveTo(targetGroupId: string) {
    if (!menuFor) return;
    const next = movePlayerToGroup(groups, menuFor.playerId, targetGroupId);
    if (next !== groups) onMove(next);
    setMenuFor(null);
  }

  return <div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{groups.map((group) => {
      const isTarget = Boolean(drag?.active) && overGroupId === group.id && drag?.fromGroupId !== group.id;
      return <article key={group.id} data-group-id={group.id} className={cn("rounded-2xl border bg-white p-4 transition", isTarget ? "border-[var(--orange)] bg-[#fff6f1] shadow-[0_8px_24px_rgba(240,100,46,.15)]" : "border-[var(--line)]")}>
        <div className="flex items-baseline justify-between gap-2"><p className="text-xs font-black uppercase tracking-[.09em] text-[var(--ink-soft)]">{group.label}</p><span className="text-xs font-bold text-[var(--ink-soft)]">{group.playerIds.length} spillere</span></div>
        <ul className="mt-2.5 grid gap-1.5">
          {group.playerIds.map((playerId) => <li key={playerId}>
            <button
              type="button"
              aria-label={`${playerName(playerId)} i ${group.label} — flytt til en annen gruppe`}
              onPointerDown={(event) => beginPointer(event, playerId, group.id)}
              onPointerMove={movePointer}
              onPointerUp={endPointer}
              onPointerCancel={reset}
              onClick={() => openMenu(playerId, group.id)}
              className={cn("flex w-full select-none items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-sm font-bold transition", drag?.active && drag.playerId === playerId ? "border-dashed border-[#c8c3b7] bg-[var(--paper)] opacity-45" : "border-transparent hover:border-[var(--line)] hover:bg-[var(--paper)]")}
            >
              <GripVertical size={15} className="shrink-0 text-[var(--ink-soft)]" />
              <span className="min-w-0 flex-1 truncate">{playerName(playerId)}</span>
            </button>
          </li>)}
          {!group.playerIds.length && <li className="rounded-xl border border-dashed border-[#c8c3b7] px-3 py-5 text-center text-xs font-semibold text-[var(--ink-soft)]">Ingen spillere her ennå</li>}
        </ul>
      </article>;
    })}</div>

    {drag?.active && <div aria-hidden className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--ink)] bg-white px-3 py-2 text-sm font-bold shadow-[0_14px_34px_rgba(16,32,29,.28)]" style={{ left: drag.x, top: drag.y }}>{playerName(drag.playerId)}</div>}

    <Modal open={Boolean(menuFor)} onClose={() => setMenuFor(null)} title="Flytt spiller" description={menuFor ? `Velg hvor ${playerName(menuFor.playerId)} skal være.` : undefined} size="sm">
      <div className="grid gap-2">{groups.map((group) => <Button key={group.id} variant="secondary" className="justify-between" disabled={group.id === menuFor?.groupId} onClick={() => moveTo(group.id)}>
        <span>{group.label}</span>
        <span className="text-xs font-semibold text-[var(--ink-soft)]">{group.id === menuFor?.groupId ? "Er her nå" : `${group.playerIds.length} spillere`}</span>
      </Button>)}</div>
    </Modal>
  </div>;
}
