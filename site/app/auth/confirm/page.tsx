"use client";

import { MailCheck, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useGrep } from "@/components/app-provider";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui";
import { internalPath } from "@/lib/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Where Supabase's own emails land.
 *
 * The default `{{ .ConfirmationURL }}` goes through `/auth/v1/verify`, which
 * answers a dashboard-generated invite with an *implicit* grant — a
 * `#access_token=…` fragment. `createBrowserClient` pins `flowType: "pkce"`
 * after spreading its options, so it cannot be talked out of it, and it rejects
 * that fragment outright ("Not a valid PKCE flow url."): the coach lands signed
 * out with nothing on screen to say why. `verifyOtp` sets the session straight
 * from the token hash instead, so no grant flow is involved at all.
 *
 * Point the Supabase email templates here:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite
 *
 * Linking to our own origin also means no redirect allow-list entry is needed.
 */
const linkTypes = ["invite", "recovery", "signup", "magiclink", "email", "email_change"] as const;
type LinkType = (typeof linkTypes)[number];

function isLinkType(value: string | null): value is LinkType {
  return value !== null && (linkTypes as readonly string[]).includes(value);
}

function ConfirmLink() {
  const { user, isDemoMode } = useGrep(); const router = useRouter(); const search = useSearchParams();
  const [rejected, setRejected] = useState<string | null>(null); const [verified, setVerified] = useState(false);
  const attempted = useRef(false);
  const tokenHash = search.get("token_hash"); const type = search.get("type"); const next = internalPath(search.get("next"));
  // What is wrong with the link itself, before Supabase is asked about it.
  const malformed = isDemoMode ? "Demomodus er aktiv, så det finnes ingen konto å bekrefte."
    : !tokenHash || !isLinkType(type) ? "Lenken mangler informasjon. Be lagadministratoren sende invitasjonen på nytt." : null;
  const error = malformed ?? rejected;
  // An invited account has no password of its own yet, and a recovery link is a
  // request to choose one, so both go to the password form; `next` carries the
  // real destination through it.
  const destination = type === "invite" || type === "recovery" ? `/account/password?next=${encodeURIComponent(next)}` : next;

  useEffect(() => {
    if (malformed || attempted.current) return; attempted.current = true;
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !tokenHash || !isLinkType(type)) return;
    void supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ error: caught }) => {
      if (caught) { setRejected("Lenken er allerede brukt eller har utløpt. Be lagadministratoren sende invitasjonen på nytt."); return; }
      setVerified(true);
    });
  }, [malformed, tokenHash, type]);

  // Wait for the provider to have picked the new session up. `verifyOtp` stores
  // it before it announces it, so navigating on the resolved promise alone can
  // reach the password form while `user` is still null — and that form answers a
  // missing user by bouncing to sign-in, throwing away the link we just spent.
  useEffect(() => { if (verified && user) router.replace(destination); }, [destination, router, user, verified]);

  return <main className="grid min-h-screen place-items-center p-6"><div className="w-full max-w-md rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-8 text-center shadow-[var(--shadow)]"><Logo /><span className="mx-auto mt-8 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--mint)]">{error ? <ShieldAlert size={27} /> : <MailCheck size={27} />}</span><h1 className="mt-6 text-3xl font-black tracking-[-.045em]">{error ? "Lenken virker ikke lenger" : "Bekrefter lenken …"}</h1><p className="mt-3 leading-7 text-[var(--ink-soft)]">{error ?? "Vent litt — vi logger deg inn og sender deg videre."}</p>{error ? <Link href="/sign-in" className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--orange)] px-5 font-bold text-white">Gå til innlogging</Link> : <Button className="mt-7 w-full" disabled>Et øyeblikk …</Button>}</div></main>;
}

export default function ConfirmPage() { return <Suspense><ConfirmLink /></Suspense>; }
