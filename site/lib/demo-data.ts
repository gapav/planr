import type { Exercise, PlannedSession, Profile, Team } from "./types";

export const demoUser: Profile = {
  id: "user-gard", email: "gard@fjordvik.no", fullName: "Gard Pavel", initials: "GP", color: "#f0642e", isGlobalAdmin: true, teamRole: "admin",
};

export const demoProfiles: Profile[] = [
  demoUser,
  { id: "user-nora", email: "nora@fjordvik.no", fullName: "Nora Vik", initials: "NV", color: "#477b70", teamRole: "coach" },
  { id: "user-sam", email: "sam@fjordvik.no", fullName: "Sam Østby", initials: "SØ", color: "#6d6bb5", teamRole: "coach" },
];

export const demoTeams: Team[] = [
  { id: "team-senior", name: "Fjordvik HK — Senior Women", shortName: "Senior Women", role: "admin", members: demoProfiles },
  { id: "team-u16", name: "Fjordvik HK — Girls U16", shortName: "Girls U16", role: "coach", members: [demoUser, demoProfiles[1]] },
];

const exerciseSeed = [
  ["exercise-1", "Three-lane transition", "Fast break pattern with three clear running lanes. Focus on early ball movement and wide spacing.", "photo-1571019613454-1cb2f99b2d8b", "Nora Vik", "user-nora"],
  ["exercise-2", "2 vs 2 channel defence", "Compact defensive footwork in a narrow channel. Attackers work to create a clean breakthrough.", "photo-1547347298-4074fc3086f0", "Sam Østby", "user-sam"],
  ["exercise-3", "Shoulder activation circle", "Progressive partner passing with movement, shoulder activation and changes of direction.", "photo-1538805060514-97d9cc17730c", "Gard Pavel", "user-gard"],
  ["exercise-4", "Wing finishing under pressure", "Repeated wing finishes after a long crossover, with passive then active defensive pressure.", "photo-1517466787929-bc90951d0974", "Nora Vik", "user-nora"],
  ["exercise-5", "Four-corner reaction game", "A competitive warm-up for reaction speed, scanning and quick acceleration in small groups.", "photo-1517836357463-d25dfeac3438", "Gard Pavel", "user-gard"],
  ["exercise-6", "6 vs 5 patient attack", "Controlled superiority play. The attack must create two defensive shifts before finishing.", "photo-1546519638-68e109498ffc", "Sam Østby", "user-sam"],
] as const;

export const demoExercises: Exercise[] = exerciseSeed.map(([id, name, description, photo, createdByName, createdBy], index) => {
  const image = `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=1000&q=82`;
  return {
    id, name, description, mediaUrl: image, mediaKind: "image", thumbnailUrl: image, createdBy, createdByName,
    archivedAt: null, createdAt: `2026-08-${30 - index * 2}T08:00:00.000Z`, updatedAt: `2026-08-${30 - index * 2}T08:00:00.000Z`,
  };
});

export const demoSessions: PlannedSession[] = [
  {
    id: "session-friday", teamId: "team-senior", title: "Friday — transition & pressure",
    startsAt: "2026-09-04T16:30:00.000Z", venue: "Fjordvik Arena · Court 1", plannedDurationMinutes: 90,
    objective: "Create speed in the first wave and make better choices under pressure.",
    notes: "Keep the final game intense but stop twice for short coaching points.", status: "draft",
    createdBy: "user-gard", updatedBy: "user-nora", createdAt: "2026-08-30T10:00:00.000Z", updatedAt: "2026-09-02T06:42:00.000Z",
    blocks: [
      {
        id: "block-warmup", sessionId: "session-friday", title: "Warm-up", position: 0, updatedBy: "user-gard",
        items: [
          { id: "item-activation", blockId: "block-warmup", kind: "exercise", exerciseId: "exercise-3", title: demoExercises[2].name, description: demoExercises[2].description, mediaUrl: demoExercises[2].mediaUrl, thumbnailUrl: demoExercises[2].thumbnailUrl, durationMinutes: 10, coachingNotes: "Start with two balls after three minutes.", position: 0, updatedBy: "user-gard" },
          { id: "item-reaction", blockId: "block-warmup", kind: "exercise", exerciseId: "exercise-5", title: demoExercises[4].name, description: demoExercises[4].description, mediaUrl: demoExercises[4].mediaUrl, thumbnailUrl: demoExercises[4].thumbnailUrl, durationMinutes: 10, coachingNotes: "Two rounds, change caller after each round.", position: 1, updatedBy: "user-nora" },
        ],
      },
      {
        id: "block-main", sessionId: "session-friday", title: "Main block", position: 1, updatedBy: "user-nora",
        items: [
          { id: "item-transition", blockId: "block-main", kind: "exercise", exerciseId: "exercise-1", title: demoExercises[0].name, description: demoExercises[0].description, mediaUrl: demoExercises[0].mediaUrl, thumbnailUrl: demoExercises[0].thumbnailUrl, durationMinutes: 25, coachingNotes: "Finish both directions before rotating groups.", position: 0, updatedBy: "user-nora" },
          { id: "item-defence", blockId: "block-main", kind: "exercise", exerciseId: "exercise-2", title: demoExercises[1].name, description: demoExercises[1].description, mediaUrl: demoExercises[1].mediaUrl, thumbnailUrl: demoExercises[1].thumbnailUrl, durationMinutes: 20, coachingNotes: "Defenders score for forcing a backwards pass.", position: 1, updatedBy: "user-sam" },
        ],
      },
      {
        id: "block-game", sessionId: "session-friday", title: "Game", position: 2, updatedBy: "user-sam",
        items: [
          { id: "item-game", blockId: "block-game", kind: "custom", exerciseId: null, title: "6 vs 6 conditioned game", description: "A goal counts double when scored inside eight seconds of winning possession.", mediaUrl: null, thumbnailUrl: null, durationMinutes: 25, coachingNotes: "Three five-minute periods with quick feedback.", position: 0, updatedBy: "user-sam" },
        ],
      },
    ],
  },
  { id: "session-monday", teamId: "team-senior", title: "Monday — defensive connections", startsAt: "2026-09-07T17:00:00.000Z", venue: "Fjordvik Arena · Court 2", plannedDurationMinutes: 90, objective: "Improve timing between the second and third defender.", notes: "", status: "published", blocks: [], createdBy: "user-nora", updatedBy: "user-nora", createdAt: "2026-08-27T08:00:00.000Z", updatedAt: "2026-08-31T12:00:00.000Z" },
  { id: "session-saturday", teamId: "team-senior", title: "Saturday — match preparation", startsAt: "2026-09-05T09:00:00.000Z", venue: "Fjordvik Arena · Main court", plannedDurationMinutes: 75, objective: "Polish the opening defensive plan before Sunday.", notes: "", status: "published", blocks: [], createdBy: "user-gard", updatedBy: "user-sam", createdAt: "2026-08-25T08:00:00.000Z", updatedAt: "2026-09-01T14:25:00.000Z" },
  { id: "session-past", teamId: "team-senior", title: "Fast feet & finishing", startsAt: "2026-08-30T09:00:00.000Z", venue: "Fjordvik Arena · Court 1", plannedDurationMinutes: 80, objective: "", notes: "", status: "published", blocks: [], createdBy: "user-gard", updatedBy: "user-gard", createdAt: "2026-08-20T08:00:00.000Z", updatedAt: "2026-08-30T11:00:00.000Z" },
  { id: "session-u16", teamId: "team-u16", title: "Passing on the move", startsAt: null, venue: "", plannedDurationMinutes: 75, objective: "", notes: "", status: "draft", blocks: [], createdBy: "user-gard", updatedBy: "user-gard", createdAt: "2026-09-01T08:00:00.000Z", updatedAt: "2026-09-01T08:00:00.000Z" },
];
