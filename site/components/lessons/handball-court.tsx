"use client";

import { useId, type CSSProperties, type KeyboardEvent, type PointerEvent, type Ref } from "react";
import type { Point, Role, Zone } from "@/lib/lessons/utgruppert-forsvar";
import { cn } from "@/lib/utils";

/**
 * A top-down half court for Håndballskolen, goal at the top. Positions are in
 * metres (20 × 17) and drawn ×10 into a fixed viewBox, so a lesson only ever
 * thinks in metres. The court draws what it is given — pieces, zones, lines —
 * and owns no lesson state; moves animate because each piece's `transform` is
 * a CSS transition (`.court-piece` in globals.css), which
 * `prefers-reduced-motion` switches off.
 *
 * Every colour is a token: the court's own `--court-*`, the role fills, and
 * `--chrome` for the opponents.
 */
export type CourtPiece = {
  id: string;
  kind: "defender" | "attacker" | "keeper";
  role?: Role;
  label: string;
  at: Point;
  /** A word above the piece: «Deg», «Ny!», «Målvakt». */
  caption?: string;
  /** A ring around it: dashed for «utenfor 9 m», solid to single it out. */
  ring?: "dashed" | "solid";
  /** A dashed edge: a player standing in for someone else. */
  dashedEdge?: boolean;
  dim?: boolean;
  hidden?: boolean;
  /** Milliseconds for the move to `at`, and how long to wait before it. */
  duration?: number;
  delay?: number;
  onActivate?: () => void;
  /** Makes the piece a keyboard stop with this name. */
  buttonLabel?: string;
  onKeyDown?: (event: KeyboardEvent<SVGGElement>) => void;
};

export type CourtLine = { id: string; from: Point; to: Point };

export type HandballCourtProps = {
  label: string;
  pieces: readonly CourtPiece[];
  /** `focus` outlines a zone; `dim` fades it while another role is in focus. */
  zones?: readonly (Zone & { dim?: boolean; focus?: boolean })[];
  /** Pass lines that fade out on their own. */
  passes?: readonly CourtLine[];
  /** An arrow for a run, as an SVG path in court units. */
  run?: string;
  ball?: { at: Point; duration?: number } | null;
  /** A dashed line from where a player stands to where they should stand.
   *  Its label sits under the ring, so it never lands on the player's own. */
  guide?: { from: Point; to: Point; label: string } | null;
  /** Thickens the 9 m line. */
  highlightNine?: boolean;
  className?: string;
  style?: CSSProperties;
  svgRef?: Ref<SVGSVGElement>;
  onPointerDown?: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerMove?: (event: PointerEvent<SVGSVGElement>) => void;
};

const u = (metres: number) => metres * 10;
/** Defenders are the subject, so they are the biggest thing on the court. */
const PIECE_RADIUS = { defender: 9.5, attacker: 7.6, keeper: 7.6 } as const;
const EASE = "cubic-bezier(.45, 0, .55, 1)";
const place = ([x, y]: Point) => `translate(${u(x)}px, ${u(y)}px)`;

export function HandballCourt({ label, pieces, zones = [], passes = [], run, ball, guide, highlightNine, className, style, svgRef, onPointerDown, onPointerMove }: HandballCourtProps) {
  const id = useId().replace(/:/g, "");
  const net = `${id}-net`, clip = `${id}-clip`, arrow = `${id}-arrow`;
  const order = { attacker: 0, defender: 1, keeper: 1 } as const;
  const sorted = [...pieces].sort((a, b) => order[a.kind] - order[b.kind]);
  // An image's children are hidden from assistive tech, so a court with
  // pieces to press is a group instead.
  const interactive = pieces.some((piece) => piece.buttonLabel);

  return <svg ref={svgRef} className={cn("handball-court", className)} style={style} viewBox="-4 -12 208 168" role={interactive ? "group" : "img"} aria-label={label} onPointerDown={onPointerDown} onPointerMove={onPointerMove}>
    <defs>
      <pattern id={net} width="3" height="3" patternUnits="userSpaceOnUse"><path d="M0 0H3M0 0V3" stroke="var(--court-net)" strokeWidth=".5" /></pattern>
      <clipPath id={clip}><rect x="0" y="0" width="200" height="170" /></clipPath>
      <marker id={arrow} viewBox="0 0 6 6" refX="4" refY="3" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L6 3L0 6Z" fill="var(--court-ring)" /></marker>
    </defs>
    <rect x="-4" y="-12" width="208" height="168" fill="var(--court-ground)" />
    <rect x="0" y="0" width="200" height="170" fill="var(--court-floor)" />
    <path d="M25 0A60 60 0 0 0 85 60H115A60 60 0 0 0 175 0Z" fill="var(--court-area)" />
    <path d="M25 0A60 60 0 0 0 85 60H115A60 60 0 0 0 175 0" fill="none" stroke="var(--court-marking)" strokeWidth="1" />
    <path className="court-nine" data-highlight={highlightNine || undefined} d="M-5 0A90 90 0 0 0 85 90H115A90 90 0 0 0 205 0" fill="none" stroke="var(--court-marking)" strokeDasharray="4 3" clipPath={`url(#${clip})`} />
    <path d="M0 170V0H200V170" fill="none" stroke="var(--court-marking)" strokeWidth="1" />
    <path d="M95 70H105" stroke="var(--court-marking)" strokeWidth="1" />
    <rect x="85" y="-8" width="30" height="8" fill={`url(#${net})`} />
    <path d="M85 0V-8H115V0" fill="none" stroke="var(--court-marking)" strokeWidth="2.2" />
    <path d="M85 0V-8H115V0" fill="none" stroke="var(--court-goal)" strokeWidth="2.2" strokeDasharray="3 3" />
    <text className="court-distance" x="141" y="38">6 m</text>
    <text className="court-distance" x="181" y="80">9 m</text>

    <g aria-hidden="true">{zones.map((zone, index) => {
      const className = cn("court-zone", `court-zone-${zone.role}`, zone.dim && "is-dim", zone.focus && "is-focus");
      if (zone.shape === "circle") return <circle key={index} className={className} cx={u(zone.cx)} cy={u(zone.cy)} r={u(zone.r)} />;
      if (zone.shape === "ellipse") return <ellipse key={index} className={className} cx={u(zone.cx)} cy={u(zone.cy)} rx={u(zone.rx)} ry={u(zone.ry)} />;
      return <rect key={index} className={className} x={u(zone.x1)} y={u(zone.y1)} width={u(zone.x2 - zone.x1)} height={u(zone.y2 - zone.y1)} rx="8" />;
    })}</g>

    <g aria-hidden="true">
      {run && <path className="court-run" d={run} markerEnd={`url(#${arrow})`} />}
      {passes.map((line) => <line key={line.id} className="court-pass" x1={u(line.from[0])} y1={u(line.from[1])} x2={u(line.to[0])} y2={u(line.to[1])} />)}
    </g>

    {sorted.map((piece) => <g
      key={piece.id}
      data-piece={piece.id}
      className={cn("court-piece", `court-${piece.kind}`, piece.role && `court-role-${piece.role}`, piece.dim && "is-dim", piece.hidden && "is-hidden", piece.dashedEdge && "is-standin", piece.onActivate && "is-clickable")}
      style={{ transform: place(piece.at), transition: `transform ${piece.duration ?? 0}ms ${EASE} ${piece.delay ?? 0}ms, opacity 300ms ease` }}
      onClick={piece.onActivate}
      role={piece.buttonLabel ? "button" : undefined}
      tabIndex={piece.buttonLabel ? 0 : undefined}
      aria-label={piece.buttonLabel}
      aria-hidden={piece.buttonLabel ? undefined : true}
      onKeyDown={piece.onKeyDown ?? (piece.buttonLabel && piece.onActivate ? (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault(); piece.onActivate?.();
      } : undefined)}
    >
      <circle className={cn("court-ring", piece.ring && `is-${piece.ring}`)} r="13" />
      <circle className="court-hit" r="15" />
      {piece.kind === "defender" && <circle className="court-shadow" r={PIECE_RADIUS.defender} cy="1.4" />}
      <circle className="court-body" r={PIECE_RADIUS[piece.kind]} />
      <text className="court-number" dy=".36em">{piece.label}</text>
      {piece.caption && <text className="court-caption" y="-15">{piece.caption}</text>}
    </g>)}

    {guide && <g aria-hidden="true">
      <line className="court-guide" x1={u(guide.from[0])} y1={u(guide.from[1])} x2={u(guide.to[0])} y2={u(guide.to[1])} />
      <g transform={`translate(${u(guide.to[0])} ${u(guide.to[1])})`}><circle className="court-guide-ring" r="11.5" /><text className="court-caption" y="21">{guide.label}</text></g>
    </g>}

    {ball && <g aria-hidden="true" className="court-piece court-ball" style={{ transform: place(ball.at), transition: `transform ${ball.duration ?? 0}ms ${EASE}` }}>
      <g transform="scale(.78)">
        <circle r="4.4" fill="var(--ball)" stroke="var(--ball-seam)" strokeWidth="1.6" />
        <path d="M-3 -1.2Q0 1.4 3 -1.2M-1.6 2.8Q0 .4 1.6 2.8" fill="none" stroke="var(--ball-seam)" strokeWidth=".8" />
      </g>
    </g>}
  </svg>;
}
