"use client";

import { Pencil, Search, ShieldCheck, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ADMIN_PAGE_SIZE, ShowMore } from "@/components/admin-list";
import { filterAdminAccounts, shortTeamName, type AdminAccountFilter } from "@/lib/admin";
import { DISPLAY_NAME_MAX_LENGTH, DISPLAY_NAME_MIN_LENGTH } from "@/lib/profile";
import { COACH_AVATAR_PEER, COACH_AVATAR_SELF } from "@/lib/team-palette";
import type { AdminAccount } from "@/lib/types";
import { Avatar, Button, EmptyState, inputClass, Modal, Tag } from "@/components/ui";

const accountFilters: Array<{ id: AdminAccountFilter; label: string }> = [{ id: "all", label: "Alle" }, { id: "no-team", label: "Uten lag" }, { id: "never-signed-in", label: "Aldri logget inn" }];

export function AdminAccountDirectory({ accounts, loaded, currentUserId, onDelete, onRename }: {
  accounts: AdminAccount[];
  loaded: boolean;
  currentUserId: string;
  onDelete(profileId: string, confirmationEmail: string): Promise<void>;
  onRename(profileId: string, name: string): Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AdminAccountFilter>("all");
  const [limit, setLimit] = useState(ADMIN_PAGE_SIZE);
  const [selected, setSelected] = useState<AdminAccount | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [renaming, setRenaming] = useState<AdminAccount | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visible = useMemo(() => filterAdminAccounts(accounts, query, filter), [accounts, query, filter]);
  const filterCounts = useMemo(() => ({ all: accounts.length, "no-team": filterAdminAccounts(accounts, "", "no-team").length, "never-signed-in": filterAdminAccounts(accounts, "", "never-signed-in").length }), [accounts]);

  function close() {
    if (busy) return;
    setSelected(null);
    setConfirmation("");
    setError(null);
  }

  async function remove(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete(selected.id, confirmation);
      closeAfterDelete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kontoen kunne ikke slettes permanent.");
    } finally {
      setBusy(false);
    }
  }

  // The name a dashboard-created account starts with is the email local part,
  // so the administrator is usually the first to see it. The coach can change it
  // themselves too, from /team → Innstillinger.
  async function rename(event: React.FormEvent) {
    event.preventDefault();
    if (!renaming) return;
    setBusy(true);
    setError(null);
    try {
      await onRename(renaming.id, name);
      setRenaming(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Navnet kunne ikke lagres.");
    } finally {
      setBusy(false);
    }
  }

  function closeAfterDelete() {
    setSelected(null);
    setConfirmation("");
    setError(null);
  }

  return <section className="mt-6" aria-label="Brukerkontoer">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <label className="relative block w-full sm:max-w-sm"><span className="sr-only">Søk i brukerkontoer</span><Search className="absolute left-3.5 top-3.5 text-[var(--ink-soft)]" size={17} /><input type="search" className={`${inputClass} pl-10`} value={query} onChange={(event) => { setQuery(event.target.value); setLimit(ADMIN_PAGE_SIZE); }} placeholder="Søk navn, e-post eller lag" /></label>
      <div className="grep-segments" role="group" aria-label="Vis kontoer">{accountFilters.map((entry) => <button key={entry.id} type="button" aria-pressed={filter === entry.id} onClick={() => { setFilter(entry.id); setLimit(ADMIN_PAGE_SIZE); }}>{entry.label}<span>{filterCounts[entry.id]}</span></button>)}</div>
    </div>

    {!loaded ? <p className="mt-6 text-sm text-[var(--ink-soft)]">Laster brukerkontoer …</p>
      : accounts.length === 0 ? <div className="mt-6"><EmptyState icon={<Users size={22} />} title="Ingen aktive kontoer" body="Når en trener inviteres og Auth-kontoen opprettes, vises den her." /></div>
      : visible.length === 0 ? <p className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 text-sm text-[var(--ink-soft)]">Ingen kontoer matcher søket.</p>
      : <div className="mt-6 overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_8px_30px_rgba(16,32,29,.04)]"><ul className="divide-y divide-[var(--line)]">{visible.slice(0, limit).map((account) => {
        const protectedAccount = account.isGlobalAdmin || account.id === currentUserId;
        return <li key={account.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Avatar name={account.fullName} initials={account.initials} color={account.isGlobalAdmin ? COACH_AVATAR_SELF : COACH_AVATAR_PEER} />
          <div className="min-w-0 flex-[1_1_230px]"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-black">{account.fullName}</p>{account.id === currentUserId && <Tag>Deg</Tag>}{account.isGlobalAdmin && <Tag tone="orange">Systemadministrator</Tag>}{account.filesOwned > 0 && <Tag tone="blue">{account.filesOwned} {account.filesOwned === 1 ? "fil" : "filer"}</Tag>}</div><p className="truncate text-xs text-[var(--ink-soft)]">{account.email} · {lastSignInLabel(account.lastSignInAt)}</p></div>
          <div className="flex min-w-0 flex-[1_1_220px] flex-wrap gap-1.5">{account.memberships.length === 0 ? <Tag>Ingen lagtilgang</Tag> : account.memberships.map((membership) => <Link key={membership.teamId} href={`/admin/teams/${membership.teamId}`} className="rounded-full transition hover:opacity-75"><Tag tone={membership.teamRole === "admin" ? "orange" : "green"}>{shortTeamName(membership.teamName)} · {membership.teamRole === "admin" ? "administrator" : "trener"}</Tag></Link>)}</div>
          <span className="flex items-center">
            <Button variant="ghost" size="sm" className="px-2" title="Endre visningsnavn" aria-label={`Endre visningsnavn for ${account.email}`} onClick={() => { setName(account.fullName); setRenaming(account); setError(null); }}><Pencil size={16} /></Button>
            <Button variant="ghost" size="sm" className="px-2 text-[var(--danger)]" disabled={protectedAccount} title={protectedAccount ? "Systemadministratorer må beskyttes eller få rollen fjernet først" : "Slett konto permanent"} aria-label={`Slett ${account.email} permanent`} onClick={() => { setSelected(account); setConfirmation(""); setError(null); }}><Trash2 size={16} /></Button>
          </span>
        </li>;
      })}</ul><ShowMore shown={Math.min(limit, visible.length)} total={visible.length} onMore={() => setLimit((current) => current + ADMIN_PAGE_SIZE)} /></div>}

    <Modal open={renaming !== null} onClose={() => { if (!busy) { setRenaming(null); setError(null); } }} title="Endre visningsnavn" description={renaming ? `Navnet ${renaming.email} vises med på økter, aktiviteter og i e-postene. Innloggingen er fortsatt e-postadressen.` : ""}>
      {renaming && <form className="grid gap-5" onSubmit={rename}>
        <label className="grid gap-2 text-sm font-semibold"><span>Visningsnavn</span><input required minLength={DISPLAY_NAME_MIN_LENGTH} maxLength={DISPLAY_NAME_MAX_LENGTH} className={inputClass} value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" autoFocus /></label>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-[var(--danger)]">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={() => { setRenaming(null); setError(null); }}>Avbryt</Button><Button type="submit" disabled={busy}>{busy ? "Lagrer…" : "Lagre navn"}</Button></div>
      </form>}
    </Modal>

    <Modal open={selected !== null} onClose={close} title="Slett konto permanent" description={selected ? `${selected.fullName} mister hele Grep-kontoen, ikke bare tilgangen til ett lag.` : ""}>
      {selected && <form className="grid gap-5" onSubmit={remove}>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-[#7f1d1d]"><div className="flex items-center gap-2 font-black"><ShieldCheck size={18} />Dette kan ikke angres</div><p className="mt-2">Innloggingen, alle lagmedlemskap og private favoritter slettes. Økter, øvelser og revisjonshistorikk beholdes med «Slettet bruker» som avsender.</p>{selected.filesOwned > 0 && <p className="mt-2 font-bold">Kontoen eier {selected.filesOwned} {selected.filesOwned === 1 ? "fil" : "filer"} i Storage. De må flyttes eller fjernes før slettingen kan fullføres.</p>}</div>
        <label className="grid gap-2 text-sm font-semibold"><span>Skriv <strong>{selected.email}</strong> for å bekrefte</span><input type="email" className={inputClass} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" autoFocus /></label>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-[var(--danger)]">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={close}>Avbryt</Button><Button type="submit" variant="danger" disabled={busy || selected.filesOwned > 0 || confirmation.trim().toLowerCase() !== selected.email.toLowerCase()}>{busy ? "Sletter …" : "Slett konto permanent"}</Button></div>
      </form>}
    </Modal>
  </section>;
}

export function lastSignInLabel(value: string | null) {
  if (!value) return "Aldri logget inn";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Innloggingstidspunkt ukjent";
  return `Sist innlogget ${new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium", timeStyle: "short" }).format(date)}`;
}

