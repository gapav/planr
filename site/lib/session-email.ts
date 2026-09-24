/**
 * "Dagens økt" — the letter the scheduled job sends on a training morning.
 *
 * The subject only names the team — «Dagens økt for G14» — and the body is the
 * plan itself rather than a nudge to go and look at the plan. A coach standing in a hall with a phone should not
 * need to sign in to remember what the third block was.
 *
 * Only one session's worth of detail per day is usually in play, but a coach on
 * two teams can have two, so everything here is written in the plural and the
 * singular case is the one-element version of it.
 */

import { emailShell, escapeHtml } from "./email-shell";
import type { DigestSession } from "./session-digest";
import { CLUB_TIME_ZONE } from "./time";
import { minutesLabel } from "./utils";

export interface DigestEmail { subject: string; html: string; text: string }

export interface DigestEmailInput {
  recipient: { profileId: string; fullName: string };
  sessions: readonly DigestSession[];
  /** Origin the links point at, e.g. `https://grep.team`. */
  siteUrl: string;
  timeZone?: string;
}

function clockTime(startsAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat("nb-NO", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(startsAt));
}

/**
 * When each block falls on the clock, as `16:05–16:45`. The letter is read once
 * and away from the app, so unlike the screen — where a block's end is the next
 * block's start, one row down — each block here states both of its ends.
 *
 * Mirrors `sessionSchedule`: the session's start plus the blocks before it, in
 * the club's zone, and always the planned time.
 */
function blockRanges(session: DigestSession, timeZone: string): string[] {
  const start = new Date(session.startsAt).getTime();
  if (Number.isNaN(start)) return session.blocks.map(() => "");
  let minutes = 0;
  return session.blocks.map((block) => {
    const from = new Date(start + minutes * 60_000).toISOString();
    minutes += block.items.reduce((total, item) => total + item.durationMinutes, 0);
    const to = new Date(start + minutes * 60_000).toISOString();
    return `${clockTime(from, timeZone)}–${clockTime(to, timeZone)}`;
  });
}

/** The month a session falls in, named — «september» — for the focus band's label. */
function monthName(startsAt: string, timeZone: string): string {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("nb-NO", { month: "long", timeZone }).format(date);
}

function sessionLink(siteUrl: string, session: DigestSession): string {
  return `${siteUrl.replace(/\/+$/, "")}/sessions/${session.id}`;
}

/** The first name alone; the letter is a greeting, not an address label. */
function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || "trener";
}

/**
 * The teams training today, as a sentence names them: «A», «A og B»,
 * «A, B og C». A team with two sessions is named once.
 */
function teamList(sessions: readonly DigestSession[]): string {
  const names = [...new Set(sessions.map((session) => session.teamName.trim()).filter(Boolean))];
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} og ${names[names.length - 1]}`;
}

/** Short on purpose: the team is what a coach scans an inbox for; the plan is inside. */
export function digestSubject(sessions: readonly DigestSession[]): string {
  const teams = teamList(sessions);
  const noun = sessions.length > 1 ? "Dagens økter" : "Dagens økt";
  return teams ? `${noun} for ${teams}` : noun;
}

/* -------------------------------------------------------------------------- */

/**
 * One activity, as a white card on the session's paper ground.
 *
 * The first version set blocks and activities in the same weight and colour,
 * and the letter read as one flat list — the screenshot that proved it had a
 * block header and the activity under it looking identical. So the two levels
 * are now told apart by *kind* rather than by size: a block is a small
 * uppercase label on a rule, an activity is a card. Right-aligning the minutes
 * in their own table cell keeps them in a column instead of trailing each title
 * at a different indent.
 */
function itemLine(item: DigestSession["blocks"][number]["items"][number], recipientId: string, station?: number): string {
  const mine = item.assignedCoachId === recipientId;
  const badge = mine
    ? `<div style="margin:8px 0 0"><span style="display:inline-block;padding:3px 9px;background:#FFF0E7;border-radius:999px;color:#684535;font-size:11px;font-weight:900;letter-spacing:.8px;text-transform:uppercase">Du har ansvar</span></div>`
    : "";
  const notes = item.coachingNotes.trim()
    ? `<div style="margin:6px 0 0;color:#706479;font-size:13px;line-height:1.55">${escapeHtml(item.coachingNotes.trim())}</div>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="margin-top:8px;background:#ffffff;border:1px solid #E8E1E9;border-radius:13px"><tr><td style="padding:13px 15px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="color:#2E1B3D;font-size:15px;font-weight:700;line-height:1.4">${station ? `<span style="color:#706479;font-weight:900">${station}.</span> ` : ""}${escapeHtml(item.title)}</td>
<td align="right" valign="top" style="padding-left:12px;color:#706479;font-size:13px;font-weight:700;white-space:nowrap">${station ? "" : escapeHtml(minutesLabel(item.durationMinutes))}</td>
</tr></table>${notes}${badge}
</td></tr></table>`;
}

/** A block header: the label the activities under it belong to, not a row itself. */
function blockSection(block: DigestSession["blocks"][number], recipientId: string, range: string): string {
  const minutes = block.items.reduce((total, item) => total + item.durationMinutes, 0);
  const notes = block.notes.trim()
    ? `<p style="margin:8px 0 0;color:#706479;font-size:13px;line-height:1.55">${escapeHtml(block.notes.trim())}</p>`
    : "";
  const stations = block.kind === "stations";
  const rotation = stations && block.items.length
    ? `<p style="margin:8px 0 0;color:#706479;font-size:13px;font-weight:700">${block.items.length} stasjoner × ${escapeHtml(minutesLabel(block.items[0].durationMinutes))} — laget roterer.</p>`
    : "";
  const items = block.items.length
    ? block.items.map((item, index) => itemLine(item, recipientId, stations ? index + 1 : undefined)).join("")
    : `<p style="margin:8px 0 0;color:#706479;font-size:14px">${stations ? "Ingen stasjoner lagt inn." : "Ingen aktiviteter lagt inn."}</p>`;
  return `<div style="margin-top:26px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:2px solid #E9DDF7"><tr>
<td style="padding:0 0 7px;color:#2E1B3D;font-size:12px;font-weight:900;letter-spacing:1.5px;text-transform:uppercase">${escapeHtml(block.title)}</td>
<td align="right" style="padding:0 0 7px;color:#706479;font-size:12px;font-weight:800;white-space:nowrap">${range ? `${escapeHtml(range)} · ` : ""}${escapeHtml(minutesLabel(minutes))}</td>
</tr></table>${rotation}${notes}${items}</div>`;
}

/**
 * «Månedens fokus», as the band it is on the overview screen.
 *
 * It sits above the session's own objective because that is the order the two
 * are read in: the month's aim is the frame, `Mål` is what today does about it.
 * Soft peach is the screen's own grammar for this band — the one warm surface
 * on a lilac page — and here it also does the work the letter needs: the note
 * is the only thing in the card that is not today's plan, so it has to read as
 * a different kind of thing from the white activity rows below it.
 */
function focusBand(session: DigestSession, timeZone: string): string {
  const note = session.monthFocus.trim();
  if (!note) return "";
  const month = monthName(session.startsAt, timeZone);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFF1E7" style="margin-top:14px;background:#FFF1E7;border:1px solid #FFDCC6;border-radius:13px"><tr><td style="padding:13px 15px">
<p style="margin:0;color:#8A5A3C;font-size:11px;font-weight:900;letter-spacing:1.1px;text-transform:uppercase">Månedens fokus${month ? ` · ${escapeHtml(month)}` : ""}</p>
<p style="margin:5px 0 0;color:#2E1B3D;font-size:14px;line-height:1.6">${escapeHtml(note)}</p>
</td></tr></table>`;
}

/**
 * Minutes the way the app states them: what the plan actually holds, against
 * what the session was booked for. Showing the booked figure alone would have
 * this letter claim 90 minutes for a plan with 50 in it.
 */
function durationLabel(session: DigestSession): string {
  const built = session.blocks.reduce((total, block) => total + block.items.reduce((sum, item) => sum + item.durationMinutes, 0), 0);
  if (session.plannedDurationMinutes <= 0) return built > 0 ? minutesLabel(built) : "";
  if (built === 0) return minutesLabel(session.plannedDurationMinutes);
  return `${built} av ${session.plannedDurationMinutes} min`;
}

function factLine(session: DigestSession, timeZone: string): string {
  const facts = [`Kl. ${clockTime(session.startsAt, timeZone)}`, session.venue.trim(), durationLabel(session)].filter(Boolean);
  return escapeHtml(facts.join(" · "));
}

function sessionCard(session: DigestSession, recipientId: string, timeZone: string): string {
  const ranges = blockRanges(session, timeZone);
  const objective = session.objective.trim()
    ? `<p style="margin:10px 0 0;color:#706479;font-size:15px;line-height:1.6"><strong style="color:#2E1B3D">Mål:</strong> ${escapeHtml(session.objective.trim())}</p>`
    : "";
  const notes = session.notes.trim()
    ? `<p style="margin:14px 0 0;color:#706479;font-size:13px;line-height:1.6">${escapeHtml(session.notes.trim())}</p>`
    : "";
  const started = session.status === "in_progress"
    ? `<p style="margin:10px 0 0;color:#684535;font-size:13px;font-weight:800">Økta er allerede startet.</p>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F7F2FA" style="margin-top:24px;background:#F7F2FA;border:1px solid #E8E1E9;border-radius:18px"><tr><td style="padding:20px 22px">
<p style="margin:0;color:#706479;font-size:12px;font-weight:800;letter-spacing:.9px;text-transform:uppercase">${escapeHtml(session.teamName)}</p>
<h2 style="margin:6px 0 0;color:#2E1B3D;font-size:21px;line-height:1.25;font-weight:900;letter-spacing:-.5px">${escapeHtml(session.title)}</h2>
<p style="margin:7px 0 0;color:#706479;font-size:14px;font-weight:700">${factLine(session, timeZone)}</p>
${started}${focusBand(session, timeZone)}${objective}${session.blocks.map((block, index) => blockSection(block, recipientId, ranges[index])).join("")}${notes}
</td></tr></table>`;
}

/* -------------------------------------------------------------------------- */

function sessionText(session: DigestSession, recipientId: string, siteUrl: string, timeZone: string): string {
  const lines = [
    `${session.teamName} — ${session.title}`,
    [`Kl. ${clockTime(session.startsAt, timeZone)}`, session.venue.trim(), durationLabel(session)].filter(Boolean).join(" · "),
  ];
  if (session.status === "in_progress") lines.push("Økta er allerede startet.");
  if (session.monthFocus.trim()) {
    const month = monthName(session.startsAt, timeZone);
    lines.push(`Månedens fokus${month ? ` (${month})` : ""}: ${session.monthFocus.trim()}`);
  }
  if (session.objective.trim()) lines.push(`Mål: ${session.objective.trim()}`);
  const ranges = blockRanges(session, timeZone);
  for (const [blockIndex, block] of session.blocks.entries()) {
    const minutes = block.items.reduce((total, item) => total + item.durationMinutes, 0);
    const stations = block.kind === "stations";
    lines.push("", `${block.title} (${[ranges[blockIndex], minutesLabel(minutes)].filter(Boolean).join(", ")})`);
    if (stations && block.items.length) lines.push(`  ${block.items.length} stasjoner × ${minutesLabel(block.items[0].durationMinutes)} — laget roterer.`);
    if (block.notes.trim()) lines.push(`  ${block.notes.trim()}`);
    for (const [index, item] of block.items.entries()) {
      const mine = item.assignedCoachId === recipientId ? " — du har ansvar" : "";
      lines.push(stations ? `  - ${index + 1}. ${item.title}${mine}` : `  - ${item.title} (${minutesLabel(item.durationMinutes)})${mine}`);
      if (item.coachingNotes.trim()) lines.push(`    ${item.coachingNotes.trim()}`);
    }
  }
  if (session.notes.trim()) lines.push("", session.notes.trim());
  lines.push("", sessionLink(siteUrl, session));
  return lines.join("\n");
}

/**
 * The whole letter. Returns `null` for an empty list rather than an empty
 * letter — a digest with nothing in it is never worth sending, and saying so in
 * the type keeps the route from having to remember that.
 */
export function dailySessionDigestEmail({ recipient, sessions, siteUrl, timeZone = CLUB_TIME_ZONE }: DigestEmailInput): DigestEmail | null {
  if (sessions.length === 0) return null;
  const [first] = sessions;
  const heading = sessions.length === 1
    ? `${first.title}, kl. ${clockTime(first.startsAt, timeZone)}`
    : `${sessions.length} økter i dag`;
  const lead = sessions.length === 1
    ? `Hei ${escapeHtml(firstName(recipient.fullName))} — her er økta <strong>${escapeHtml(first.teamName)}</strong> kjører i dag. Hele planen står under, så du har den i lomma.`
    : `Hei ${escapeHtml(firstName(recipient.fullName))} — i dag har ${escapeHtml(teamList(sessions))} trening. Alle planene står under.`;
  const body = sessions.map((session) => sessionCard(session, recipient.profileId, timeZone)).join("");
  const action = sessions.length === 1
    ? { label: "Åpne økta i Grep", link: sessionLink(siteUrl, first) }
    : { label: "Åpne øktene i Grep", link: `${siteUrl.replace(/\/+$/, "")}/sessions` };

  return {
    subject: digestSubject(sessions),
    html: emailShell({
      preheader: [first.teamName, first.venue.trim()].filter(Boolean).join(" · ") || first.title,
      eyebrow: "Dagens økt",
      heading,
      lead,
      body,
      action,
      note: {
        title: "Vil du ikke ha denne?",
        text: "Skru av «Dagens økt på e-post» under Lag og spillere i Grep, så slutter den å komme.",
      },
      footer: "Du får denne e-posten fordi du er trener på et lag som trener i dag.<br>Grep · laget for trenerrommet",
    }),
    text: [
      `Hei ${firstName(recipient.fullName)} — her er det som står på planen i dag.`,
      "",
      sessions.map((session) => sessionText(session, recipient.profileId, siteUrl, timeZone)).join("\n\n---\n\n"),
      "",
      "Vil du ikke ha denne e-posten? Skru av «Dagens økt på e-post» under Lag og spillere i Grep.",
    ].join("\n"),
  };
}
