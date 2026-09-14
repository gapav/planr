"use client";

import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check } from "lucide-react";
import styles from "./introduction.module.css";

export function InterestForm() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const status = useRef<HTMLDivElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    inFlight.current = true;
    setState("sending");
    setError("");
    try {
      const response = await fetch("/api/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
        signal: AbortSignal.timeout(15_000),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error(result.error || "Kunne ikke sende forespørselen. Prøv igjen.");
      setState("sent");
      form.reset();
      requestAnimationFrame(() => status.current?.focus());
    } catch (failure) {
      setError(failure instanceof Error && failure.name !== "TimeoutError" && failure.name !== "TypeError"
        ? failure.message : "Kunne ikke sende forespørselen. Sjekk forbindelsen og prøv igjen.");
      setState("error");
    } finally { inFlight.current = false; }
  }

  return <div className={styles.interestForm}>
    <div ref={status} tabIndex={-1} role="status" aria-live="polite" className={state === "sent" ? styles.success : undefined}>
      {state === "sent" && <><span className={styles.successIcon}><Check size={26} aria-hidden /></span><h3>Takk for interessen!</h3><p>Forespørselen er sendt. Vi tar kontakt på e-post om å prøve Grep med laget ditt.</p><p>Du trenger ikke gjøre noe mer nå.</p></>}
    </div>
    {state !== "sent" && <form onSubmit={submit} aria-label="Meld interesse" aria-describedby="interest-privacy" aria-busy={state === "sending"}>
      <div className={styles.formRow}>
        <label htmlFor="interest-name">Navnet ditt<input id="interest-name" name="name" autoComplete="name" required minLength={2} maxLength={80} placeholder="Ingrid Berg" /></label>
        <label htmlFor="interest-email">E-post<input id="interest-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="deg@eksempel.no" /></label>
      </div>
      <label htmlFor="interest-team">Klubb / lag<input id="interest-team" name="team" autoComplete="organization" required minLength={2} maxLength={120} placeholder="For eksempel Fjordvik IL · J2016" /></label>
      <label htmlFor="interest-message">Noe du vil fortelle? <span>(valgfritt)</span><textarea id="interest-message" name="message" maxLength={1500} rows={3} placeholder="Gjerne idrett, aldersgruppe eller hva dere ønsker hjelp med." /></label>
      <div className={styles.honeypot} aria-hidden="true"><label htmlFor="interest-website">La dette feltet stå tomt<input id="interest-website" name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <p id="interest-privacy" className={styles.formPrivacy}>Opplysningene sendes til Grep på e-post og brukes til å følge opp forespørselen din. Ikke ta med navn eller andre opplysninger om spillere.</p>
      {error && <p role="alert" className={styles.formError}>{error}</p>}
      <button type="submit" disabled={state === "sending"} className={styles.primary}>{state === "sending" ? "Sender …" : "Send interesse"}<ArrowRight size={18} aria-hidden /></button>
    </form>}
  </div>;
}
