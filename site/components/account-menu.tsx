"use client";

import { KeyRound, LogOut, Settings, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useGrep } from "./app-provider";
import { cn } from "@/lib/utils";

/**
 * The avatar in the overview's top bar opens the usual account menu. Personal
 * settings (display name, the morning email) live under "For deg" on /team, so
 * "Innstillinger" goes there rather than to a page of its own.
 */
export function AccountMenu() {
  const { user, signOut } = useGrep();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  const entry = "flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-[var(--ink)] transition hover:bg-[var(--paper)]";
  return <div ref={ref} className="overview-account relative">
    <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label="Kontomeny" title={user?.fullName} onClick={() => setOpen(!open)} className={cn("overview-avatar cursor-pointer transition hover:ring-4 hover:ring-[var(--grep-lilac)]", open && "ring-4 ring-[var(--grep-lilac)]")}>{user?.initials ?? "T"}</button>
    {open && <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-30 w-64 rounded-xl border border-[var(--line)] bg-white p-1.5 text-sm font-semibold shadow-xl">
      <div className="px-3 pb-2 pt-1.5"><p className="truncate font-bold">{user?.fullName}</p><p className="truncate text-xs font-normal text-[var(--ink-soft)]">{user?.email}</p></div>
      <div className="my-1 h-px bg-[var(--line)]" />
      <Link href="/team" role="menuitem" autoFocus onClick={() => setOpen(false)} className={entry}><Settings size={16} />Innstillinger</Link>
      <Link href="/account/password?next=%2F" role="menuitem" onClick={() => setOpen(false)} className={entry}><KeyRound size={16} />Bytt passord</Link>
      {user?.isGlobalAdmin && <Link href="/admin" role="menuitem" onClick={() => setOpen(false)} className={entry}><ShieldCheck size={16} />Administrasjon</Link>}
      <div className="my-1 h-px bg-[var(--line)]" />
      <button type="button" role="menuitem" onClick={() => { setOpen(false); void signOut(); }} className={entry}><LogOut size={16} />Logg ut</button>
    </div>}
  </div>;
}
