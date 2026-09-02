"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import type { Team } from "@/lib/types";
import { useGrep } from "./app-provider";
import { TeamCrest } from "./team-crest";
import { Button } from "./ui";

export function ClubLogoCard({ team, canManage }: { team: Team; canManage: boolean }) {
  const { saveTeamLogo } = useGrep();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The file input is reset either way: picking the same file twice after a
  // failed upload must still fire a change event.
  async function save(file: File | null) {
    setBusy(true); setError(null);
    try { await saveTeamLogo(file); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Klubblogoen kunne ikke lagres."); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  return <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-5">
    <h3 className="font-black">Klubblogo</h3>
    <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">Vises i sidemenyen, øktkalenderen og under selve økten.</p>
    <div className="mt-4 flex items-center gap-4">
      <TeamCrest team={team} size="xl" />
      <div className="min-w-0">
        <p className="truncate font-bold">{team.shortName}</p>
        <p className="mt-0.5 text-xs text-[var(--ink-soft)]">{team.logoUrl ? "Logo lastet opp" : "Ingen logo — viser initialene"}</p>
      </div>
    </div>
    {canManage ? <>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Velg en klubblogo" onChange={(event) => { const file = event.target.files?.[0]; if (file) void save(file); }} />
      <div className="mt-4 grid gap-2">
        <Button variant="secondary" className="w-full" disabled={busy} onClick={() => inputRef.current?.click()}><ImagePlus size={17} />{busy ? "Lagrer…" : team.logoUrl ? "Bytt logo" : "Last opp logo"}</Button>
        {team.logoUrl && <Button variant="ghost" className="w-full text-[var(--danger)]" disabled={busy} onClick={() => void save(null)}><Trash2 size={16} />Fjern logoen</Button>}
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--ink-soft)]">JPG, PNG eller WebP, opptil 2 MB. En kvadratisk fil ser best ut.</p>
    </> : <p className="mt-4 text-xs leading-5 text-[var(--ink-soft)]">Bare en lagadministrator kan endre klubblogoen.</p>}
    {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-[var(--danger)]">{error}</p>}
  </section>;
}
