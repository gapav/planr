"use client";

import { ArrowLeft, Mail, MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useGrep } from "@/components/app-provider";
import { Logo } from "@/components/logo";
import { Button, inputClass } from "@/components/ui";
import { internalPath } from "@/lib/auth";

function SignInForm() {
  const { requestMagicLink, isDemoMode } = useGrep();
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = internalPath(search.get("next"));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await requestMagicLink(email, next);
      if (isDemoMode) router.push(next);
      else setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Innloggingslenken kunne ikke sendes");
    } finally {
      setLoading(false);
    }
  }

  return <div className="grid min-h-screen lg:grid-cols-[1.05fr_.95fr]">
    <section className="relative hidden overflow-hidden bg-[var(--ink)] p-12 text-white lg:flex lg:flex-col"><div className="absolute -right-24 top-24 h-96 w-96 rounded-full border-[90px] border-[var(--orange)] opacity-90" /><div className="absolute bottom-[-13rem] left-[-8rem] h-[30rem] w-[30rem] rounded-full border-[1px] border-white/20" /><div className="relative [&_span]:text-white"><Logo /></div><div className="relative mt-auto max-w-xl"><p className="text-xs font-black uppercase tracking-[.2em] text-[var(--lime)]">Laget for trenerrommet</p><h1 className="mt-5 text-6xl font-black leading-[.98] tracking-[-.06em]">Én økt.<br />Hele trenerteamet<br />samkjørt.</h1><p className="mt-6 max-w-md text-lg leading-8 text-white/60">Planlegg ulike bolker samtidig, se endringer med én gang og møt forberedt på trening.</p></div></section>
    <main className="grid place-items-center p-5 sm:p-10"><div className="w-full max-w-md"><div className="mb-10 flex items-center justify-between lg:hidden"><Logo /><Link href="/exercises" className="text-sm font-bold">Se øvelsesbanken</Link></div><Link href="/exercises" className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-[var(--ink-soft)] hover:text-[var(--ink)]"><ArrowLeft size={16} />Tilbake til øvelsesbanken</Link><p className="text-xs font-black uppercase tracking-[.17em] text-[var(--orange)]">Velkommen til Grep</p><h2 className="mt-3 text-4xl font-black tracking-[-.055em]">Logg inn.</h2>
      {sent
        ? <div className="mt-7"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--mint)]"><MailCheck size={25} /></span><h3 className="mt-5 text-2xl font-black tracking-[-.04em]">Sjekk e-posten din</h3><p className="mt-3 leading-7 text-[var(--ink-soft)]">Hvis <strong className="font-bold text-[var(--ink)]">{email.trim()}</strong> har tilgang til Grep, har vi sendt en sikker engangslenke. Åpne den i nettleseren du vil bruke.</p><Button variant="secondary" className="mt-6 w-full" onClick={() => { setSent(false); setError(null); }}>Send en ny lenke</Button></div>
        : <><p className="mt-4 leading-7 text-[var(--ink-soft)]">{isDemoMode ? "Demomodus — e-postadressen åpner demoarbeidsområdet." : "Skriv inn e-postadressen din. Vi sender en sikker engangslenke — du trenger ikke passord."}</p><form className="mt-8 grid gap-4" onSubmit={submit}><label className="grid gap-2 text-sm font-bold">E-postadresse<div className="relative"><Mail className="absolute left-3.5 top-3.5 text-[var(--ink-soft)]" size={18} /><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className={`${inputClass} pl-10`} placeholder="trener@klubb.no" autoFocus /></div></label>{error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-[var(--danger)]">{error}</p>}<Button size="lg" disabled={loading}>{loading ? "Sender …" : <><Mail size={18} />Send innloggingslenke</>}</Button></form><p className="mt-6 text-sm leading-6 text-[var(--ink-soft)]">Nettleseren husker innloggingen din. Du trenger vanligvis bare en ny lenke på en ny enhet eller etter at du logger ut.</p></>}
    </div></main>
  </div>;
}

export default function SignInPage() { return <Suspense><SignInForm /></Suspense>; }
