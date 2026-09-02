"use client";

import { CheckCircle2, FileSpreadsheet, Hash, Trash2, Upload, UsersRound } from "lucide-react";
import { useRef, useState } from "react";
import { parseRosterRows, type RosterParseResult } from "@/lib/roster";
import type { TeamPlayer } from "@/lib/types";
import { useGrep } from "./app-provider";
import { Button, Modal, Tag } from "./ui";

export function RosterManager({ players, canManage }: { players: TeamPlayer[]; canManage: boolean }) {
  const { importPlayers, removePlayer } = useGrep();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<RosterParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function reset() { setFileName(""); setPreview(null); setError(null); if (inputRef.current) inputRef.current.value = ""; }

  async function readFile(file: File) {
    setLoading(true); setError(null); setPreview(null); setFileName(file.name);
    try {
      const rows = file.name.toLocaleLowerCase("en").endsWith(".xls")
        ? (await import("xls-reader")).readFirstSheet(await file.arrayBuffer())?.rows
        : await (await import("read-excel-file/browser")).readSheet(file);
      if (!rows) throw new Error("The workbook does not contain a readable sheet.");
      setPreview(parseRosterRows(rows));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not read that spreadsheet.");
    } finally { setLoading(false); }
  }

  async function commitImport() {
    if (!preview) return;
    setLoading(true);
    try { await importPlayers(preview.players); setOpen(false); reset(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The roster could not be imported."); }
    finally { setLoading(false); }
  }

  return <>
    <section className="mt-6 overflow-hidden rounded-[26px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_8px_30px_rgba(16,32,29,.04)]">
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--line)] p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#dcecdf] text-[#285546]"><UsersRound size={21} /></span><div><h2 className="text-xl font-black">Player roster</h2><p className="mt-1 text-sm text-[var(--ink-soft)]">{players.length} {players.length === 1 ? "player" : "players"} available for session check-in</p></div></div>
        {canManage && <Button variant="secondary" onClick={() => setOpen(true)}><Upload size={17} />Import from Hoopit</Button>}
      </div>
      {players.length ? <div className="divide-y divide-[var(--line)]">{players.map((player) => <div key={player.id} className="grid grid-cols-[minmax(0,1fr)_90px_40px] items-center gap-3 px-5 py-3.5 sm:px-6">
        <div className="min-w-0"><p className="truncate font-bold">{player.fullName}</p></div>
        <span className="flex items-center gap-1.5 text-sm font-bold text-[var(--ink-soft)]"><Hash size={14} />{player.jerseyNumber || "—"}</span>
        {canManage ? <Button variant="ghost" size="sm" className="px-2 text-[var(--danger)]" aria-label={`Remove ${player.fullName}`} onClick={() => { if (confirm(`Remove ${player.fullName} from the roster?`)) void removePlayer(player.id); }}><Trash2 size={16} /></Button> : <span />}
      </div>)}</div> : <div className="px-6 py-10 text-center"><FileSpreadsheet className="mx-auto text-[var(--ink-soft)]" size={27} /><p className="mt-3 font-black">No players yet</p><p className="mt-1 text-sm text-[var(--ink-soft)]">Import your Hoopit member export to build the roster.</p></div>}
    </section>

    <Modal open={open} onClose={() => { setOpen(false); reset(); }} title="Import Hoopit roster" description="Upload the Excel export from Hoopit. For privacy, only each player’s first name, surname initial and jersey number are stored." size="lg">
      <input ref={inputRef} type="file" accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file); }} />
      {!preview && <button type="button" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void readFile(file); }} className="grid min-h-52 w-full place-items-center rounded-[22px] border-2 border-dashed border-[#c8c3b7] bg-[var(--paper)] px-6 text-center transition hover:border-[var(--orange)]">
        <span><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-[var(--orange)] shadow-sm"><FileSpreadsheet size={23} /></span><strong className="mt-4 block">{loading ? "Reading spreadsheet…" : "Choose or drop an .xls or .xlsx file"}</strong><span className="mt-2 block text-sm leading-6 text-[var(--ink-soft)]">The file is processed locally. Email addresses, member IDs and full surnames are discarded before import.</span></span>
      </button>}
      {error && <div role="alert" className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-[var(--danger)]">{error}</div>}
      {preview && <div>
        <div className="flex flex-wrap items-center gap-2"><Tag tone="green"><CheckCircle2 size={13} className="mr-1" />Ready to import</Tag><span className="text-sm font-bold">{fileName}</span><span className="text-sm text-[var(--ink-soft)]">· {preview.players.length} players found</span></div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--line)]"><div className="grid grid-cols-[minmax(0,1fr)_80px] bg-[var(--paper)] px-4 py-2 text-xs font-black uppercase tracking-[.08em] text-[var(--ink-soft)]"><span>Player</span><span>Number</span></div>{preview.players.slice(0, 6).map((player, index) => <div key={`${player.fullName}-${index}`} className="grid grid-cols-[minmax(0,1fr)_80px] border-t border-[var(--line)] px-4 py-3 text-sm"><span className="truncate font-bold">{player.fullName}</span><span>{player.jerseyNumber || "—"}</span></div>)}</div>
        {preview.players.length > 6 && <p className="mt-2 text-xs text-[var(--ink-soft)]">And {preview.players.length - 6} more players</p>}
        {preview.skippedRows > 0 && <p className="mt-2 text-xs text-[var(--ink-soft)]">{preview.skippedRows} blank or duplicate rows will be skipped.</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={reset}>Choose another file</Button><Button onClick={() => void commitImport()} disabled={loading}><Upload size={17} />{loading ? "Importing…" : `Import ${preview.players.length} players`}</Button></div>
      </div>}
    </Modal>
  </>;
}
