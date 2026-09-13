"use client";

import { CalendarPlus, CheckCircle2, ExternalLink, FileSpreadsheet, Search, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { fixturesForTeams, parseFixtureRows, teamColor, type FixtureParseResult } from "@/lib/fixtures";
import { useGrep } from "./app-provider";
import { Button, Modal, Tag, inputClass } from "./ui";
import { TEAM_PALETTE, savedTeamColors, teamPalette } from "@/lib/team-palette";
import { cn } from "@/lib/utils";

const HANDBALL_SEARCH_URL = "https://www.handball.no/system/sok/?reg=all";

/** Where the file comes from — the download is three clicks deep in an external system. */
const HANDBALL_STEPS = [
  "Søk opp laget deres i lagsøket på handball.no.",
  "Åpne riktig lag og velg «Terminliste».",
  "Last ned terminlisten som Excel-fil, og velg den her.",
];

/**
 * The tournament export covers a whole division, so importing is two steps:
 * read the file, then pick which of the teams in it are the club's own. Only
 * the picked teams' matches are stored.
 */
export function FixtureImport({ open, onClose }: { open: boolean; onClose(): void }) {
  const { importFixtures, fixtures, currentTeam } = useGrep();
  const savedColors = useMemo(() => savedTeamColors((fixtures ?? []).filter((fixture) => fixture.teamId === currentTeam?.id)), [fixtures, currentTeam]);
  const [step, setStep] = useState<"teams" | "colors">("teams");
  const [colors, setColors] = useState<Record<string, string>>({});
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

  function reset() { setStep("teams"); setColors({}); setFileName(""); setParsed(null); setPicked([]); setSearch(""); setError(null); if (inputRef.current) inputRef.current.value = ""; }
  function close() { if (!loading) { onClose(); reset(); } }

  async function readFile(file: File) {
    setLoading(true); setStep("teams"); setColors({}); setError(null); setParsed(null); setPicked([]); setFileName(file.name);
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
    try { await importFixtures(selected.map((fixture) => ({ ...fixture, ourTeamColors: Object.fromEntries(fixture.ourTeams.map((name) => [name, teamPalette(name, colors[name] ?? savedColors[name]).id])) }))); onClose(); reset(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Kampene kunne ikke importeres."); }
    finally { setLoading(false); }
  }

  return <Modal open={open} onClose={close} size="lg" title="Importer kamper fra terminlisten" description="Last opp terminlisten for avdelingen og velg hvilke av lagene i filen som er deres. Etterpå kan du gå gjennom kampene i kalenderen og redigere dem der.">
    <input ref={inputRef} type="file" accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file); }} />
    {!parsed && <section className="mb-5 rounded-[22px] border border-[var(--line)] bg-[var(--paper)] p-5">
      <h3 className="text-sm font-black">Mangler du terminlisten? Hent den fra handball.no</h3>
      <ol className="mt-3 grid gap-2">{HANDBALL_STEPS.map((step, index) => <li key={step} className="flex gap-2.5 text-sm leading-6 text-[var(--ink-soft)]">
        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--paper-deep)] text-[11px] font-black text-[var(--ink)]">{index + 1}</span>
        <span>{step}</span>
      </li>)}</ol>
      <a href={HANDBALL_SEARCH_URL} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-bold transition hover:border-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--orange)]">Åpne lagsøket på handball.no<ExternalLink size={15} /></a>
    </section>}
    {!parsed && <button type="button" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void readFile(file); }} className="grid min-h-52 w-full place-items-center rounded-[22px] border-2 border-dashed border-[#c8c3b7] bg-[var(--paper)] px-6 text-center transition hover:border-[var(--orange)]">
      <span><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-[var(--orange)] shadow-sm"><FileSpreadsheet size={23} /></span><strong className="mt-4 block">{loading ? "Leser terminlisten …" : "Velg eller slipp en .xls- eller .xlsx-fil"}</strong><span className="mt-2 block text-sm leading-6 text-[var(--ink-soft)]">Filen leses lokalt i nettleseren. Kolonnene «Dato», «Tid», «Kampnr», «Hjemmelag», «Bortelag», «Bane», «Arrangør» og «Turnering» gjenkjennes automatisk.</span></span>
    </button>}
    {error && <div role="alert" className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-[var(--danger)]">{error}</div>}
    {parsed && <div>
      <div className="flex flex-wrap items-center gap-2"><Tag tone="green"><CheckCircle2 size={13} className="mr-1" />Terminlisten er lest</Tag><span className="text-sm font-bold">{fileName}</span><span className="text-sm text-[var(--ink-soft)]">· {parsed.fixtures.length} kamper · {parsed.teams.length} lag</span></div>
      {step === "teams" && <><div className="mt-5 flex flex-wrap items-center justify-between gap-3">
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
      </>}
      {step === "colors" && <section className="mt-5 space-y-4"><div><h3 className="font-bold">Gi hvert lag en farge</h3><p className="mt-1 text-sm text-[var(--ink-soft)]">Fargen følger laget i kalenderen. Lagnavnet vises alltid også.</p></div>{picked.map((name) => <fieldset key={name} className="rounded-2xl border border-[var(--line)] p-4"><legend className="px-1 font-bold">{name}</legend><div className="flex flex-wrap gap-2">{TEAM_PALETTE.map((color) => <label key={color.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-sm" style={{ background: teamPalette(name, colors[name] ?? savedColors[name]).id === color.id ? color.tint : undefined }}><input type="radio" name={`color-${name}`} value={color.id} checked={teamPalette(name, colors[name] ?? savedColors[name]).id === color.id} onChange={() => setColors((current) => ({ ...current, [name]: color.id }))} /><span aria-hidden className="h-4 w-4 rounded-full" style={{ background: color.accent }} />{color.name}</label>)}</div></fieldset>)}</section>}
      {parsed.skippedRows > 0 && <p className="mt-2 text-xs text-[var(--ink-soft)]">{parsed.skippedRows} rader uten kamp hoppes over.</p>}
      <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-sm font-bold text-[var(--ink-soft)]">{selected.length ? `${selected.length} kamper velges` : "Ingen lag valgt ennå"}</span>
        <Button variant="ghost" disabled={loading} onClick={reset}>Velg en annen fil</Button>
        {step === "teams" ? <Button onClick={() => setStep("colors")} disabled={loading || !selected.length}>Neste: lagfarger</Button> : <><Button variant="secondary" disabled={loading} onClick={() => setStep("teams")}>Tilbake</Button><Button onClick={() => void commitImport()} disabled={loading || !selected.length}><Upload size={17} />{loading ? "Importerer…" : `Importer ${selected.length} ${selected.length === 1 ? "kamp" : "kamper"}`}</Button></>}
      </div>
    </div>}
    {!parsed && !loading && <p className="mt-4 flex items-center gap-2 text-xs text-[var(--ink-soft)]"><CalendarPlus size={14} />Kamper med samme kampnummer oppdateres i stedet for å legges til på nytt.</p>}
  </Modal>;
}
