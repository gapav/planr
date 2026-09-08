"use client";

import { CalendarPlus, CheckCircle2, FileSpreadsheet, Search, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { fixturesForTeams, parseFixtureRows, teamColor, type FixtureParseResult } from "@/lib/fixtures";
import { useGrep } from "./app-provider";
import { Button, Modal, Tag, inputClass } from "./ui";
import { cn } from "@/lib/utils";

/**
 * The tournament export covers a whole division, so importing is two steps:
 * read the file, then pick which of the teams in it are the club's own. Only
 * the picked teams' matches are stored.
 */
export function FixtureImport({ open, onClose }: { open: boolean; onClose(): void }) {
  const { importFixtures } = useGrep();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<FixtureParseResult | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selected = useMemo(() => parsed ? fixturesForTeams(parsed.fixtures, picked) : [], [parsed, picked]);
  const listed = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("nb-NO");
    return (parsed?.teams ?? []).filter((team) => !needle || team.name.toLocaleLowerCase("nb-NO").includes(needle));
  }, [parsed, search]);

  function reset() { setFileName(""); setParsed(null); setPicked([]); setSearch(""); setError(null); if (inputRef.current) inputRef.current.value = ""; }
  function close() { onClose(); reset(); }

  async function readFile(file: File) {
    setLoading(true); setError(null); setParsed(null); setPicked([]); setFileName(file.name);
    try {
      const rows = file.name.toLocaleLowerCase("en").endsWith(".xls")
        ? (await import("xls-reader")).readFirstSheet(await file.arrayBuffer())?.rows
        : await (await import("read-excel-file/browser")).readSheet(file);
      if (!rows) throw new Error("Arbeidsboken inneholder ingen lesbare ark.");
      setParsed(parseFixtureRows(rows));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Regnearket kunne ikke leses.");
    } finally { setLoading(false); }
  }

  async function commitImport() {
    if (!selected.length) return;
    setLoading(true);
    try { await importFixtures(selected); close(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Kampene kunne ikke importeres."); }
    finally { setLoading(false); }
  }

  return <Modal open={open} onClose={close} size="lg" title="Importer kamper fra terminlisten" description="Last opp terminlisten for avdelingen. Deretter velger du hvilke av lagene i filen som er deres.">
    <input ref={inputRef} type="file" accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file); }} />
    {!parsed && <button type="button" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void readFile(file); }} className="grid min-h-52 w-full place-items-center rounded-[22px] border-2 border-dashed border-[#c8c3b7] bg-[var(--paper)] px-6 text-center transition hover:border-[var(--orange)]">
      <span><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-[var(--orange)] shadow-sm"><FileSpreadsheet size={23} /></span><strong className="mt-4 block">{loading ? "Leser terminlisten …" : "Velg eller slipp en .xls- eller .xlsx-fil"}</strong><span className="mt-2 block text-sm leading-6 text-[var(--ink-soft)]">Filen leses lokalt i nettleseren. Kolonnene «Dato», «Tid», «Kampnr», «Hjemmelag», «Bortelag», «Bane», «Arrangør» og «Turnering» gjenkjennes automatisk.</span></span>
    </button>}
    {error && <div role="alert" className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-[var(--danger)]">{error}</div>}
    {parsed && <div>
      <div className="flex flex-wrap items-center gap-2"><Tag tone="green"><CheckCircle2 size={13} className="mr-1" />Terminlisten er lest</Tag><span className="text-sm font-bold">{fileName}</span><span className="text-sm text-[var(--ink-soft)]">· {parsed.fixtures.length} kamper · {parsed.teams.length} lag</span></div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="font-black">Hvilke lag er deres?</h3><p className="mt-1 text-sm text-[var(--ink-soft)]">Velg alle lagene klubben stiller med i denne avdelingen.</p></div>
        <div className="relative"><Search className="absolute left-3 top-3 text-[var(--ink-soft)]" size={16} /><input className={cn(inputClass, "w-56 pl-9")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Søk etter lag" aria-label="Søk etter lag" /></div>
      </div>
      <div className="mt-3 max-h-72 overflow-y-auto rounded-2xl border border-[var(--line)]">
        {listed.length ? listed.map((team) => { const on = picked.includes(team.name); return <label key={team.name} className={cn("flex cursor-pointer items-center gap-3 border-b border-[var(--line)] px-4 py-3 text-sm last:border-b-0", on && "bg-[var(--paper)]")}>
          <input type="checkbox" className="h-4 w-4 accent-[var(--orange)]" checked={on} onChange={() => setPicked((current) => on ? current.filter((name) => name !== team.name) : [...current, team.name])} />
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: teamColor(team.name) }} aria-hidden />
          <span className="min-w-0 flex-1 truncate font-bold">{team.name}</span>
          <span className="text-xs text-[var(--ink-soft)]">{team.matchCount} kamper</span>
        </label>; }) : <p className="px-4 py-6 text-center text-sm text-[var(--ink-soft)]">Ingen lag matcher søket.</p>}
      </div>
      {parsed.skippedRows > 0 && <p className="mt-2 text-xs text-[var(--ink-soft)]">{parsed.skippedRows} rader uten kamp hoppes over.</p>}
      <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-sm font-bold text-[var(--ink-soft)]">{selected.length ? `${selected.length} kamper velges` : "Ingen lag valgt ennå"}</span>
        <Button variant="ghost" onClick={reset}>Velg en annen fil</Button>
        <Button onClick={() => void commitImport()} disabled={loading || !selected.length}><Upload size={17} />{loading ? "Importerer…" : `Importer ${selected.length} kamper`}</Button>
      </div>
    </div>}
    {!parsed && !loading && <p className="mt-4 flex items-center gap-2 text-xs text-[var(--ink-soft)]"><CalendarPlus size={14} />Kamper med samme kampnummer oppdateres i stedet for å legges til på nytt.</p>}
  </Modal>;
}
