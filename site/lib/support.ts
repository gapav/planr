import { z } from "zod";
import { emailShell, escapeHtml } from "./email-shell";

export const SUPPORT_MESSAGE_MAX_LENGTH = 3000;

/**
 * What the coach writes. Who they are is deliberately absent: the route takes
 * name and address from the verified session, so nobody can send support mail
 * in someone else's name. `page` is where the dialog was opened, a hint for
 * reproducing the problem.
 */
export const supportSchema = z.object({
  message: z.string().trim().min(5).max(SUPPORT_MESSAGE_MAX_LENGTH),
  page: z.string().trim().max(200).regex(/^\/[^\r\n\x00-\x1f]*$/).default("/"),
}).strict();

export type SupportRequest = z.infer<typeof supportSchema>;

export interface SupportSender { name: string; email: string; teams: string[] }

export function supportEmail({ message, page }: SupportRequest, sender: SupportSender) {
  const teams = sender.teams.length ? sender.teams.join(", ") : "Ingen lag";
  const rows = [["Navn", sender.name], ["E-post", sender.email], ["Lag", teams], ["Side", page]];
  return {
    subject: `Support fra ${sender.name}`,
    html: emailShell({
      preheader: message.slice(0, 120),
      eyebrow: "Support i Grep",
      heading: "En trener trenger hjelp.",
      lead: "Meldingen kom fra hjelpeknappen i Grep. Svar på denne e-posten for å svare treneren direkte.",
      body: `<table role="presentation" style="width:100%;margin-top:22px;border-collapse:collapse">${rows.map(([label, value]) => `<tr><td style="padding:10px 8px;color:#706479;vertical-align:top">${label}</td><td style="padding:10px 8px;color:#2E1B3D;overflow-wrap:anywhere">${escapeHtml(value)}</td></tr>`).join("")}</table><div style="padding:18px;margin-top:18px;background:#F1EAF8;border-radius:14px;color:#2E1B3D;white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(message)}</div>`,
      footer: "Sendt fra hjelpeknappen i Grep av en innlogget trener.",
    }),
    text: `${sender.name} trenger hjelp i Grep. Svar på denne e-posten for å svare direkte.\n\nNavn: ${sender.name}\nE-post: ${sender.email}\nLag: ${teams}\nSide: ${page}\n\n${message}`,
  };
}
