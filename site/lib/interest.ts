import { z } from "zod";
import { emailShell, escapeHtml } from "./email-shell";

const singleLine = (max: number) => z.string().trim().min(2).max(max).regex(/^[^\r\n\x00-\x1f]+$/);

export const interestSchema = z.object({
  name: singleLine(80),
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  team: singleLine(120),
  message: z.string().trim().max(1500).default(""),
  website: z.string().max(200).default(""),
}).strict();

export type Interest = z.infer<typeof interestSchema>;

export function interestEmail({ name, email, team, message }: Interest) {
  const rows = [["Navn", name], ["E-post", email], ["Klubb / lag", team]];
  return {
    subject: "Et nytt lag vil prøve Grep",
    html: emailShell({
      preheader: "En trener har meldt interesse via velkomstsiden.",
      eyebrow: "Interesse for Grep",
      heading: "Et nytt lag vil være med.",
      lead: "En trener ønsker å prøve Grep med laget sitt. Svar på denne e-posten for å ta kontakt direkte.",
      body: `<table role="presentation" style="width:100%;margin-top:22px;border-collapse:collapse">${rows.map(([label, value]) => `<tr><td style="padding:10px 8px;color:#706479;vertical-align:top">${label}</td><td style="padding:10px 8px;color:#2E1B3D">${escapeHtml(value)}</td></tr>`).join("")}</table>${message ? `<div style="padding:18px;margin-top:18px;background:#F1EAF8;border-radius:14px;color:#2E1B3D;white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(message)}</div>` : ""}`,
      footer: "Sendt fra interesseskjemaet på Grep. Ingen konto eller invitasjon er opprettet automatisk.",
    }),
    text: `En trener vil prøve Grep. Svar på denne e-posten for å ta kontakt.\n\nNavn: ${name}\nE-post: ${email}\nKlubb / lag: ${team}\n\n${message || "Ingen ekstra melding."}\n\nIngen konto eller invitasjon er opprettet automatisk.`,
  };
}
