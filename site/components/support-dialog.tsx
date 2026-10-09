"use client";

import { CheckCircle2, Send } from "lucide-react";
import { useState } from "react";
import { useGrep } from "./app-provider";
import { Button, Field, Modal, textareaClass } from "./ui";
import { SUPPORT_MESSAGE_MAX_LENGTH } from "@/lib/support";

/**
 * The help button's dialog. The coach only writes the message: who they are
 * comes from the session on the server, and the page they were on rides along
 * so a bug report says where it happened.
 */
export function SupportDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { user, sendSupportMessage } = useGrep();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function close() {
    if (busy) return;
    if (sent) { setMessage(""); setSent(false); }
    setError(null);
    onClose();
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (message.trim().length < 5) { setError("Skriv litt mer om hva du trenger hjelp med."); return; }
    setBusy(true); setError(null);
    try { await sendSupportMessage(message, window.location.pathname); setSent(true); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Meldingen kunne ikke sendes."); }
    finally { setBusy(false); }
  }

  return <Modal open={open} onClose={close} size="sm" title="Kontakt support" description="Noe som ikke virker, eller en idé? Skriv det her, så kommer svaret på e-post.">
    {sent ? <div role="status" className="grid gap-4">
      <p className="flex items-start gap-3 text-sm leading-6"><CheckCircle2 size={20} className="mt-0.5 shrink-0 text-[var(--accent)]" />Takk! Meldingen er sendt, og svaret kommer til {user?.email ?? "e-postadressen din"}.</p>
      <div className="flex justify-end"><Button type="button" onClick={close}>Lukk</Button></div>
    </div> : <form onSubmit={send} className="grid gap-4">
      <Field label="Melding" hint={`${message.length} / ${SUPPORT_MESSAGE_MAX_LENGTH}`}>
        <textarea autoFocus value={message} maxLength={SUPPORT_MESSAGE_MAX_LENGTH} onChange={(event) => { setMessage(event.target.value); setError(null); }} className={textareaClass} placeholder="Beskriv hva du prøvde å gjøre og hva som skjedde." />
      </Field>
      <p className="text-xs leading-5 text-[var(--ink-soft)]">Ikke skriv inn opplysninger om spillere. Navnet og e-postadressen din sendes med, slik at vi kan svare.</p>
      {error && <p role="alert" className="text-sm font-semibold text-[var(--danger)]">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={close} disabled={busy}>Avbryt</Button>
        <Button type="submit" disabled={busy}><Send size={16} />{busy ? "Sender …" : "Send"}</Button>
      </div>
    </form>}
  </Modal>;
}
