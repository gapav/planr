"use client";

import { MailCheck } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useGrep } from "./app-provider";

/**
 * The coach's own switch for the morning "dagens økt" email.
 *
 * It lives here, next to the coaching team, because that is where a coach
 * already goes to see who is on the team — and because there is no account
 * settings page to hang it on. The preference is personal: it is read off the
 * signed-in profile, never off a team-mate's.
 */
export function SessionDigestCard() {
  const { user, setSessionDigestEmail } = useGrep();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enabled = user?.sessionDigestEmail !== false;

  async function toggle() {
    setBusy(true); setError(null);
    try { await setSessionDigestEmail(!enabled); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Innstillingen kunne ikke lagres."); }
    finally { setBusy(false); }
  }

  return <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-5">
    <div className="flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--paper)] text-[var(--ink-soft)]"><MailCheck size={20} /></span>
      <div className="min-w-0 flex-1">
        <h3 className="font-black">Dagens økt på e-post</h3>
        <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">Hele planen i innboksen om morgenen på dager du har økt. Ingen økt, ingen e-post.</p>
      </div>
    </div>
    <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-[var(--paper)] px-3.5 py-3">
      <span className="text-sm font-bold">{enabled ? "På" : "Av"}</span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Dagens økt på e-post"
        disabled={busy || !user}
        onClick={() => void toggle()}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60",
          enabled ? "bg-[var(--orange)]" : "bg-[#cfccc2]",
        )}
      >
        <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all", enabled ? "left-6" : "left-1")} />
      </button>
    </div>
    {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-[var(--danger)]">{error}</p>}
  </section>;
}
