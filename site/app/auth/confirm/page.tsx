"use client";

import { LogIn, MailCheck, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useGrep } from "@/components/app-provider";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui";
import { internalPath } from "@/lib/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

// Supabase email links land on this app-owned page with a token hash. The hash
// is deliberately exchanged only after a real button click: security scanners
// often open links while inspecting an email, and must not consume a one-time
// login before the coach reaches it.
const linkTypes = ["invite", "recovery", "signup", "magiclink", "email", "email_change"] as const;
type LinkType = (typeof linkTypes)[number];

function isLinkType(value: string | null): value is LinkType {
  return value !== null && (linkTypes as readonly string[]).includes(value);
}

function ConfirmLink() {
  const { user, isDemoMode } = useGrep();
  const router = useRouter();
  const search = useSearchParams();
  const [status, setStatus] = useState<"idle" | "verifying" | "verified" | "error">("idle");
  const [rejected, setRejected] = useState<string | null>(null);
  const [verifiedUserId, setVerifiedUserId] = useState<string | null>(null);
  const tokenHash = search.get("token_hash");
  const type = search.get("type");
  const next = internalPath(search.get("next"));
  const malformed = isDemoMode ? "Demomodus er aktiv, så det finnes ingen konto å bekrefte."
    : !tokenHash || !isLinkType(type) ? "Lenken mangler informasjon. Be om en ny innloggingslenke." : null;
  const error = malformed ?? rejected;

  async function verify() {
    if (malformed || !tokenHash || !isLinkType(type)) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setStatus("verifying");
    setRejected(null);
    const { data, error: caught } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (caught) {
      setRejected("Lenken er allerede brukt eller har utløpt. Be om en ny innloggingslenke.");
      setStatus("error");
      return;
    }
    setVerifiedUserId(data.user?.id ?? null);
    setStatus("verified");
  }

  // The auth event updates the provider after verifyOtp stores the session.
  // Match the actual verified identity as well: someone may open an invitation
  // while another coach is already signed in in this browser.
  useEffect(() => { if (status === "verified" && verifiedUserId && user?.id === verifiedUserId) router.replace(next); }, [next, router, status, user, verifiedUserId]);

  const failed = Boolean(error) || status === "error";
  return <main className="grid min-h-screen place-items-center p-6"><div className="w-full max-w-md rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-8 text-center shadow-[var(--shadow)]"><Logo /><span className="mx-auto mt-8 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--mint)]">{failed ? <ShieldAlert size={27} /> : status === "verified" ? <MailCheck size={27} /> : <LogIn size={27} />}</span><h1 className="mt-6 text-3xl font-black tracking-[-.045em]">{failed ? "Lenken virker ikke lenger" : status === "idle" ? "Klar til å logge inn" : "Logger deg inn …"}</h1><p className="mt-3 leading-7 text-[var(--ink-soft)]">{error ?? (status === "idle" ? "Trykk på knappen for å bekrefte at det er du som åpnet e-posten." : "Vent litt — vi gjør trenerrommet klart.")}</p>{failed ? <Link href="/sign-in" className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--orange)] px-5 font-bold text-white">Be om en ny lenke</Link> : <Button className="mt-7 w-full" disabled={status !== "idle"} onClick={() => void verify()}>{status === "idle" ? <><LogIn size={18} />Fortsett til Grep</> : "Et øyeblikk …"}</Button>}</div></main>;
}

export default function ConfirmPage() { return <Suspense><ConfirmLink /></Suspense>; }
