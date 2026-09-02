"use client";

import { CheckCircle2, Users } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useGrep } from "@/components/app-provider";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>(); const router = useRouter(); const { user, isDemoMode, refreshWorkspace } = useGrep(); const [remoteStatus, setRemoteStatus] = useState<"loading" | "accepted" | "error">("loading"); const [remoteMessage, setRemoteMessage] = useState("Godtar laginvitasjonen …"); const attempted = useRef<string | null>(null);
  const mustSetPassword = user?.mustSetPassword === true;
  const status = !user ? "error" : isDemoMode ? "accepted" : mustSetPassword ? "loading" : remoteStatus;
  const alreadyJoined = status === "error" && Boolean(user) && /already been used|allerede brukt/i.test(remoteMessage);
  const message = !user ? "Logg inn med e-postadressen som ble invitert, før du godtar invitasjonen." : alreadyJoined ? "Du er allerede med på dette laget, så invitasjonen er ferdig behandlet." : remoteMessage;
  useEffect(() => { if (mustSetPassword) router.replace(`/account/password?next=${encodeURIComponent(`/invite/${token}`)}`); }, [mustSetPassword, router, token]);
  // Accepting refreshes the workspace, which replaces `user` and so re-runs this
  // effect. Without the ref the second pass would call the RPC again and fail on
  // its own single-use check.
  useEffect(() => { if (!user || isDemoMode || mustSetPassword || attempted.current === token) return; attempted.current = token; const supabase = getSupabaseBrowserClient(); if (!supabase) return; void supabase.rpc("accept_team_invitation", { invitation_token: token }).then(async ({ error }) => { if (error) { setRemoteStatus("error"); setRemoteMessage(/already been used/i.test(error.message) ? "Invitasjonen er allerede brukt" : "Invitasjonen kunne ikke godtas."); return; } await refreshWorkspace(); setRemoteStatus("accepted"); }); }, [isDemoMode, mustSetPassword, refreshWorkspace, token, user]);
  return <main className="grid min-h-screen place-items-center p-6"><div className="w-full max-w-md rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-8 text-center shadow-[var(--shadow)]"><Logo /><span className="mx-auto mt-8 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--mint)]">{status === "accepted" || alreadyJoined ? <CheckCircle2 size={28} /> : <Users size={27} />}</span><h1 className="mt-6 text-3xl font-black tracking-[-.045em]">{status === "accepted" || alreadyJoined ? "Du er nå med på laget" : status === "loading" ? "Blir med på laget …" : "Invitasjonen krever oppfølging"}</h1><p className="mt-3 leading-7 text-[var(--ink-soft)]">{status === "accepted" ? "Du har nå tilgang til lagområdet og de delte øktene." : message}</p>{status === "accepted" || alreadyJoined ? <Link href="/sessions" className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--orange)] px-5 font-bold text-white">Åpne lagets økter</Link> : status === "error" ? <Link href={user ? "/sessions" : `/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`} className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--orange)] px-5 font-bold text-white">{user ? "Åpne øktene dine" : "Logg inn for å fortsette"}</Link> : <Button className="mt-7 w-full" disabled>Kontrollerer invitasjonen …</Button>}</div></main>;
}
