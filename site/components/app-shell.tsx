"use client";

import { BookOpen, CalendarDays, ChevronDown, Home, LogOut, Menu, PanelLeftClose, PanelLeftOpen, ShieldCheck, Trophy, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useGrep } from "./app-provider";
import { Logo } from "./logo";
import { TeamCrest } from "./team-crest";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Oversikt", icon: Home },
  { href: "/sessions", label: "Øktkalender", icon: CalendarDays },
  { href: "/matches", label: "Kampkalender", icon: Trophy },
  { href: "/exercises", label: "Øvelsesbank", icon: BookOpen },
  { href: "/team", label: "Laget", icon: Users },
];
const activeRoute = (pathname: string, href: string) => href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

export function AppShell({ children, immersive = false }: { children: React.ReactNode; immersive?: boolean }) {
  const { user, authLoading, isDemoMode, teams, currentTeam, setCurrentTeamId, sidebarCollapsed, setSidebarCollapsed, signOut, notice, clearNotice } = useGrep();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawer = useRef<HTMLDivElement>(null);
  const isGlobalAdmin = user?.isGlobalAdmin === true;

  useEffect(() => {
    if (!mobileOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(drawer.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), select:not([disabled])') ?? []);
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setMobileOpen(false); }
      if (event.key !== "Tab") return;
      const elements = focusable(); const first = elements[0]; const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const onResize = () => { if (window.innerWidth >= 1024) setMobileOpen(false); };
    document.addEventListener("keydown", onKeyDown); window.addEventListener("resize", onResize);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); window.removeEventListener("resize", onResize); previousFocus?.focus(); };
  }, [mobileOpen]);

  function switchTeam(id: string) {
    setCurrentTeamId(id); setMobileOpen(false);
    // Leave session-specific views so no previous-team plan remains on screen.
    if (pathname !== "/") router.push("/");
  }

  function navigation(mobile = false) {
    return <>
      <div className="grep-sidebar-brand"><Logo compact={!mobile && sidebarCollapsed} />{mobile && <button className="grep-icon-button" onClick={() => setMobileOpen(false)} aria-label="Lukk menyen"><X size={21} /></button>}</div>
      {(!sidebarCollapsed || mobile) ? <div className="grep-team-switcher">
        <label htmlFor={mobile ? "mobile-team" : "desktop-team"}>Ditt lag</label>
        {teams.length ? <div className="grep-team-control">{currentTeam && <TeamCrest team={currentTeam} size="sm" />}<select id={mobile ? "mobile-team" : "desktop-team"} value={currentTeam?.id ?? ""} onChange={(event) => switchTeam(event.target.value)}>{teams.map((team) => <option key={team.id} value={team.id}>{team.shortName}</option>)}</select><ChevronDown size={15} aria-hidden="true" /></div> : <p>Ingen lag ennå</p>}
      </div> : currentTeam && <Link className="grep-collapsed-team" href="/team" aria-label={"Laget: " + currentTeam.shortName}><TeamCrest team={currentTeam} size="sm" /></Link>}
      <nav className="grep-nav" aria-label={mobile ? "Alle sider" : "Hovedmeny"}>{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={activeRoute(pathname, href) ? "page" : undefined} onClick={() => setMobileOpen(false)} title={sidebarCollapsed && !mobile ? label : undefined} aria-label={label}><Icon size={19} strokeWidth={1.8} />{(!sidebarCollapsed || mobile) && <span>{label}</span>}</Link>)}</nav>
      {isGlobalAdmin && <nav aria-label="Systemadministrasjon" className="grep-admin-nav"><Link className="grep-admin-link" href="/admin" aria-label="Administrasjon" title={sidebarCollapsed && !mobile ? "Administrasjon" : undefined} aria-current={activeRoute(pathname, "/admin") ? "page" : undefined} onClick={() => setMobileOpen(false)}><ShieldCheck size={18} />{(!sidebarCollapsed || mobile) && <span>Administrasjon</span>}</Link></nav>}
      <div className="grep-sidebar-footer">
        {(!sidebarCollapsed || mobile) && <>
          {isDemoMode && <p className="grep-demo-label"><span />Demomodus · ingen data lagres</p>}
          <div className="grep-profile"><span className="overview-avatar">{user?.initials ?? "T"}</span><div><strong>{user?.fullName}</strong><small>{isGlobalAdmin ? "Systemadministrator" : currentTeam?.role === "admin" ? "Lagadministrator" : "Trener"}</small></div><button className="grep-icon-button" onClick={() => void signOut()} aria-label="Logg ut"><LogOut size={17} /></button></div>
        </>}
      </div>
    </>;
  }

  if (authLoading) return <div className="grep-auth-gate" role="status">Henter trenerrommet …</div>;
  if (!user) return <div className="grep-auth-gate"><section className="overview-card"><Logo /><h1>Lagets øktplaner finner du her</h1><p>Logg inn for å planlegge økter sammen med trenerteamet.</p><Link href={"/sign-in?next=" + encodeURIComponent(pathname)} className="grep-action">Logg inn</Link></section></div>;

  return <div className={cn("grep-shell", sidebarCollapsed && "grep-shell-collapsed")}>
    <a href="#main-content" className="grep-skip-link">Hopp til innhold</a>
    <aside id="app-sidebar" className="grep-sidebar" inert={mobileOpen || undefined}>{navigation()}<button className="grep-sidebar-toggle grep-icon-button" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-controls="app-sidebar" aria-label={sidebarCollapsed ? "Utvid sidemenyen" : "Skjul sidemenyen"} aria-expanded={!sidebarCollapsed}>{sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button></aside>
    <div className="grep-content" inert={mobileOpen || undefined}>
      {!immersive && <header className="grep-mobile-header"><Logo /><button className="grep-icon-button" onClick={() => setMobileOpen(true)} aria-label="Åpne menyen" aria-expanded={mobileOpen} aria-controls="mobile-navigation"><Menu size={22} /></button></header>}
      <main id="main-content" tabIndex={-1} className={cn("grep-main", !immersive && "grep-main-with-mobile-nav")}>{children}</main>
      {!immersive && <nav className="grep-mobile-nav" aria-label="Hurtigmeny">{[nav[0], nav[1], nav[3]].map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={activeRoute(pathname, href) ? "page" : undefined}><Icon size={21} strokeWidth={1.8} /><span>{label}</span></Link>)}<button onClick={() => setMobileOpen(true)} aria-expanded={mobileOpen} aria-controls="mobile-navigation"><Menu size={21} /><span>Mer</span></button></nav>}
    </div>
    {mobileOpen && <div className="grep-drawer-overlay" onClick={(event) => { if (event.target === event.currentTarget) setMobileOpen(false); }}><div ref={drawer} id="mobile-navigation" className="grep-drawer" role="dialog" aria-modal="true" aria-label="Navigasjon">{navigation(true)}</div></div>}
    {notice && <div role="status" className="grep-notice"><span>{notice}</span><button className="grep-icon-button" onClick={clearNotice} aria-label="Lukk meldingen"><X size={18} /></button></div>}
  </div>;
}
