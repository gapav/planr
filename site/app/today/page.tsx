"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useGrep } from "@/components/app-provider";
import { pickTodaySession } from "@/lib/session";

/**
 * The installed app's `start_url` (see `app/manifest.ts`).
 *
 * A coach taps the home-screen icon standing in the hall, so the calendar is
 * one tap too many: this resolves the session they are about to run and hands
 * them straight to its live view, which opens on check-in for a plan not yet
 * started and on the workout for one already running. With nothing on today it
 * falls through to the calendar, which is where the browser lands anyway.
 *
 * It has to be a client route: there is no server data layer, so which session
 * is today's is only knowable once the provider has loaded.
 */
export default function TodayPage() {
  const { sessions, currentTeam, user, authLoading, workspaceLoaded } = useGrep();
  const router = useRouter();

  useEffect(() => {
    if (authLoading || !workspaceLoaded) return;
    // Signed out, /sessions renders the sign-in prompt with the right `next`.
    if (!user) { router.replace("/sessions"); return; }
    // The sidebar's team first, so a coach on two teams gets the one they were
    // last working in — but a session tonight on the other team still beats
    // landing on an empty calendar.
    const session = pickTodaySession(sessions.filter((entry) => entry.teamId === currentTeam?.id)) ?? pickTodaySession(sessions);
    router.replace(session ? `/sessions/${session.id}/live` : "/sessions");
  }, [authLoading, currentTeam, router, sessions, user, workspaceLoaded]);

  return <div className="grid min-h-screen place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--line)] border-t-[var(--orange)]" aria-label="Laster" /></div>;
}
