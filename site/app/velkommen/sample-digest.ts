/**
 * The letter on the introduction page is the real letter.
 *
 * `dailySessionDigestEmail` renders it from this one invented session, so the
 * preview a coach reads on grep.team cannot drift from what the scheduled job
 * actually puts in their inbox — a hand-copied mockup would have within a
 * month. The data is fictional; the markup around it is production code.
 */

import { dailySessionDigestEmail } from "@/lib/session-email";
import type { DigestSession } from "@/lib/session-digest";

const COACH_ID = "trener-nora";

const sampleSession: DigestSession = {
  id: "eksempel-okt",
  teamId: "eksempel-lag",
  teamName: "Fjordvik J14",
  title: "Tirsdag — kontring og press",
  // A Tuesday in September, 17:30 in Oslo.
  startsAt: "2026-09-15T15:30:00.000Z",
  venue: "Fjordvik Arena · Bane 1",
  plannedDurationMinutes: 90,
  objective: "Skap fart i førstefasen og ta bedre valg under press.",
  notes: "Sisteliten: keeperne starter ti minutter før resten.",
  status: "published",
  monthFocus: "Vi jobber med å vinne ballen høyt på banen og komme raskt i gang.",
  blocks: [
    {
      title: "Oppvarming", kind: "sequence",
      notes: "Legg baller klare langs begge sidelinjene før spillerne kommer.",
      items: [
        { title: "Aktivering med ball", durationMinutes: 10, coachingNotes: "Start med to baller etter tre minutter.", assignedCoachId: COACH_ID },
        { title: "Reaksjon og retningsskifte", durationMinutes: 10, coachingNotes: "To runder, bytt den som roper etter hver runde.", assignedCoachId: null },
      ],
    },
    {
      title: "Stasjoner", kind: "stations",
      notes: "Fire lag, ett på hver stasjon. Blås i fløyta ved rotasjon.",
      items: [
        { title: "Overgang i fart", durationMinutes: 10, coachingNotes: "Fullfør begge retninger før gruppene roterer.", assignedCoachId: null },
        { title: "Press to mot to", durationMinutes: 10, coachingNotes: "Forsvarerne får poeng når de fremtvinger en pasning bakover.", assignedCoachId: COACH_ID },
        { title: "Avslutning fra kant", durationMinutes: 10, coachingNotes: "Passivt press de fem første minuttene.", assignedCoachId: null },
      ],
    },
    {
      title: "Spill", kind: "sequence", notes: "",
      items: [
        { title: "6 mot 6 med betingelser", durationMinutes: 30, coachingNotes: "Et mål teller dobbelt når det scores innen åtte sekunder etter ballerobring.", assignedCoachId: null },
      ],
    },
  ],
};

/** The rendered letter, subject line included, ready for the preview frame. */
export const sampleDigest = dailySessionDigestEmail({
  recipient: { profileId: COACH_ID, fullName: "Nora Lie" },
  sessions: [sampleSession],
  siteUrl: "https://grep.team",
})!;
