"use client";

import { BookOpen, CalendarDays, ChevronDown, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Settings, Wifi, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useGrep } from "./app-provider";
import { Logo } from "./logo";
import { TeamCrest } from "./team-crest";
import { Avatar, Button } from "./ui";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/sessions", label: "Øktkalender", icon: CalendarDays },
  { href: "/exercises", label: "Øvelsesbank", icon: BookOpen },
  { href: "/team", label: "Laginnstillinger", icon: Settings },
];

export function AppShell({ children, publicPage = false, immersive = false }: { children: React.ReactNode; publicPage?: boolean; immersive?: boolean }) {
  const { user, authLoading, isDemoMode, teams, currentTeam, setCurrentTeamId, sidebarCollapsed, setSidebarCollapsed, signOut, notice, clearNotice } = useGrep();
  const pathname = usePathname(); const router = useRouter(); const [mobileOpen, setMobileOpen] = useState(false);
  const protectedPage = !publicPage;
  // An admin-created account starts on a temporary password; nothing else in the
  // app is reachable until the coach has replaced it.
  const mustSetPassword = user?.mustSetPassword === true && !pathname.startsWith("/account/password");

  useEffect(() => { if (mustSetPassword) router.replace(`/account/password?next=${encodeURIComponent(pathname)}`); }, [mustSetPassword, pathname, router]);

  function toggleDesktopSidebar() {
    setSidebarCollapsed(!sidebarCollapsed);
  }

  // A team switch changes what every screen is about, and the screens that are
  // about one session — /sessions/<id>, its editor, the live view — would keep
  // showing the other team's plan. The calendar is the one page that always
  // makes sense for the team you just picked, so switching lands there.
  function switchTeam(id: string) {
    setCurrentTeamId(id);
    setMobileOpen(false);
    if (pathname !== "/sessions") router.push("/sessions");
  }

  if (mustSetPassword) return <div className="grid min-h-screen place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--line)] border-t-[var(--orange)]" aria-label="Laster" /></div>;
  if (authLoading && protectedPage) return <div className="grid min-h-screen place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--line)] border-t-[var(--orange)]" aria-label="Laster" /></div>;
  if (!user && protectedPage) return <div className="grid min-h-screen place-items-center p-6"><div className="w-full max-w-md rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-8 text-center shadow-[var(--shadow)]"><Logo /><h1 className="mt-8 text-3xl font-black tracking-[-.04em]">Lagets øktplaner finner du her</h1><p className="mt-3 leading-7 text-[var(--ink-soft)]">Logg inn for å se lagene dine, planlegge økter og samarbeide med trenerteamet.</p><Link href={`/sign-in?next=${encodeURIComponent(pathname)}`} className="mt-7 inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--orange)] px-6 font-bold text-white">Logg inn</Link><Link href="/exercises" className="mt-4 block text-sm font-semibold underline underline-offset-4">Se i øvelsesbanken først</Link></div></div>;

  if (publicPage && !user) return <div className="min-h-screen"><header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--paper)]/92 backdrop-blur-xl"><div className="mx-auto flex h-[74px] max-w-[1440px] items-center justify-between px-4 sm:px-7"><Logo /><nav className="flex items-center gap-2"><Link href="/sign-in" className="inline-flex min-h-10 items-center rounded-xl bg-[var(--ink)] px-4 text-sm font-bold text-white">Logg inn</Link></nav></div></header><main>{children}</main>{notice && <Notice message={notice} onClose={clearNotice} />}</div>;

  return <div className={cn("min-h-screen lg:grid lg:transition-[grid-template-columns] lg:duration-200", sidebarCollapsed ? "lg:grid-cols-[76px_minmax(0,1fr)]" : "lg:grid-cols-[252px_minmax(0,1fr)]")}>
    <aside id="app-sidebar" className={cn("fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col border-r border-white/10 bg-[var(--ink)] p-4 text-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:w-auto lg:translate-x-0", mobileOpen ? "translate-x-0" : "-translate-x-full", sidebarCollapsed && "lg:px-3")}>
      <Button variant="ghost" size="sm" className="absolute -right-4 top-6 z-10 hidden h-8 min-h-0 w-8 rounded-full border border-white/15 bg-[var(--ink)] p-0 text-white shadow-lg hover:bg-[#20322e] hover:text-white lg:inline-flex" onClick={toggleDesktopSidebar} aria-controls="app-sidebar" aria-label={sidebarCollapsed ? "Utvid sidemenyen" : "Skjul sidemenyen"} aria-expanded={!sidebarCollapsed}>{sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</Button>
      <div className={cn("flex items-center justify-between px-2 py-2", sidebarCollapsed && "lg:justify-center lg:px-0")}><div className="[&_span]:text-white"><div className={cn(sidebarCollapsed && "lg:hidden")}><Logo /></div>{sidebarCollapsed && <div className="hidden lg:block"><Logo compact /></div>}</div><Button variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Lukk menyen"><X size={20} /></Button></div>
      <div className={cn("mt-7 rounded-2xl border border-white/10 bg-white/[.07] p-2", sidebarCollapsed && "lg:hidden")}><span className="px-2 text-[10px] font-black uppercase tracking-[.14em] text-white/45">Lag</span><div className="mt-1 flex items-center gap-2.5 pl-1">{currentTeam && <TeamCrest team={currentTeam} className="border-white/15 bg-white/10 text-white" />}<div className="relative min-w-0 flex-1"><select value={currentTeam?.id ?? ""} onChange={(event) => switchTeam(event.target.value)} className="min-h-12 w-full appearance-none truncate rounded-xl bg-transparent px-2 pr-8 text-sm font-bold text-white outline-none">{teams.map((team) => <option key={team.id} value={team.id} className="text-black">{team.shortName}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2 top-3.5 text-white/50" size={17} /></div></div></div>
      {sidebarCollapsed && currentTeam && <Link href="/team" onClick={() => setMobileOpen(false)} title={currentTeam.shortName} aria-label={`Laginnstillinger for ${currentTeam.shortName}`} className="mt-7 hidden justify-center lg:flex"><TeamCrest team={currentTeam} className="border-white/15 bg-white/10 text-white" /></Link>}
      <nav className="mt-5 grid gap-1">{nav.map((item) => { const Icon = item.icon; const active = pathname.startsWith(item.href); return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} title={sidebarCollapsed ? item.label : undefined} className={cn("flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-bold text-white/65 transition hover:bg-white/[.07] hover:text-white", active && "bg-white text-[var(--ink)] hover:bg-white hover:text-[var(--ink)]", sidebarCollapsed && "lg:justify-center lg:px-0")}><Icon className="shrink-0" size={19} strokeWidth={2.2} /><span className={cn(sidebarCollapsed && "lg:hidden")}>{item.label}</span></Link>; })}</nav>
      <div className="mt-auto"><div className={cn("mb-3 flex items-center gap-2 px-2 text-xs font-semibold text-white/45", sidebarCollapsed && "lg:hidden")}><Wifi size={14} />{isDemoMode ? "Demodata" : "Tilkoblet arbeidsområde"}</div><div className={cn("flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.06] p-2.5", sidebarCollapsed && "lg:justify-center lg:border-transparent lg:bg-transparent lg:p-0")}><Avatar name={user?.fullName ?? "Trener"} initials={user?.initials ?? "T"} color={user?.color ?? "#f0642e"} /><div className={cn("min-w-0 flex-1", sidebarCollapsed && "lg:hidden")}><p className="truncate text-sm font-bold">{user?.fullName}</p><p className="truncate text-[11px] text-white/45">{currentTeam?.role === "admin" ? "Lagadministrator" : "Trener"}</p></div><Button variant="ghost" size="sm" className={cn("px-2 text-white/55 hover:bg-white/10 hover:text-white", sidebarCollapsed && "lg:hidden")} onClick={() => void signOut()} aria-label="Logg ut"><LogOut size={17} /></Button></div></div>
    </aside>
    <div className="min-w-0">{!immersive && <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[var(--line)] bg-[var(--paper)]/90 px-4 backdrop-blur-xl lg:hidden"><Button variant="ghost" size="sm" onClick={() => setMobileOpen(true)} aria-label="Åpne menyen"><Menu size={21} /></Button><Logo /><Avatar name={user?.fullName ?? "Trener"} initials={user?.initials ?? "T"} color={user?.color ?? "#f0642e"} size="sm" /></header>}<main className="app-grid min-h-screen">{children}</main></div>
    {mobileOpen && <button className="fixed inset-0 z-30 bg-black/35 lg:hidden" aria-label="Lukk menyoverlegget" onClick={() => setMobileOpen(false)} />}{notice && <Notice message={notice} onClose={clearNotice} />}
  </div>;
}

function Notice({ message, onClose }: { message: string; onClose(): void }) {
  return <div role="status" className="fixed bottom-5 left-1/2 z-[60] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between gap-4 rounded-2xl bg-[var(--ink)] px-4 py-3 text-sm font-semibold text-white shadow-2xl soft-in"><span>{message}</span><button onClick={onClose} aria-label="Lukk meldingen"><X size={17} /></button></div>;
}
