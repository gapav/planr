"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { invitationUrl, isIdentityChange, seedProfile } from "@/lib/auth";
import { demoExercises, demoPlayers, demoProfiles, demoSessions, demoTeams, demoUser } from "@/lib/demo-data";
import { resolveExerciseMedia, validateExerciseMediaUpload } from "@/lib/media";
import { minimizePlayerName } from "@/lib/roster";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Exercise, PlannedSession, PlayerGroup, Profile, SaveState, SessionAttendance, SessionBlock, SessionGrouping, SessionGroupingKind, SessionItem, Team, TeamInvitation, TeamPlayer, TeamPlayerInput, TeamRole } from "@/lib/types";
import { initials, makeUuid } from "@/lib/utils";

type SessionPatch = Partial<Pick<PlannedSession, "title" | "startsAt" | "venue" | "plannedDurationMinutes" | "objective" | "notes">>;
type BlockPatch = Partial<Pick<SessionBlock, "title" | "notes">>;
type ItemPatch = Partial<Pick<SessionItem, "title" | "description" | "durationMinutes" | "coachingNotes">>;

interface GrepContextValue {
  user: Profile | null;
  authLoading: boolean;
  isDemoMode: boolean;
  teams: Team[];
  currentTeam: Team | null;
  exercises: Exercise[];
  sessions: PlannedSession[];
  invitations: TeamInvitation[];
  players: TeamPlayer[];
  attendance: SessionAttendance[];
  groupings: SessionGrouping[];
  saveState: SaveState;
  notice: string | null;
  sidebarCollapsed: boolean;
  setSidebarCollapsed(collapsed: boolean): void;
  setCurrentTeamId(id: string): void;
  clearNotice(): void;
  signIn(email: string, password: string): Promise<void>;
  setPassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  addExercise(input: Pick<Exercise, "name" | "description" | "category" | "mediaUrl">): Promise<void>;
  updateExercise(id: string, input: Pick<Exercise, "name" | "description" | "category" | "mediaUrl">): Promise<void>;
  uploadExerciseMedia(file: File): Promise<string>;
  discardExerciseMedia(publicUrl: string): Promise<void>;
  archiveExercise(id: string): Promise<void>;
  createTeam(name: string): Promise<string>;
  refreshWorkspace(): Promise<void>;
  inviteMember(email: string, role: TeamRole): Promise<string>;
  revokeInvitation(id: string): Promise<void>;
  updateMemberRole(profileId: string, role: TeamRole): Promise<void>;
  removeMember(profileId: string): Promise<void>;
  importPlayers(input: TeamPlayerInput[]): Promise<{ added: number; updated: number }>;
  removePlayer(playerId: string): Promise<void>;
  createSession(): Promise<string>;
  updateSession(id: string, patch: SessionPatch): Promise<void>;
  deleteSession(id: string): Promise<void>;
  publishSession(id: string): Promise<void>;
  startWorkout(id: string, groupingKind: SessionGroupingKind): Promise<void>;
  startWorkoutWithoutSetup(id: string): Promise<void>;
  undoWorkoutStart(id: string): Promise<void>;
  finishWorkout(id: string): Promise<void>;
  addBlock(sessionId: string, title: string): Promise<string>;
  updateBlock(sessionId: string, blockId: string, patch: BlockPatch): Promise<void>;
  deleteBlock(sessionId: string, blockId: string): Promise<void>;
  reorderBlocks(sessionId: string, orderedIds: string[]): Promise<void>;
  addExerciseItem(sessionId: string, blockId: string, exercise: Exercise): Promise<void>;
  addCustomItem(sessionId: string, blockId: string): Promise<void>;
  updateItem(sessionId: string, blockId: string, itemId: string, patch: ItemPatch): Promise<void>;
  deleteItem(sessionId: string, blockId: string, itemId: string): Promise<void>;
  reorderItems(sessionId: string, blockId: string, orderedIds: string[]): Promise<void>;
  reloadSession(id: string): Promise<void>;
  setPlayerPresent(sessionId: string, playerId: string, isPresent: boolean): Promise<void>;
  saveGrouping(sessionId: string, kind: SessionGroupingKind, groups: PlayerGroup[]): Promise<void>;
}

const GrepContext = createContext<GrepContextValue | null>(null);

const serverMessageTranslations: Record<string, string> = {
  "Authentication required": "Du må være logget inn",
  "Team name is too short": "Lagnavnet er for kort",
  "Invitation not found": "Invitasjonen ble ikke funnet",
  "Invitation has already been used": "Invitasjonen er allerede brukt",
  "Invitation has expired": "Invitasjonen har utløpt",
  "Invitation belongs to another email address": "Invitasjonen tilhører en annen e-postadresse",
  "Session not found": "Økten ble ikke funnet",
  "Add a session title": "Legg til en økttittel",
  "Choose a date and time": "Velg dato og klokkeslett",
  "Add at least one block": "Legg til minst én bolk",
  "Block list is incomplete": "Listen over bolker er ufullstendig",
  "Block not found": "Bolken ble ikke funnet",
  "Item list is incomplete": "Listen over aktiviteter er ufullstendig",
  "Every team must keep at least one admin": "Hvert lag må ha minst én administrator",
  "Only a published session can be started": "Bare en publisert økt kan startes",
  "Generate groups before starting the workout": "Generer grupper før økten startes",
  "Attendance changed — generate groups again": "Oppmøtet er endret — generer grupper på nytt",
  "This workout is in progress and is locked": "Denne økten pågår og er låst",
  "Only a workout in progress can be finished": "Bare en pågående økt kan avsluttes",
  "This workout is finished and is locked": "Denne økten er avsluttet og låst",
  "Only a workout in progress can be reset": "Bare en pågående økt kan tilbakestilles",
};

const norwegianServerMessages = new Set(Object.values(serverMessageTranslations));

function norwegianServerMessage(message: string, fallback = "Handlingen kunne ikke fullføres.") {
  return serverMessageTranslations[message] ?? (norwegianServerMessages.has(message) || /[æøå]/i.test(message) ? message : fallback);
}

interface DbExercise {
  id: string; name: string; description: string; category: Exercise["category"]; media_url: string | null; media_kind: Exercise["mediaKind"];
  thumbnail_url: string | null; created_by: string; archived_at: string | null; created_at: string; updated_at: string;
  profiles?: { full_name?: string | null } | null;
}
interface DbItem {
  id: string; block_id: string; kind: SessionItem["kind"]; exercise_id: string | null; title: string; description: string;
  media_url: string | null; thumbnail_url: string | null; duration_minutes: number; coaching_notes: string; position: number; updated_by: string;
}
interface DbBlock { id: string; session_id: string; title: string; notes?: string; position: number; updated_by: string; session_items?: DbItem[]; }
interface DbSession {
  id: string; team_id: string; title: string; starts_at: string | null; venue: string; planned_duration_minutes: number;
  objective: string; notes: string; status: PlannedSession["status"]; created_by: string; updated_by: string;
  started_at?: string | null; completed_at?: string | null; grouping_kind?: SessionGroupingKind | null;
  created_at: string; updated_at: string; session_blocks?: DbBlock[];
}
interface DbPlayer { id: string; team_id: string; full_name: string; jersey_number: string | null; created_at: string; updated_at: string; }
interface DbAttendance { session_id: string; player_id: string; is_present: boolean; checked_in_at: string | null; }
interface DbGrouping { session_id: string; kind: SessionGroupingKind; groups: PlayerGroup[]; generated_at: string; }

function mapExercise(row: DbExercise): Exercise {
  return { id: row.id, name: row.name, description: row.description, category: row.category, mediaUrl: row.media_url, mediaKind: row.media_kind,
    thumbnailUrl: row.thumbnail_url, createdBy: row.created_by, createdByName: row.profiles?.full_name ?? "Trenerfellesskapet",
    archivedAt: row.archived_at, createdAt: row.created_at, updatedAt: row.updated_at };
}
function mapSession(row: DbSession): PlannedSession {
  return { id: row.id, teamId: row.team_id, title: row.title, startsAt: row.starts_at, venue: row.venue,
    plannedDurationMinutes: row.planned_duration_minutes, objective: row.objective, notes: row.notes, status: row.status,
    startedAt: row.started_at ?? null, completedAt: row.completed_at ?? null, groupingKind: row.grouping_kind ?? null,
    createdBy: row.created_by, updatedBy: row.updated_by, createdAt: row.created_at, updatedAt: row.updated_at,
    blocks: (row.session_blocks ?? []).sort((a, b) => a.position - b.position).map((block) => ({
      id: block.id, sessionId: block.session_id, title: block.title, notes: block.notes ?? "", position: block.position, updatedBy: block.updated_by,
      items: (block.session_items ?? []).sort((a, b) => a.position - b.position).map((item) => ({
        id: item.id, blockId: item.block_id, kind: item.kind, exerciseId: item.exercise_id, title: item.title,
        description: item.description, mediaUrl: item.media_url, thumbnailUrl: item.thumbnail_url,
        durationMinutes: item.duration_minutes, coachingNotes: item.coaching_notes, position: item.position, updatedBy: item.updated_by,
      })),
    })) };
}
function profileFromUser(user: User): Profile {
  const fullName = String(user.user_metadata.full_name ?? user.email?.split("@")[0] ?? "Trener");
  return { id: user.id, email: user.email ?? "", fullName, initials: initials(fullName), color: "#f0642e" };
}
function mapPlayer(row: DbPlayer): TeamPlayer {
  return { id: row.id, teamId: row.team_id, fullName: row.full_name, jerseyNumber: row.jersey_number, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Profile | null>(isSupabaseConfigured ? null : demoUser);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [teams, setTeams] = useState<Team[]>(() => isSupabaseConfigured ? [] : structuredClone(demoTeams));
  const [currentTeamId, setCurrentTeamId] = useState(demoTeams[0].id);
  const [exercises, setExercises] = useState<Exercise[]>(() => isSupabaseConfigured ? [] : structuredClone(demoExercises));
  const [sessions, setSessions] = useState<PlannedSession[]>(() => isSupabaseConfigured ? [] : structuredClone(demoSessions));
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [players, setPlayers] = useState<TeamPlayer[]>(() => isSupabaseConfigured ? [] : structuredClone(demoPlayers));
  const [attendance, setAttendance] = useState<SessionAttendance[]>([]);
  const [groupings, setGroupings] = useState<SessionGrouping[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [notice, setNotice] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const currentTeam = teams.find((team) => team.id === currentTeamId) ?? teams[0] ?? null;

  const loadPublicExercises = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("exercises").select("*, profiles:created_by(full_name)").is("archived_at", null).order("created_at", { ascending: false });
    if (!error && data) setExercises((data as unknown as DbExercise[]).map(mapExercise));
  }, [supabase]);

  const loadPrivateData = useCallback(async (authUser: User) => {
    if (!supabase) return;
    const [{ data: memberships }, { data: sessionRows }, { data: invitationRows }, { data: profileRow, error: profileError }, { data: playerRows }, { data: attendanceRows }, { data: groupingRows }] = await Promise.all([
      supabase.from("team_memberships").select("team_id, profile_id, role, teams(id, name), profiles(id, email, full_name, avatar_url)"),
      supabase.from("sessions").select("*, session_blocks(*, session_items(*))").order("updated_at", { ascending: false }),
      supabase.from("team_invitations").select("id, team_id, email, role, token, expires_at, accepted_at").is("accepted_at", null).gt("expires_at", new Date().toISOString()),
      supabase.from("profiles").select("id, email, full_name, is_global_admin, must_set_password").eq("id", authUser.id).single(),
      supabase.from("team_players").select("id, team_id, full_name, jersey_number, created_at, updated_at").order("full_name"),
      supabase.from("session_attendance").select("session_id, player_id, is_present, checked_in_at"),
      supabase.from("session_groupings").select("session_id, kind, groups, generated_at"),
    ]);
    if (profileRow) setUser({ id: profileRow.id, email: profileRow.email, fullName: profileRow.full_name, initials: initials(profileRow.full_name), color: "#f0642e", isGlobalAdmin: profileRow.is_global_admin, mustSetPassword: profileRow.must_set_password });
    // This row carries `must_set_password`, so losing it silently means a coach
    // signs in looking fine and skips the forced password change. Say so.
    else if (profileError) setNotice("Profilen din kunne ikke lastes.");
    if (memberships) {
      type MembershipRow = { team_id: string; profile_id: string; role: TeamRole; teams: { id: string; name: string } | null; profiles: { id: string; email: string; full_name: string; avatar_url: string | null } | null };
      const grouped = new Map<string, Team>();
      for (const membership of memberships as unknown as MembershipRow[]) {
        if (!membership.teams) continue;
        const existing = grouped.get(membership.team_id) ?? { id: membership.team_id, name: membership.teams.name, shortName: membership.teams.name.split("—").at(-1)?.trim() ?? membership.teams.name, role: "coach" as TeamRole, members: [] };
        if (membership.profile_id === authUser.id) existing.role = membership.role;
        if (membership.profiles && !existing.members.some((member) => member.id === membership.profile_id)) {
          existing.members.push({ id: membership.profiles.id, email: membership.profiles.email, fullName: membership.profiles.full_name, initials: initials(membership.profiles.full_name), color: membership.profile_id === authUser.id ? "#f0642e" : "#477b70", teamRole: membership.role });
        }
        grouped.set(membership.team_id, existing);
      }
      const mapped = [...grouped.values()];
      setTeams(mapped);
      if (mapped[0]) setCurrentTeamId(mapped[0].id);
    }
    if (sessionRows) setSessions((sessionRows as unknown as DbSession[]).map(mapSession));
    if (invitationRows) setInvitations((invitationRows as unknown as Array<{ id: string; team_id: string; email: string; role: TeamRole; token: string; expires_at: string; accepted_at: string | null }>).map((row) => ({ id: row.id, teamId: row.team_id, email: row.email, role: row.role, token: row.token, expiresAt: row.expires_at, acceptedAt: row.accepted_at })));
    if (playerRows) setPlayers((playerRows as unknown as DbPlayer[]).map(mapPlayer));
    if (attendanceRows) setAttendance((attendanceRows as unknown as DbAttendance[]).map((row) => ({ sessionId: row.session_id, playerId: row.player_id, isPresent: row.is_present, checkedInAt: row.checked_in_at })));
    if (groupingRows) setGroupings((groupingRows as unknown as DbGrouping[]).map((row) => ({ sessionId: row.session_id, kind: row.kind, groups: row.groups, generatedAt: row.generated_at })));
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    const loadTimer = window.setTimeout(() => void loadPublicExercises(), 0);
    void supabase.auth.getUser().then(({ data }) => {
      setUser((current) => seedProfile(current, data.user ? profileFromUser(data.user) : null));
      if (data.user) void loadPrivateData(data.user);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isIdentityChange(event)) return;
      setUser((current) => seedProfile(current, session?.user ? profileFromUser(session.user) : null));
      if (session?.user) void loadPrivateData(session.user);
      setAuthLoading(false);
    });
    return () => { window.clearTimeout(loadTimer); listener.subscription.unsubscribe(); };
  }, [loadPrivateData, loadPublicExercises, supabase]);

  useEffect(() => {
    const online = () => setSaveState("saved");
    const offline = () => setSaveState("offline");
    window.addEventListener("online", online); window.addEventListener("offline", offline);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, []);

  const persist = useCallback(async (operation: (() => PromiseLike<{ error: { message: string } | null }>) | null) => {
    if (!operation) { setSaveState("saved"); return; }
    setSaveState("saving");
    const { error } = await operation();
    if (error) { const message = norwegianServerMessage(error.message); setSaveState("error"); setNotice(message); throw new Error(message); }
    setSaveState("saved");
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) { setUser(demoUser); setNotice("Demomodus er aktiv — valgfritt passord åpner demoarbeidsområdet."); return; }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(norwegianServerMessage(error.message, "Feil e-postadresse eller passord."));
  }, [supabase]);

  // Accounts are created by an admin with a temporary password, so the first
  // sign-in is routed here before anything else in the app is reachable.
  const setPassword = useCallback(async (password: string) => {
    if (!supabase) { setUser((current) => current && { ...current, mustSetPassword: false }); setNotice("Demomodus — passordet ble ikke endret."); return; }
    // `updateUser` reads the session straight out of the cookie store and only
    // says "Auth session missing!" when it has gone, which strands a coach on a
    // form that can never succeed. Drop the stale local user instead so the page
    // sends them back to sign in with the password they were given.
    const { data: current } = await supabase.auth.getSession();
    if (!current.session) { setUser(null); throw new Error("Innloggingen din har utløpt. Logg inn på nytt med passordet du fikk av lagadministratoren, og velg deretter ditt eget."); }
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(norwegianServerMessage(error.message, "Passordet kunne ikke endres."));
    setUser((current) => current && { ...current, mustSetPassword: false });
    await persist(() => supabase.from("profiles").update({ must_set_password: false }).eq("id", data.user.id));
  }, [persist, supabase]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setUser(supabase ? null : demoUser);
  }, [supabase]);

  const addExercise = useCallback(async (input: Pick<Exercise, "name" | "description" | "category" | "mediaUrl">) => {
    if (!user) throw new Error("Logg inn for å legge til en øvelse");
    const media = input.mediaUrl ? await resolveExerciseMedia(input.mediaUrl) : { kind: null, thumbnailUrl: null }; const now = new Date().toISOString(); const id = makeUuid();
    const exercise: Exercise = { id, ...input, mediaKind: media.kind, thumbnailUrl: media.thumbnailUrl, createdBy: user.id, createdByName: user.fullName, archivedAt: null, createdAt: now, updatedAt: now };
    setExercises((current) => [exercise, ...current]);
    try {
      await persist(supabase ? () => supabase.from("exercises").insert({ id, name: input.name, description: input.description, category: input.category, media_url: input.mediaUrl, media_kind: media.kind, thumbnail_url: media.thumbnailUrl, created_by: user.id }) : null);
    } catch (error) {
      setExercises((current) => current.filter((entry) => entry.id !== id));
      throw error;
    }
  }, [persist, supabase, user]);

  const updateExercise = useCallback(async (id: string, input: Pick<Exercise, "name" | "description" | "category" | "mediaUrl">) => {
    const previous = exercises.find((exercise) => exercise.id === id);
    const media = input.mediaUrl ? await resolveExerciseMedia(input.mediaUrl) : { kind: null, thumbnailUrl: null }; const updatedAt = new Date().toISOString();
    setExercises((current) => current.map((exercise) => exercise.id === id ? { ...exercise, ...input, mediaKind: media.kind, thumbnailUrl: media.thumbnailUrl, updatedAt } : exercise));
    try {
      await persist(supabase ? () => supabase.from("exercises").update({ name: input.name, description: input.description, category: input.category, media_url: input.mediaUrl, media_kind: media.kind, thumbnail_url: media.thumbnailUrl }).eq("id", id) : null);
    } catch (error) {
      if (previous) setExercises((current) => current.map((exercise) => exercise.id === id ? previous : exercise));
      throw error;
    }
  }, [exercises, persist, supabase]);

  const uploadExerciseMedia = useCallback(async (file: File) => {
    const media = validateExerciseMediaUpload(file);
    if (!user) throw new Error("Logg inn for å laste opp et bilde eller en video");
    if (!supabase) throw new Error("Medieopplasting krever et tilkoblet Supabase-prosjekt");
    const path = `${user.id}/${makeUuid()}.${media.extension}`;
    const { error } = await supabase.storage.from("exercise-videos").upload(path, file, { cacheControl: "31536000", contentType: media.contentType, upsert: false });
    if (error) throw new Error(norwegianServerMessage(error.message, "Mediet kunne ikke lastes opp."));
    return supabase.storage.from("exercise-videos").getPublicUrl(path).data.publicUrl;
  }, [supabase, user]);

  const discardExerciseMedia = useCallback(async (publicUrl: string) => {
    if (!supabase || !user) return;
    const marker = "/storage/v1/object/public/exercise-videos/";
    const url = new URL(publicUrl);
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex < 0) return;
    const path = decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
    if (!path.startsWith(`${user.id}/`)) return;
    const { error } = await supabase.storage.from("exercise-videos").remove([path]);
    if (error) throw new Error(norwegianServerMessage(error.message, "Mediet kunne ikke fjernes."));
  }, [supabase, user]);

  const archiveExercise = useCallback(async (id: string) => {
    const archivedAt = new Date().toISOString(); setExercises((current) => current.filter((exercise) => exercise.id !== id));
    await persist(supabase ? () => supabase.from("exercises").update({ archived_at: archivedAt }).eq("id", id) : null);
  }, [persist, supabase]);

  // Refetches teams, sessions, players and the rest for the signed-in coach.
  // Anything that changes membership outside the normal mutation path — accepting
  // an invitation, creating a team — must call this, or the workspace stays empty
  // until the next sign-in.
  const refreshWorkspace = useCallback(async () => {
    if (!supabase || !user) return;
    await loadPrivateData({ id: user.id, email: user.email, user_metadata: { full_name: user.fullName } } as unknown as User);
  }, [loadPrivateData, supabase, user]);

  const createTeam = useCallback(async (name: string) => {
    if (!user) throw new Error("Logg inn for å opprette et lag");
    if (supabase) {
      const { data, error } = await supabase.rpc("create_team", { team_name: name });
      if (error) throw new Error(norwegianServerMessage(error.message, "Laget kunne ikke opprettes.")); await refreshWorkspace();
      return String(data);
    }
    const id = makeUuid(); setTeams((current) => [...current, { id, name, shortName: name, role: "admin", members: [user] }]); setCurrentTeamId(id); return id;
  }, [refreshWorkspace, supabase, user]);

  // Nothing is emailed: the admin copies the returned link and sends it from
  // their own mailbox. accept_team_invitation still binds it to this address.
  const inviteMember = useCallback(async (email: string, role: TeamRole) => {
    if (!currentTeam || !user) throw new Error("Velg et lag før du inviterer en trener");
    const id = makeUuid(); const token = makeUuid(); const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    setInvitations((current) => [...current, { id, teamId: currentTeam.id, email: email.toLowerCase(), role, token, expiresAt, acceptedAt: null }]);
    try {
      await persist(supabase ? () => supabase.from("team_invitations").insert({ id, token, team_id: currentTeam.id, email: email.toLowerCase(), role, invited_by: user.id, expires_at: expiresAt }) : null);
    } catch (error) {
      setInvitations((current) => current.filter((invitation) => invitation.id !== id));
      throw error;
    }
    return invitationUrl(window.location.origin, token);
  }, [currentTeam, persist, supabase, user]);

  const revokeInvitation = useCallback(async (id: string) => {
    setInvitations((current) => current.filter((invitation) => invitation.id !== id));
    await persist(supabase ? () => supabase.from("team_invitations").delete().eq("id", id) : null);
  }, [persist, supabase]);

  const updateMemberRole = useCallback(async (profileId: string, role: TeamRole) => {
    if (!currentTeam) return;
    setTeams((current) => current.map((team) => team.id === currentTeam.id ? { ...team, members: team.members.map((member) => member.id === profileId ? { ...member, teamRole: role } : member) } : team));
    await persist(supabase ? () => supabase.from("team_memberships").update({ role }).eq("team_id", currentTeam.id).eq("profile_id", profileId) : null);
  }, [currentTeam, persist, supabase]);

  const removeMember = useCallback(async (profileId: string) => {
    if (!currentTeam) return;
    setTeams((current) => current.map((team) => team.id === currentTeam.id ? { ...team, members: team.members.filter((member) => member.id !== profileId) } : team));
    await persist(supabase ? () => supabase.from("team_memberships").delete().eq("team_id", currentTeam.id).eq("profile_id", profileId) : null);
  }, [currentTeam, persist, supabase]);

  const importPlayers = useCallback(async (input: TeamPlayerInput[]) => {
    if (!currentTeam) throw new Error("Velg et lag først");
    const teamPlayers = players.filter((player) => player.teamId === currentTeam.id);
    const now = new Date().toISOString();
    let added = 0; let updated = 0;
    const imported = input.map((entry) => {
      const fullName = minimizePlayerName(entry.fullName);
      const normalizedName = fullName.toLocaleLowerCase("nb-NO");
      const sameName = teamPlayers.filter((player) => player.fullName.toLocaleLowerCase("nb-NO") === normalizedName);
      const existing = sameName.find((player) => player.jerseyNumber === entry.jerseyNumber) ?? (sameName.length === 1 ? sameName[0] : undefined);
      if (existing) {
        updated += 1;
        return { ...existing, jerseyNumber: entry.jerseyNumber, fullName, updatedAt: now };
      }
      added += 1;
      return { id: makeUuid(), teamId: currentTeam.id, jerseyNumber: entry.jerseyNumber, fullName, createdAt: now, updatedAt: now };
    });
    const importedIds = new Set(imported.map((player) => player.id));
    setPlayers((current) => [...current.filter((player) => player.teamId !== currentTeam.id || !importedIds.has(player.id)), ...imported].sort((a, b) => a.fullName.localeCompare(b.fullName, "nb")));
    const rows = imported.map((player) => ({ id: player.id, team_id: player.teamId, full_name: player.fullName, jersey_number: player.jerseyNumber }));
    await persist(supabase ? () => supabase.from("team_players").upsert(rows, { onConflict: "id" }) : null);
    setNotice(`${added} ${added === 1 ? "spiller" : "spillere"} lagt til${updated ? `, ${updated} oppdatert` : ""}.`);
    return { added, updated };
  }, [currentTeam, persist, players, supabase]);

  const removePlayer = useCallback(async (playerId: string) => {
    setPlayers((current) => current.filter((player) => player.id !== playerId));
    setAttendance((current) => current.filter((entry) => entry.playerId !== playerId));
    await persist(supabase ? () => supabase.from("team_players").delete().eq("id", playerId) : null);
  }, [persist, supabase]);

  const createSession = useCallback(async () => {
    if (!currentTeam || !user) throw new Error("Velg et lag først"); const id = makeUuid(); const now = new Date().toISOString();
    const session: PlannedSession = { id, teamId: currentTeam.id, title: "Økt uten tittel", startsAt: null, venue: "", plannedDurationMinutes: 90, objective: "", notes: "", status: "draft", blocks: [], createdBy: user.id, updatedBy: user.id, createdAt: now, updatedAt: now };
    setSessions((current) => [session, ...current]);
    await persist(supabase ? () => supabase.from("sessions").insert({ id, team_id: currentTeam.id, title: session.title, planned_duration_minutes: 90, created_by: user.id, updated_by: user.id }) : null);
    return id;
  }, [currentTeam, persist, supabase, user]);

  const updateSession = useCallback(async (id: string, patch: SessionPatch) => {
    const now = new Date().toISOString(); setSessions((current) => current.map((session) => session.id === id ? { ...session, ...patch, updatedBy: user?.id ?? session.updatedBy, updatedAt: now } : session));
    const row = { ...(patch.title !== undefined && { title: patch.title }), ...(patch.startsAt !== undefined && { starts_at: patch.startsAt }), ...(patch.venue !== undefined && { venue: patch.venue }), ...(patch.plannedDurationMinutes !== undefined && { planned_duration_minutes: patch.plannedDurationMinutes }), ...(patch.objective !== undefined && { objective: patch.objective }), ...(patch.notes !== undefined && { notes: patch.notes }), updated_by: user?.id };
    await persist(supabase ? () => supabase.from("sessions").update(row).eq("id", id) : null);
  }, [persist, supabase, user]);

  // The DB refuses to delete a session that is in progress, so the optimistic
  // removal is rolled back when the delete does not land.
  const deleteSession = useCallback(async (id: string) => {
    let removed: PlannedSession | undefined;
    setSessions((current) => { removed = current.find((session) => session.id === id); return current.filter((session) => session.id !== id); });
    try {
      await persist(supabase ? () => supabase.from("sessions").delete().eq("id", id) : null);
    } catch (error) {
      if (removed) setSessions((current) => current.some((session) => session.id === id) ? current : [...current, removed as PlannedSession]);
      throw error;
    }
  }, [persist, supabase]);
  const publishSession = useCallback(async (id: string) => { setSessions((current) => current.map((session) => session.id === id ? { ...session, status: "published", updatedAt: new Date().toISOString() } : session)); await persist(supabase ? () => supabase.rpc("publish_session", { target_session_id: id }) : null); }, [persist, supabase]);

  const startWorkout = useCallback(async (id: string, groupingKind: SessionGroupingKind) => {
    if (!user) return;
    const startedAt = new Date().toISOString();
    await persist(supabase ? async () => {
      const result = await supabase.rpc("start_session", { target_session_id: id, selected_grouping_kind: groupingKind });
      if (result.error?.code === "PGRST202") {
        return { ...result, error: { message: "Databaseoppdateringen for øktflyten mangler. Kjør Supabase-migrering 006 og 007, og prøv på nytt." } };
      }
      return result;
    } : null);
    setSessions((current) => current.map((session) => session.id === id ? { ...session, status: "in_progress", startedAt, groupingKind, updatedBy: user.id, updatedAt: startedAt } : session));
  }, [persist, supabase, user]);

  const startWorkoutWithoutSetup = useCallback(async (id: string) => {
    if (!user) return;
    const startedAt = new Date().toISOString();
    await persist(supabase ? async () => {
      const result = await supabase.rpc("start_session_without_setup", { target_session_id: id });
      if (result.error?.code === "PGRST202") {
        return { ...result, error: { message: "Databaseoppdateringen for å hoppe over oppsett mangler. Kjør Supabase-migrering 016, og prøv på nytt." } };
      }
      return result;
    } : null);
    setSessions((current) => current.map((session) => session.id === id ? { ...session, status: "in_progress", startedAt, groupingKind: null, updatedBy: user.id, updatedAt: startedAt } : session));
  }, [persist, supabase, user]);

  const undoWorkoutStart = useCallback(async (id: string) => {
    if (!user) return;
    const updatedAt = new Date().toISOString();
    await persist(supabase ? async () => {
      const result = await supabase.rpc("undo_session_start", { target_session_id: id });
      if (result.error?.code === "PGRST202") {
        return { ...result, error: { message: "Databaseoppdateringen for å angre øktstart mangler. Kjør Supabase-migrering 014, og prøv på nytt." } };
      }
      return result;
    } : null);
    setSessions((current) => current.map((session) => session.id === id ? { ...session, status: "published", startedAt: null, groupingKind: null, updatedBy: user.id, updatedAt } : session));
  }, [persist, supabase, user]);

  const finishWorkout = useCallback(async (id: string) => {
    if (!user) return;
    const completedAt = new Date().toISOString();
    await persist(supabase ? async () => {
      const result = await supabase.rpc("finish_session", { target_session_id: id });
      if (result.error?.code === "PGRST202") {
        return { ...result, error: { message: "Databaseoppdateringen for å avslutte økter mangler. Kjør Supabase-migrering 009 og 010, og prøv på nytt." } };
      }
      return result;
    } : null);
    setSessions((current) => current.map((session) => session.id === id ? { ...session, status: "completed", completedAt, updatedBy: user.id, updatedAt: completedAt } : session));
  }, [persist, supabase, user]);

  const addBlock = useCallback(async (sessionId: string, title: string) => {
    const id = makeUuid(); const session = sessions.find((entry) => entry.id === sessionId); const position = session?.blocks.length ?? 0;
    const block: SessionBlock = { id, sessionId, title, notes: "", position, items: [], updatedBy: user?.id ?? demoUser.id };
    setSessions((current) => current.map((entry) => entry.id === sessionId ? { ...entry, blocks: [...entry.blocks, block] } : entry));
    await persist(supabase ? () => supabase.from("session_blocks").insert({ id, session_id: sessionId, title, position, updated_by: user?.id }) : null); return id;
  }, [persist, sessions, supabase, user]);

  const updateBlock = useCallback(async (sessionId: string, blockId: string, patch: BlockPatch) => {
    setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, blocks: session.blocks.map((block) => block.id === blockId ? { ...block, ...patch, updatedBy: user?.id ?? block.updatedBy } : block) } : session));
    const row = { ...(patch.title !== undefined && { title: patch.title }), ...(patch.notes !== undefined && { notes: patch.notes }), updated_by: user?.id };
    await persist(supabase ? () => supabase.from("session_blocks").update(row).eq("id", blockId) : null);
  }, [persist, supabase, user]);
  const deleteBlock = useCallback(async (sessionId: string, blockId: string) => { setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, blocks: session.blocks.filter((block) => block.id !== blockId).map((block, position) => ({ ...block, position })) } : session)); await persist(supabase ? () => supabase.from("session_blocks").delete().eq("id", blockId) : null); }, [persist, supabase]);
  const reorderBlocks = useCallback(async (sessionId: string, orderedIds: string[]) => { setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, blocks: orderedIds.flatMap((id, position) => { const block = session.blocks.find((entry) => entry.id === id); return block ? [{ ...block, position }] : []; }) } : session)); await persist(supabase ? () => supabase.rpc("reorder_session_blocks", { target_session_id: sessionId, ordered_block_ids: orderedIds }) : null); }, [persist, supabase]);

  const addExerciseItem = useCallback(async (sessionId: string, blockId: string, exercise: Exercise) => {
    const id = makeUuid(); const block = sessions.find((session) => session.id === sessionId)?.blocks.find((entry) => entry.id === blockId); const position = block?.items.length ?? 0;
    const item: SessionItem = { id, blockId, kind: "exercise", exerciseId: exercise.id, title: exercise.name, description: exercise.description, mediaUrl: exercise.mediaUrl, thumbnailUrl: exercise.thumbnailUrl, durationMinutes: 10, coachingNotes: "", position, updatedBy: user?.id ?? demoUser.id };
    setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, blocks: session.blocks.map((entry) => entry.id === blockId ? { ...entry, items: [...entry.items, item] } : entry) } : session));
    await persist(supabase ? () => supabase.from("session_items").insert({ id, block_id: blockId, kind: item.kind, exercise_id: exercise.id, title: item.title, description: item.description, media_url: item.mediaUrl, thumbnail_url: item.thumbnailUrl, duration_minutes: 10, position, updated_by: user?.id }) : null);
  }, [persist, sessions, supabase, user]);

  const addCustomItem = useCallback(async (sessionId: string, blockId: string) => {
    const id = makeUuid(); const block = sessions.find((session) => session.id === sessionId)?.blocks.find((entry) => entry.id === blockId); const position = block?.items.length ?? 0;
    const item: SessionItem = { id, blockId, kind: "custom", exerciseId: null, title: "Ny aktivitet", description: "", mediaUrl: null, thumbnailUrl: null, durationMinutes: 10, coachingNotes: "", position, updatedBy: user?.id ?? demoUser.id };
    setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, blocks: session.blocks.map((entry) => entry.id === blockId ? { ...entry, items: [...entry.items, item] } : entry) } : session));
    await persist(supabase ? () => supabase.from("session_items").insert({ id, block_id: blockId, kind: "custom", title: item.title, duration_minutes: 10, position, updated_by: user?.id }) : null);
  }, [persist, sessions, supabase, user]);

  const updateItem = useCallback(async (sessionId: string, blockId: string, itemId: string, patch: ItemPatch) => { setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, blocks: session.blocks.map((block) => block.id === blockId ? { ...block, items: block.items.map((item) => item.id === itemId ? { ...item, ...patch, updatedBy: user?.id ?? item.updatedBy } : item) } : block) } : session)); const row = { ...(patch.title !== undefined && { title: patch.title }), ...(patch.description !== undefined && { description: patch.description }), ...(patch.durationMinutes !== undefined && { duration_minutes: patch.durationMinutes }), ...(patch.coachingNotes !== undefined && { coaching_notes: patch.coachingNotes }), updated_by: user?.id }; await persist(supabase ? () => supabase.from("session_items").update(row).eq("id", itemId) : null); }, [persist, supabase, user]);
  const deleteItem = useCallback(async (sessionId: string, blockId: string, itemId: string) => { setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, blocks: session.blocks.map((block) => block.id === blockId ? { ...block, items: block.items.filter((item) => item.id !== itemId).map((item, position) => ({ ...item, position })) } : block) } : session)); await persist(supabase ? () => supabase.from("session_items").delete().eq("id", itemId) : null); }, [persist, supabase]);
  const reorderItems = useCallback(async (sessionId: string, blockId: string, orderedIds: string[]) => { setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, blocks: session.blocks.map((block) => block.id === blockId ? { ...block, items: orderedIds.flatMap((id, position) => { const item = block.items.find((entry) => entry.id === id); return item ? [{ ...item, position }] : []; }) } : block) } : session)); await persist(supabase ? () => supabase.rpc("reorder_block_items", { target_block_id: blockId, ordered_item_ids: orderedIds }) : null); }, [persist, supabase]);

  const reloadSession = useCallback(async (id: string) => { if (!supabase) return; const { data } = await supabase.from("sessions").select("*, session_blocks(*, session_items(*))").eq("id", id).single(); if (data) setSessions((current) => current.map((session) => session.id === id ? mapSession(data as unknown as DbSession) : session)); }, [supabase]);

  const setPlayerPresent = useCallback(async (sessionId: string, playerId: string, isPresent: boolean) => {
    if (!user) return;
    const checkedInAt = isPresent ? new Date().toISOString() : null;
    const entry: SessionAttendance = { sessionId, playerId, isPresent, checkedInAt };
    setAttendance((current) => [...current.filter((item) => item.sessionId !== sessionId || item.playerId !== playerId), entry]);
    await persist(supabase ? () => supabase.from("session_attendance").upsert({ session_id: sessionId, player_id: playerId, is_present: isPresent, checked_in_at: checkedInAt, updated_by: user.id }, { onConflict: "session_id,player_id" }) : null);
  }, [persist, supabase, user]);

  const saveGrouping = useCallback(async (sessionId: string, kind: SessionGroupingKind, groups: PlayerGroup[]) => {
    if (!user) return;
    const generatedAt = new Date().toISOString();
    const grouping: SessionGrouping = { sessionId, kind, groups, generatedAt };
    setGroupings((current) => [...current.filter((entry) => entry.sessionId !== sessionId || entry.kind !== kind), grouping]);
    await persist(supabase ? () => supabase.from("session_groupings").upsert({ session_id: sessionId, kind, groups, generated_by: user.id, generated_at: generatedAt }, { onConflict: "session_id,kind" }) : null);
  }, [persist, supabase, user]);

  const value = useMemo<GrepContextValue>(() => ({ user, authLoading, isDemoMode: !supabase, teams, currentTeam, exercises, sessions, invitations, players, attendance, groupings, saveState, notice, sidebarCollapsed, setSidebarCollapsed, setCurrentTeamId, clearNotice: () => setNotice(null), signIn, setPassword, signOut, addExercise, updateExercise, uploadExerciseMedia, discardExerciseMedia, archiveExercise, createTeam, refreshWorkspace, inviteMember, revokeInvitation, updateMemberRole, removeMember, importPlayers, removePlayer, createSession, updateSession, deleteSession, publishSession, startWorkout, startWorkoutWithoutSetup, undoWorkoutStart, finishWorkout, addBlock, updateBlock, deleteBlock, reorderBlocks, addExerciseItem, addCustomItem, updateItem, deleteItem, reorderItems, reloadSession, setPlayerPresent, saveGrouping }), [user, authLoading, supabase, teams, currentTeam, exercises, sessions, invitations, players, attendance, groupings, saveState, notice, sidebarCollapsed, signIn, setPassword, signOut, addExercise, updateExercise, uploadExerciseMedia, discardExerciseMedia, archiveExercise, createTeam, refreshWorkspace, inviteMember, revokeInvitation, updateMemberRole, removeMember, importPlayers, removePlayer, createSession, updateSession, deleteSession, publishSession, startWorkout, startWorkoutWithoutSetup, undoWorkoutStart, finishWorkout, addBlock, updateBlock, deleteBlock, reorderBlocks, addExerciseItem, addCustomItem, updateItem, deleteItem, reorderItems, reloadSession, setPlayerPresent, saveGrouping]);

  return <GrepContext.Provider value={value}>{children}</GrepContext.Provider>;
}

export function useGrep() {
  const context = useContext(GrepContext);
  if (!context) throw new Error("useGrep must be used inside AppProvider");
  return context;
}

export { demoProfiles };
