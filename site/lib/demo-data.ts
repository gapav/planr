import type { Exercise, PlannedSession, Profile, Team, TeamPlayer } from "./types";

export const demoUser: Profile = {
  id: "user-gard", email: "gard@fjordvik.no", fullName: "Gard Pavel", initials: "GP", color: "#f0642e", isGlobalAdmin: true, teamRole: "admin",
};

export const demoProfiles: Profile[] = [
  demoUser,
  { id: "user-nora", email: "nora@fjordvik.no", fullName: "Nora Vik", initials: "NV", color: "#477b70", teamRole: "coach" },
  { id: "user-sam", email: "sam@fjordvik.no", fullName: "Sam Østby", initials: "SØ", color: "#6d6bb5", teamRole: "coach" },
];

export const demoTeams: Team[] = [
  { id: "team-senior", name: "Fjordvik HK — Senior kvinner", shortName: "Senior kvinner", logoUrl: null, role: "admin", members: demoProfiles },
  { id: "team-u16", name: "Fjordvik HK — Jenter 16", shortName: "Jenter 16", logoUrl: null, role: "coach", members: [demoUser, demoProfiles[1]] },
];

const playerNames = ["Ada L.", "Mina B.", "Thea S.", "Selma V.", "Lea N.", "Ingrid D.", "Sara H.", "Oda S.", "Emma L.", "Nora E.", "Live A.", "Tuva M."];
export const demoPlayers: TeamPlayer[] = playerNames.map((fullName, index) => ({
  id: `player-${index + 1}`, teamId: "team-senior", fullName,
  jerseyNumber: String(index + 2), createdAt: "2026-08-20T08:00:00.000Z", updatedAt: "2026-08-20T08:00:00.000Z",
}));

const exerciseSeed = [
  ["exercise-1", "Tre rekker i kontring", "Kontringsmønster med tre tydelige løpskorridorer. Fokuser på tidlig ballflyt og god bredde.", "Angrep", "photo-1571019613454-1cb2f99b2d8b", "Nora Vik", "user-nora"],
  ["exercise-2", "2 mot 2 i forsvarskorridor", "Kompakt fotarbeid i forsvar i en smal korridor. Angriperne jobber for å skape et tydelig gjennombrudd.", "Forsvar", "photo-1547347298-4074fc3086f0", "Sam Østby", "user-sam"],
  ["exercise-3", "Sirkel for skulderaktivering", "Progressive pasninger parvis med bevegelse, skulderaktivering og retningsendringer.", "Fysisk", "photo-1538805060514-97d9cc17730c", "Gard Pavel", "user-gard"],
  ["exercise-4", "Kantavslutninger under press", "Gjentatte kantavslutninger etter et langt kryss, først med passivt og deretter aktivt forsvarspress.", "Angrep", "photo-1517466787929-bc90951d0974", "Nora Vik", "user-nora"],
  ["exercise-5", "Reaksjonslek i fire hjørner", "En konkurransepreget oppvarming for reaksjonsevne, overblikk og rask akselerasjon i små grupper.", "Leker", "photo-1517836357463-d25dfeac3438", "Gard Pavel", "user-gard"],
  ["exercise-6", "Tålmodig angrep 6 mot 5", "Kontrollert overtallsspill. Angrepet skal skape to forflytninger i forsvaret før avslutning.", "Angrep", "photo-1546519638-68e109498ffc", "Sam Østby", "user-sam"],
] as const;

export const demoExercises: Exercise[] = exerciseSeed.map(([id, name, description, category, photo, createdByName, createdBy], index) => {
  const image = `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=1000&q=82`;
  return {
    id, name, description, category, mediaUrl: image, mediaKind: "image", thumbnailUrl: image, createdBy, createdByName,
    archivedAt: null, createdAt: `2026-08-${30 - index * 2}T08:00:00.000Z`, updatedAt: `2026-08-${30 - index * 2}T08:00:00.000Z`,
  };
});

export const demoSessions: PlannedSession[] = [
  {
    id: "session-friday", teamId: "team-senior", title: "Fredag — kontring og press",
    startsAt: "2026-09-04T16:30:00.000Z", venue: "Fjordvik Arena · Bane 1", plannedDurationMinutes: 90,
    objective: "Skap fart i førstefasen og ta bedre valg under press.",
    notes: "Hold intensiteten oppe i det siste spillet, men stopp to ganger for korte trenermomenter.", status: "draft",
    createdBy: "user-gard", updatedBy: "user-nora", createdAt: "2026-08-30T10:00:00.000Z", updatedAt: "2026-09-02T06:42:00.000Z",
    blocks: [
      {
        id: "block-warmup", sessionId: "session-friday", title: "Oppvarming", notes: "Legg baller klare langs begge sidelinjene før spillerne kommer.", position: 0, updatedBy: "user-gard",
        items: [
          { id: "item-activation", blockId: "block-warmup", kind: "exercise", exerciseId: "exercise-3", title: demoExercises[2].name, description: demoExercises[2].description, mediaUrl: demoExercises[2].mediaUrl, thumbnailUrl: demoExercises[2].thumbnailUrl, durationMinutes: 10, coachingNotes: "Start med to baller etter tre minutter.", position: 0, updatedBy: "user-gard" },
          { id: "item-reaction", blockId: "block-warmup", kind: "exercise", exerciseId: "exercise-5", title: demoExercises[4].name, description: demoExercises[4].description, mediaUrl: demoExercises[4].mediaUrl, thumbnailUrl: demoExercises[4].thumbnailUrl, durationMinutes: 10, coachingNotes: "To runder, bytt den som roper etter hver runde.", position: 1, updatedBy: "user-nora" },
        ],
      },
      {
        id: "block-main", sessionId: "session-friday", title: "Hoveddel", notes: "Hold rotasjonene korte og tempoet høyt.", position: 1, updatedBy: "user-nora",
        items: [
          { id: "item-transition", blockId: "block-main", kind: "exercise", exerciseId: "exercise-1", title: demoExercises[0].name, description: demoExercises[0].description, mediaUrl: demoExercises[0].mediaUrl, thumbnailUrl: demoExercises[0].thumbnailUrl, durationMinutes: 25, coachingNotes: "Fullfør begge retninger før gruppene roterer.", position: 0, updatedBy: "user-nora" },
          { id: "item-defence", blockId: "block-main", kind: "exercise", exerciseId: "exercise-2", title: demoExercises[1].name, description: demoExercises[1].description, mediaUrl: demoExercises[1].mediaUrl, thumbnailUrl: demoExercises[1].thumbnailUrl, durationMinutes: 20, coachingNotes: "Forsvarerne får poeng når de fremtvinger en pasning bakover.", position: 1, updatedBy: "user-sam" },
        ],
      },
      {
        id: "block-game", sessionId: "session-friday", title: "Spill", notes: "Bruk hele banen og tell poeng sammenlagt gjennom alle tre periodene.", position: 2, updatedBy: "user-sam",
        items: [
          { id: "item-game", blockId: "block-game", kind: "custom", exerciseId: null, title: "6 mot 6 med betingelser", description: "Et mål teller dobbelt når det scores innen åtte sekunder etter ballerobring.", mediaUrl: null, thumbnailUrl: null, durationMinutes: 25, coachingNotes: "Tre perioder på fem minutter med raske tilbakemeldinger.", position: 0, updatedBy: "user-sam" },
        ],
      },
    ],
  },
  { id: "session-monday", teamId: "team-senior", title: "Mandag — samspill i forsvar", startsAt: "2026-09-07T17:00:00.000Z", venue: "Fjordvik Arena · Bane 2", plannedDurationMinutes: 90, objective: "Forbedre timingen mellom andre- og tredjeforsvareren.", notes: "", status: "published", blocks: [], createdBy: "user-nora", updatedBy: "user-nora", createdAt: "2026-08-27T08:00:00.000Z", updatedAt: "2026-08-31T12:00:00.000Z" },
  { id: "session-saturday", teamId: "team-senior", title: "Lørdag — kampforberedelser", startsAt: "2026-09-05T09:00:00.000Z", venue: "Fjordvik Arena · Hovedbane", plannedDurationMinutes: 75, objective: "Finpuss den innledende forsvarsplanen før søndag.", notes: "", status: "published", blocks: [], createdBy: "user-gard", updatedBy: "user-sam", createdAt: "2026-08-25T08:00:00.000Z", updatedAt: "2026-09-01T14:25:00.000Z" },
  { id: "session-past", teamId: "team-senior", title: "Raske føtter og avslutninger", startsAt: "2026-08-30T09:00:00.000Z", venue: "Fjordvik Arena · Bane 1", plannedDurationMinutes: 80, objective: "", notes: "", status: "published", blocks: [], createdBy: "user-gard", updatedBy: "user-gard", createdAt: "2026-08-20T08:00:00.000Z", updatedAt: "2026-08-30T11:00:00.000Z" },
  { id: "session-u16", teamId: "team-u16", title: "Pasninger i fart", startsAt: null, venue: "", plannedDurationMinutes: 75, objective: "", notes: "", status: "draft", blocks: [], createdBy: "user-gard", updatedBy: "user-gard", createdAt: "2026-09-01T08:00:00.000Z", updatedAt: "2026-09-01T08:00:00.000Z" },
];
