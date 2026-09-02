"use client";

import { KeyRound, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useGrep } from "@/components/app-provider";
import { Logo } from "@/components/logo";
import { Button, Field, inputClass } from "@/components/ui";
import { internalPath, MIN_PASSWORD_LENGTH, passwordProblem } from "@/lib/auth";

function ChangePasswordForm() {
  const { user, authLoading, setPassword } = useGrep(); const router = useRouter(); const search = useSearchParams(); const [password, setNewPassword] = useState(""); const [confirmation, setConfirmation] = useState(""); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const forced = user?.mustSetPassword === true;
  // Whoever sent us here — the shell guard or the invite page — parked the
  // destination in `next` so a coach lands back on their invitation.
  const next = internalPath(search.get("next"));
  const joining = next.startsWith("/invite/");
  // Changing a password invalidates the old refresh token, so a stale visit here
  // can arrive with no session at all. Send them to sign in rather than leaving
  // them on a form whose submit can only ever fail.
  useEffect(() => {
    if (!authLoading && !user) router.replace(`/sign-in?next=${encodeURIComponent(next)}`);
  }, [authLoading, next, router, user]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); const problem = passwordProblem(password, confirmation);
    if (problem) { setError(problem); return; }
    setLoading(true); setError(null);
    try { await setPassword(password); router.replace(next); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not change your password"); setLoading(false); }
  }
  return <main className="grid min-h-screen place-items-center p-5 sm:p-10"><div className="w-full max-w-md rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-8 shadow-[var(--shadow)]"><Logo /><span className="mt-8 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--mint)]">{forced ? <ShieldCheck size={25} /> : <KeyRound size={24} />}</span><h1 className="mt-6 text-3xl font-black tracking-[-.045em]">{forced ? "Choose your password" : "Change your password"}</h1><p className="mt-3 leading-7 text-[var(--ink-soft)]">{forced ? `Your account was set up with a temporary password. Pick your own to continue — at least ${MIN_PASSWORD_LENGTH} characters.` : `Pick a new password of at least ${MIN_PASSWORD_LENGTH} characters.`}</p>{joining && <p className="mt-3 rounded-xl bg-[var(--mint)] px-3 py-2 text-sm font-semibold">We’ll take you straight to your team invitation afterwards.</p>}<form className="mt-7 grid gap-5" onSubmit={submit}><Field label="New password"><input type="password" required autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} className={inputClass} value={password} onChange={(event) => setNewPassword(event.target.value)} autoFocus /></Field><Field label="Confirm new password"><input type="password" required autoComplete="new-password" className={inputClass} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></Field>{error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-[var(--danger)]">{error}</p>}<Button size="lg" disabled={loading}>{loading ? "Saving…" : "Save password"}</Button></form></div></main>;
}

export default function ChangePasswordPage() { return <Suspense><ChangePasswordForm /></Suspense>; }
