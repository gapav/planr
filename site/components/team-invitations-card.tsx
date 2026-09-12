"use client";

import { Check, Copy, Mail, Send, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { useGrep, type InviteResult } from "@/components/app-provider";
import { Button, Field, inputClass, Modal, Tag } from "@/components/ui";
import { invitationUrl } from "@/lib/auth";
import type { Team, TeamInvitation } from "@/lib/types";

export function TeamInvitationsCard({ team, invitations }: { team: Team; invitations: TeamInvitation[] }) {
  const { adminInviteMember, adminResendInvitation, adminRevokeInvitation } = useGrep();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [resent, setResent] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setEmail("");
    setError(null);
    setResult(null);
  }

  async function copy(id: string, link: string) {
    await navigator.clipboard.writeText(link);
    setCopied(id);
    window.setTimeout(() => setCopied((current) => current === id ? null : current), 2500);
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(await adminInviteMember(team.id, email, "coach"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invitasjonen kunne ikke opprettes.");
    } finally {
      setBusy(false);
    }
  }

  async function resend(invitation: TeamInvitation) {
    setBusy(true);
    setError(null);
    try {
      const next = await adminResendInvitation(team.id, invitation.id);
      if (next.emailed) {
        setResent(invitation.id);
        window.setTimeout(() => setResent((current) => current === invitation.id ? null : current), 2500);
      } else {
        setEmail(invitation.email);
        setResult(next);
        setOpen(true);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invitasjonen kunne ikke sendes på nytt.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(invitation: TeamInvitation) {
    setBusy(true);
    setError(null);
    try {
      await adminRevokeInvitation(team.id, invitation.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invitasjonen kunne ikke trekkes tilbake.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="mt-6 overflow-hidden rounded-[26px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_8px_30px_rgba(16,32,29,.04)]">
    <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
      <div><h2 className="text-xl font-black">Inviter trenere</h2><p className="mt-1 text-sm text-[var(--ink-soft)]">Treneren får en sikker innloggingslenke på e-post og blir med på laget.</p></div>
      <Button onClick={() => setOpen(true)}><UserPlus size={17} />Inviter trener</Button>
    </div>
    {error && <p role="alert" className="mx-5 mb-5 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-[var(--danger)] sm:mx-6">{error}</p>}
    {invitations.length > 0 && <div className="border-t border-[var(--line)] bg-[var(--paper)]/55 p-5 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[.13em] text-[var(--ink-soft)]">Ventende invitasjoner</p>
      <div className="mt-3 grid gap-2">{invitations.map((invitation) => {
        return <div key={invitation.id} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5">
          <Mail size={16} className="shrink-0 text-[var(--ink-soft)]" />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{invitation.email}</p><Tag>venter</Tag></div>
          <Button variant="ghost" size="sm" className="px-2" disabled={busy} aria-label={`Send invitasjonen til ${invitation.email} på nytt`} onClick={() => void resend(invitation)}>{resent === invitation.id ? <Check size={15} className="text-[var(--green)]" /> : <Send size={15} />}</Button>
          <Button variant="ghost" size="sm" className="px-2" disabled={!invitation.token} aria-label={`Kopier reserveinvitasjonen for ${invitation.email}`} onClick={() => invitation.token && void copy(invitation.id, invitationUrl(window.location.origin, invitation.token))}>{copied === invitation.id ? <Check size={15} className="text-[var(--green)]" /> : <Copy size={15} />}</Button>
          <Button variant="ghost" size="sm" className="px-2 text-[var(--danger)]" disabled={busy} aria-label={`Trekk tilbake invitasjonen til ${invitation.email}`} onClick={() => void revoke(invitation)}><X size={16} /></Button>
        </div>;
      })}</div>
    </div>}

    <Modal open={open} onClose={close} title={result ? (result.emailed ? "Invitasjonen er sendt" : "Send lenken manuelt") : `Inviter trener til ${team.shortName}`} description={result ? "Innloggingslenken virker én gang og er knyttet til trenerens e-postadresse." : "Treneren trenger ikke opprette eller huske et passord."}>
      {result
        ? <div className="grid gap-4">
            {result.emailed
              ? <p className="rounded-xl bg-[var(--mint)] px-3 py-2 text-sm font-semibold">E-posten er sendt til {email}.</p>
              : <><p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">{result.emailError}</p><p className="text-sm leading-6 text-[var(--ink-soft)]">Invitasjonen er fortsatt opprettet. Send denne engangslenken direkte til <strong>{email}</strong>:</p><div className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-3"><p className="break-all font-mono text-[13px] leading-6">{result.loginLink ?? result.inviteUrl}</p></div></>}
            <div className="flex justify-end gap-2">{!result.emailed && <Button type="button" variant="secondary" onClick={() => void copy("new", result.loginLink ?? result.inviteUrl)}>{copied === "new" ? <><Check size={17} />Kopiert</> : <><Copy size={17} />Kopier lenken</>}</Button>}<Button type="button" onClick={close}>Ferdig</Button></div>
          </div>
        : <form className="grid gap-5" onSubmit={invite}>
            <Field label="Trenerens e-postadresse"><div className="relative"><Mail className="absolute left-3.5 top-3.5 text-[var(--ink-soft)]" size={17} /><input type="email" required className={`${inputClass} pl-10`} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="trener@klubb.no" autoFocus /></div></Field>
            {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-[var(--danger)]">{error}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={close}>Avbryt</Button><Button disabled={busy}>{busy ? "Sender…" : "Send invitasjon"}</Button></div>
          </form>}
    </Modal>
  </section>;
}
