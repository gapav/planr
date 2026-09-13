"use client";

import { Check, UserRound } from "lucide-react";
import { useState } from "react";
import { displayNameError, DISPLAY_NAME_MAX_LENGTH, normalizeDisplayName } from "@/lib/profile";
import { Avatar, Button, inputClass } from "@/components/ui";
import { initials } from "@/lib/utils";
import { useGrep } from "./app-provider";

/**
 * The coach's own screen name.
 *
 * An account is created from the Supabase dashboard, so `full_name` starts as
 * the email local part — "ola.nordmann" on every avatar and in the morning
 * letter. This is where the coach replaces it. It is a display name only: the
 * email is still what they sign in with, and nothing here touches auth.
 */
export function DisplayNameCard() {
  const { user, setDisplayName } = useGrep();
  const [value, setValue] = useState(user?.fullName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // The profile arrives after the first render, and a rename made elsewhere —
  // another tab, the dashboard — arrives later still. Adjusting during render on
  // the stored name is the React-sanctioned way to let the field follow it.
  const [stored, setStored] = useState(user?.fullName ?? "");
  if ((user?.fullName ?? "") !== stored) { setStored(user?.fullName ?? ""); setValue(user?.fullName ?? ""); }

  const normalized = normalizeDisplayName(value);
  const unchanged = normalized === (user?.fullName ?? "");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const refusal = displayNameError(value);
    if (refusal) { setError(refusal); setSaved(false); return; }
    setBusy(true); setError(null);
    try {
      await setDisplayName(value);
      setValue(normalized);
      setSaved(true);
    } catch (caught) {
      setSaved(false);
      setError(caught instanceof Error ? caught.message : "Navnet kunne ikke lagres.");
    } finally { setBusy(false); }
  }

  return <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-5">
    <div className="flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--paper)] text-[var(--ink-soft)]"><UserRound size={20} /></span>
      <div className="min-w-0 flex-1">
        <h3 className="font-black">Visningsnavn</h3>
        <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">Navnet de andre trenerne ser på økter, aktiviteter og i e-postene. Du logger fortsatt inn med {user?.email ?? "e-postadressen din"}.</p>
      </div>
    </div>
    <form className="mt-4 grid gap-3" onSubmit={(event) => void save(event)}>
      <label className="grid gap-2 text-sm font-semibold">
        <span className="sr-only">Visningsnavn</span>
        <input
          className={inputClass}
          value={value}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          autoComplete="name"
          placeholder="Ola Nordmann"
          disabled={busy || !user}
          onChange={(event) => { setValue(event.target.value); setSaved(false); setError(null); }}
        />
      </label>
      <div className="flex items-center gap-3">
        {user && <Avatar name={normalized || user.fullName} initials={initials(normalized || user.fullName)} color={user.color} />}
        <Button type="submit" disabled={busy || !user || unchanged}>{busy ? "Lagrer…" : "Lagre navn"}</Button>
        {saved && unchanged && <span className="flex items-center gap-1 text-sm font-semibold text-[var(--green)]"><Check size={16} />Lagret</span>}
      </div>
    </form>
    {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-[var(--danger)]">{error}</p>}
  </section>;
}
