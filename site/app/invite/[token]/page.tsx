"use client";

import { CheckCircle2, Users } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useGrep } from "@/components/app-provider";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>(); const { user, isDemoMode } = useGrep(); const [remoteStatus, setRemoteStatus] = useState<"loading" | "accepted" | "error">("loading"); const [remoteMessage, setRemoteMessage] = useState("Accepting your team invitation…");
  const status = !user ? "error" : isDemoMode ? "accepted" : remoteStatus;
  const message = !user ? "Sign in with the invited email before accepting this invitation." : remoteMessage;
  useEffect(() => { if (!user || isDemoMode) return; const supabase = getSupabaseBrowserClient(); if (!supabase) return; void supabase.rpc("accept_team_invitation", { invitation_token: token }).then(({ error }) => { if (error) { setRemoteStatus("error"); setRemoteMessage(error.message); } else setRemoteStatus("accepted"); }); }, [isDemoMode, token, user]);
  return <main className="grid min-h-screen place-items-center p-6"><div className="w-full max-w-md rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-8 text-center shadow-[var(--shadow)]"><Logo /><span className="mx-auto mt-8 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--mint)]">{status === "accepted" ? <CheckCircle2 size={28} /> : <Users size={27} />}</span><h1 className="mt-6 text-3xl font-black tracking-[-.045em]">{status === "accepted" ? "You’re on the team" : status === "loading" ? "Joining team…" : "Invitation needs attention"}</h1><p className="mt-3 leading-7 text-[var(--ink-soft)]">{status === "accepted" ? "The team workspace and its shared sessions are now available to you." : message}</p>{status === "accepted" ? <Link href="/sessions" className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--orange)] px-5 font-bold text-white">Open team sessions</Link> : status === "error" ? <Link href={`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`} className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--orange)] px-5 font-bold text-white">Sign in to continue</Link> : <Button className="mt-7 w-full" disabled>Checking invitation…</Button>}</div></main>;
}
