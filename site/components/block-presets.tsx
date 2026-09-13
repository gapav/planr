import { Flag, Flame, LayoutGrid, Pencil, Target } from "lucide-react";
import type { SessionBlock } from "@/lib/types";

/**
 * What "Legg til bolk" offers, in the order an økt is actually built: warm up,
 * split into stations, gather the whole team, finish. Every entry carries the
 * same icon, name and line of explanation — the stations block needs saying out
 * loud, and one described entry among bare ones reads as the odd one out rather
 * than as the new one. `kind` is the only real difference between them: a
 * stations block runs its activities at once, the rest run them in turn.
 *
 * The icons are the blocks' identity, not decoration on a menu: the same icon
 * that added a block heads its card in the builder and in the read-only view,
 * so the plan can be read at a glance without reading the titles.
 */
export const blockPresets = [
  { title: "Oppvarming", description: "Gjør laget klart.", icon: Flame, kind: "sequence" },
  { title: "Stasjoner", description: "Øvelsene går samtidig, og laget roterer.", icon: LayoutGrid, kind: "stations" },
  { title: "Hoveddel", description: "Fellesøvelser for hele laget.", icon: Target, kind: "sequence" },
  { title: "Avslutning", description: "Fullfør økta, samling og beskjeder.", icon: Flag, kind: "sequence" },
] as const satisfies ReadonlyArray<{ title: string; description: string; icon: typeof LayoutGrid; kind: SessionBlock["kind"] }>;

/**
 * The icon heading one block's card. Stations are recognised by their kind —
 * the coach is free to rename the block "Skuddstasjoner" and it still runs in
 * parallel — while the rest are recognised by the preset name they were added
 * under, which is the only identity a sequence block has. Anything named by
 * hand falls back to the pencil that offered to name it.
 */
export function blockIcon(block: Pick<SessionBlock, "title" | "kind">) {
  if (block.kind === "stations") return LayoutGrid;
  const preset = blockPresets.find((entry) => entry.kind === "sequence" && entry.title.toLowerCase() === block.title.trim().toLowerCase());
  return preset?.icon ?? Pencil;
}

/** The icon as an element, so a card header does not have to name a component mid-render. */
export function blockGlyph(block: Pick<SessionBlock, "title" | "kind">, size = 18) {
  const Icon = blockIcon(block);
  return <Icon size={size} className="shrink-0 text-[var(--ink-soft)]" aria-hidden />;
}
