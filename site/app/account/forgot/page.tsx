"use client";

import { ArrowLeft, MailCheck, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useGrep } from "@/components/app-provider";
import { Logo } from "@/components/logo";
import { Button, Field, inputClass } from "@/components/ui";

/**
 * Asking for a password reset link.
 *
 * The link lands on `/auth/confirm`, which verifies the token hash and forwards
 * a `recovery` link to `/account/password` — so a coach chooses their own
 * password and nobody, admin included, ever knows it.
 *
 * The confirmation is deliberately the same whether or not the address has an
 * account: Supabase answers an unknown address with success precisely so this
 * page cannot be used to find out who is a coach here.
 */
export default function ForgotPasswordPage() {
  const { requestPasswordReset, isDemoMode } = useGrep();
  const [email, setEmail] = useState(""); const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError(null);
    try { await requestPasswordReset(email); setSent(true); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "E-posten kunne ikke sendes"); }
    finally { setLoading(false); }
  }

  return <main className="grid min-h-screen place-items-center p-5 sm:p-10"><div className="w-full max-w-md rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-8 shadow-[var(--shadow)]">
    <Logo />
    {sent
      ? <><span className="mt-8 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--mint)]"><MailCheck size={25} /></span><h1 className="mt-6 text-3xl font-black tracking-[-.045em]">Sjekk e-posten din</h1><p className="mt-3 leading-7 text-[var(--ink-soft)]">Finnes det en konto for <strong className="font-bold text-[var(--ink)]">{email.trim()}</strong>, ligger det nå en lenke der du kan velge et nytt passord. Lenken varer en kort stund — be om en ny hvis den har utløpt.</p><Link href="/sign-in" className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--orange)] px-5 font-bold text-white">Tilbake til innlogging</Link></>
      : <><Link href="/sign-in" className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-[var(--ink-soft)] hover:text-[var(--ink)]"><ArrowLeft size={16} />Tilbake til innlogging</Link><h1 className="mt-5 text-3xl font-black tracking-[-.045em]">Glemt passord</h1><p className="mt-3 leading-7 text-[var(--ink-soft)]">{isDemoMode ? "Demomodus er aktiv, så det sendes ingen e-post." : "Skriv e-postadressen din, så sender vi en lenke der du velger et nytt passord selv."}</p>
        <form className="mt-7 grid gap-5" onSubmit={submit}>
          <Field label="E-postadresse"><input type="email" required autoComplete="username" className={inputClass} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="trener@klubb.no" autoFocus /></Field>
          {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-[var(--danger)]">{error}</p>}
          <Button size="lg" disabled={loading}>{loading ? "Sender…" : <><Send size={18} />Send lenke</>}</Button>
        </form></>}
  </div></main>;
}
