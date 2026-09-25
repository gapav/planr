"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { useGrep } from "@/components/app-provider";
import { EmptyState } from "@/components/ui";

/**
 * The shell every /admin route renders into: the wait for the workspace, the
 * global-admin gate, and the page width. The gate is a courtesy — RLS and the
 * admin RPCs refuse everyone else regardless — but it keeps a coach who types
 * the URL from staring at an empty console.
 */
export function AdminFrame({ children }: { children: ReactNode }) {
  const { user, workspaceLoaded } = useGrep();
  if (!workspaceLoaded) return <AppShell><div className="grid min-h-[60vh] place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--line)] border-t-[var(--orange)]" aria-label="Laster" /></div></AppShell>;
  if (user?.isGlobalAdmin !== true) return <AppShell><div className="mx-auto max-w-3xl px-4 py-20"><EmptyState icon={<ShieldCheck size={22} />} title="Ingen tilgang" body="Bare en systemadministrator kan opprette lag og tildele trenere. Spillerlisten og klubblogoen til laget ditt finner du under Lag og spillere." /></div></AppShell>;
  return <AppShell><div className="mx-auto max-w-[1100px] px-4 pb-16 pt-7 sm:px-8 sm:pt-10">{children}</div></AppShell>;
}

export type AdminSection = "teams" | "accounts";

/**
 * Title row plus the two top-level sections. The sections are routes rather
 * than in-page tabs so a link to "the accounts" survives a reload and the back
 * button, which matters once the console is where support questions start.
 */
export function AdminHeader({ section, title, description, actions }: { section: AdminSection; title: string; description: ReactNode; actions?: ReactNode }) {
  const { adminTeams, adminAccounts } = useGrep();
  return <header>
    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div><p className="text-xs font-black uppercase tracking-[.16em] text-[var(--orange)]">Systemadministrasjon</p><h1 className="mt-2 text-4xl font-black tracking-[-.055em] sm:text-5xl">{title}</h1><p className="mt-3 max-w-xl text-[var(--ink-soft)]">{description}</p></div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
    <nav className="grep-segments mt-7" aria-label="Administrasjon">
      <Link href="/admin" aria-current={section === "teams" ? "page" : undefined}>Lag<span>{adminTeams.length}</span></Link>
      <Link href="/admin/accounts" aria-current={section === "accounts" ? "page" : undefined}>Brukerkontoer<span>{adminAccounts.length}</span></Link>
    </nav>
  </header>;
}
