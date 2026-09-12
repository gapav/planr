"use client";

import { KeyRound, Mail, MailCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useSyncExternalStore } from "react";
import { useGrep } from "@/components/app-provider";
import { Logo } from "@/components/logo";
import { Button, inputClass } from "@/components/ui";
import { internalPath, isLocalhost } from "@/lib/auth";

const subscribeToHostname = () => () => undefined;
const localHostnameSnapshot = () => isLocalhost(window.location.hostname);
const serverHostnameSnapshot = () => false;

function SignInForm() {
  const { requestMagicLink, signIn, isDemoMode } = useGrep();
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [useLocalPassword, setUseLocalPassword] = useState(false);
  const localPasswordAvailable = useSyncExternalStore(subscribeToHostname, localHostnameSnapshot, serverHostnameSnapshot);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = internalPath(search.get("next"));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (useLocalPassword) {
        await signIn(email.trim().toLowerCase(), password);
        router.push(next);
      } else {
        await requestMagicLink(email, next);
        if (isDemoMode) router.push(next);
        else setSent(true);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : useLocalPassword ? "Kunne ikke logge inn" : "Innloggingslenken kunne ikke sendes");
    } finally {
      setLoading(false);
    }
  }

  return <div className="grid min-h-screen lg:grid-cols-[1.05fr_.95fr]">
    <section className="relative hidden overflow-hidden bg-[var(--ink)] p-12 text-white lg:flex lg:flex-col"><div className="absolute -right-24 top-24 h-96 w-96 rounded-full border-[90px] border-[var(--orange)] opacity-90" /><div className="absolute bottom-[-13rem] left-[-8rem] h-[30rem] w-[30rem] rounded-full border-[1px] border-white/20" /><div className="relative [&_span]:text-white"><Logo /></div><div className="relative mt-auto max-w-xl"><p className="text-xs font-black uppercase tracking-[.2em] text-[var(--lime)]">Laget for trenerrommet</p><h1 className="mt-5 text-6xl font-black leading-[.98] tracking-[-.06em]">Én økt.<br />Hele trenerteamet<br />samkjørt.</h1><p className="mt-6 max-w-md text-lg leading-8 text-white/60">Planlegg ulike bolker samtidig, se endringer med én gang og møt forberedt på trening.</p></div></section>
    <main className="grid place-items-center p-5 sm:p-10"><div className="w-full max-w-md"><div className="mb-10 lg:hidden"><Logo /></div><p className="text-xs font-black uppercase tracking-[.17em] text-[var(--orange)]">Velkommen til Grep</p><h2 className="mt-3 text-4xl font-black tracking-[-.055em]">Logg inn.</h2>
      {sent
        ? <div className="mt-7"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--mint)]"><MailCheck size={25} /></span><h3 className="mt-5 text-2xl font-black tracking-[-.04em]">Sjekk e-posten din</h3><p className="mt-3 leading-7 text-[var(--ink-soft)]">Hvis <strong className="font-bold text-[var(--ink)]">{email.trim()}</strong> har tilgang til Grep, har vi sendt en sikker engangslenke. Åpne den i nettleseren du vil bruke.</p><Button variant="secondary" className="mt-6 w-full" onClick={() => { setSent(false); setError(null); }}>Send en ny lenke</Button></div>
        : <><p className="mt-4 leading-7 text-[var(--ink-soft)]">{isDemoMode ? "Demomodus — e-postadressen åpner demoarbeidsområdet." : useLocalPassword ? "Lokal innlogging bruker det eksisterende Supabase-passordet og sender ingen e-post." : "Skriv inn e-postadressen din. Vi sender en sikker engangslenke — du trenger ikke passord."}</p><form className="mt-8 grid gap-4" onSubmit={submit}><label className="grid gap-2 text-sm font-bold">E-postadresse<div className="relative"><Mail className="absolute left-3.5 top-3.5 text-[var(--ink-soft)]" size={18} /><input type="email" required autoComplete={useLocalPassword ? "username" : "email"} value={email} onChange={(event) => setEmail(event.target.value)} className={`${inputClass} pl-10`} placeholder="trener@klubb.no" autoFocus /></div></label>{useLocalPassword && <label className="grid gap-2 text-sm font-bold">Passord<div className="relative"><KeyRound className="absolute left-3.5 top-3.5 text-[var(--ink-soft)]" size={18} /><input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className={`${inputClass} pl-10`} placeholder="••••••••••" /></div></label>}{error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-[var(--danger)]">{error}</p>}<Button size="lg" disabled={loading}>{loading ? useLocalPassword ? "Logger inn …" : "Sender …" : useLocalPassword ? <><KeyRound size={18} />Logg inn lokalt</> : <><Mail size={18} />Send innloggingslenke</>}</Button></form>{localPasswordAvailable && !isDemoMode && <button type="button" className="mt-5 w-full text-sm font-bold text-[var(--ink-soft)] underline decoration-[var(--line)] underline-offset-4 hover:text-[var(--ink)]" onClick={() => { setUseLocalPassword((current) => !current); setError(null); }}>{useLocalPassword ? "Bruk innloggingslenke" : "Bruk passord på localhost"}</button>}<p className="mt-6 text-sm leading-6 text-[var(--ink-soft)]">{useLocalPassword ? "Dette valget vises bare når Grep åpnes på localhost." : "Nettleseren husker innloggingen din. Du trenger vanligvis bare en ny lenke på en ny enhet eller etter at du logger ut."}</p></>}
    </div></main>
  </div>;
}

export default function SignInPage() { return <Suspense><SignInForm /></Suspense>; }
