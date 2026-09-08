"use client";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { mapAdminTeam, shortTeamName, sortAdminTeams, type AdminTeamRow } from "@/lib/admin";
import { claimableInvitations, invitationUrl, isIdentityChange, keepSelectedTeamId, seedProfile } from "@/lib/auth";
import { demoExercises, demoFixtures, demoMonthFocus, demoPlayers, demoWarmupRoutines, demoProfiles, demoSessions, demoTeams, demoUser } from "@/lib/demo-data";
import { canEditExercise, indexExercises, resolveAll, resolveSessionDisplay, resolveWarmupRoutineDisplay } from "@/lib/exercises";
import { resolveExerciseMedia, validateExerciseMediaUpload, validateTeamLogoUpload } from "@/lib/media";
import { isInvitationAlreadyUsed, norwegianServerMessage } from "@/lib/server-messages";
import { minimizePlayerName } from "@/lib/roster";
import { nextPosition } from "@/lib/session";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { MONTH_FOCUS_MAX_LENGTH } from "@/lib/types";
import type { AdminTeam, Exercise, ExerciseInput, MonthFocus, PlannedSession, PlayerGroup, Profile, SaveState, SessionAttendance, SessionBlock, SessionGrouping, SessionGroupingKind, SessionItem, Team, TeamFixture, TeamFixtureInput, TeamInvitation, TeamPlayer, TeamPlayerInput, TeamRole, WarmupItem, WarmupItemPatch, WarmupRoutine, WarmupRoutinePatch } from "@/lib/types";
import { initials, makeUuid } from "@/lib/utils";

type SessionPatch = Partial<Pick<PlannedSession, "title" | "startsAt" | "venue" | "plannedDurationMinutes" | "objective" | "notes">>;
type BlockPatch = Partial<Pick<SessionBlock, "title" | "notes">>;
type ItemPatch = Partial<Pick<SessionItem, "title" | "description" | "durationMinutes" | "coachingNotes">>;

const TEAM_LOGO_BUCKET = "team-logos";

// The switcher in the sidebar is the only place a coach picks a team, and the
// pick lived only in React state — so a reload restarted from the placeholder
// the provider seeds with and `keepSelectedTeamId` handed back the first team.
// Remember it per browser instead. Storage throws in some privacy modes and is
// absent on the server, so every access is guarded.
const SELECTED_TEAM_KEY = "plannr.selected-team";
const NOT_EXERCISE_OWNER = "Du kan bare endre øvelser du har lagt til selv";

function readSelectedTeamId(): string | null {
  try { return window.localStorage.getItem(SELECTED_TEAM_KEY); } catch { return null; }
}

function rememberSelectedTeamId(id: string) {
  try { window.localStorage.setItem(SELECTED_TEAM_KEY, id); } catch { /* the selection just will not survive this reload */ }
}

// Only remove an object this team actually owns: `logo_url` is a plain column,
// so a crafted URL must not turn into a delete against someone else's folder.
async function removeTeamLogo(supabase: SupabaseClient, teamId: string, publicUrl: string) {
  const marker = `/storage/v1/object/public/${TEAM_LOGO_BUCKET}/`;
  let pathname: string;
  try { pathname = new URL(publicUrl).pathname; } catch { return; }
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex < 0) return;
  const path = decodeURIComponent(pathname.slice(markerIndex + marker.length));
  if (!path.startsWith(`${teamId}/`)) return;
  await supabase.storage.from(TEAM_LOGO_BUCKET).remove([path]);
}

// Demo mode has no `admin_list_teams` to call, so the console is seeded from the
// same fixtures the coach screens use. `demoUser` carries `isGlobalAdmin`, which
// is what puts /admin in the sidebar during a preview.
function demoAdminTeams(): AdminTeam[] {
  return sortAdminTeams(structuredClone(demoTeams).map((team) => ({
    id: team.id, name: team.name, shortName: team.shortName, logoUrl: team.logoUrl,
    members: team.members.map((member) => ({ ...member, teamRole: member.teamRole ?? "coach" })),
    invitations: [] as TeamInvitation[],
  })));
}

interface GrepContextValue {
  user: Profile | null;
  authLoading: boolean;
  // `authLoading` only covers knowing *who* is signed in; `loadPrivateData` is
  // fired without being awaited, so the workspace arrays are still empty for a
  // moment after it clears. Anything that reads emptiness as an answer rather
  // than as "not here yet" — /today picking tonight's session — has to wait for
  // this instead. It latches once and stays true across later refetches.
  workspaceLoaded: boolean;
  isDemoMode: boolean;
  teams: Team[];
  currentTeam: Team | null;
  exercises: Exercise[];
  /** The signed-in coach's own hearted exercises. Empty for a signed-out visitor. */
  favoriteExerciseIds: string[];
  sessions: PlannedSession[];
  invitations: TeamInvitation[];
  players: TeamPlayer[];
  fixtures: TeamFixture[];
  /** Every month focus for the coach's teams, keyed by `YYYY-MM`. Months without one are simply absent. */
  monthFocus: MonthFocus[];
  warmupRoutines: WarmupRoutine[];
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
  addExercise(input: ExerciseInput): Promise<void>;
  updateExercise(id: string, input: ExerciseInput): Promise<void>;
  uploadExerciseMedia(file: File): Promise<string>;
  discardExerciseMedia(publicUrl: string): Promise<void>;
  archiveExercise(id: string): Promise<void>;
  toggleFavoriteExercise(exerciseId: string): Promise<void>;
  createTeam(name: string, firstAdminEmail?: string): Promise<string>;
  saveTeamLogo(file: File | null): Promise<void>;
  refreshWorkspace(): Promise<void>;
  // Every team in the workspace, membership or not — only ever populated for a
  // global admin, and read through the `admin_list_teams` RPC rather than the
  // membership-scoped queries the rest of the provider uses.
  adminTeams: AdminTeam[];
  adminTeamsLoaded: boolean;
  renameTeam(teamId: string, name: string): Promise<void>;
  deleteTeam(teamId: string): Promise<void>;
  adminInviteMember(teamId: string, email: string, role: TeamRole): Promise<string>;
  adminRevokeInvitation(teamId: string, invitationId: string): Promise<void>;
  adminSetMemberRole(teamId: string, profileId: string, role: TeamRole): Promise<void>;
  adminRemoveMember(teamId: string, profileId: string): Promise<void>;
  importPlayers(input: TeamPlayerInput[]): Promise<{ added: number; updated: number }>;
  removePlayer(playerId: string): Promise<void>;
  importFixtures(input: TeamFixtureInput[]): Promise<{ added: number; updated: number }>;
  removeFixture(fixtureId: string): Promise<void>;
  clearFixtures(): Promise<void>;
  /** Writes the current team's focus for one `YYYY-MM`. An empty note removes it. */
  saveMonthFocus(month: string, note: string): Promise<void>;
  /** Creates the team's routine on first use and hands back its id. */
  ensureWarmupRoutine(): Promise<string>;
  updateWarmupRoutine(routineId: string, patch: WarmupRoutinePatch): Promise<void>;
  addWarmupExercise(routineId: string, exercise: Exercise): Promise<void>;
  addCustomWarmupItem(routineId: string): Promise<void>;
  updateWarmupItem(routineId: string, itemId: string, patch: WarmupItemPatch): Promise<void>;
  deleteWarmupItem(routineId: string, itemId: string): Promise<void>;
  reorderWarmupItems(routineId: string, orderedIds: string[]): Promise<void>;
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

interface DbExercise {
  id: string; name: string; description: string; category: Exercise["category"]; age_groups: Exercise["ageGroups"] | null;
  media_url: string | null; media_kind: Exercise["mediaKind"];
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
interface DbFixture {
  id: string; team_id: string; match_number: string; starts_at: string; home_team: string; away_team: string;
  our_teams: string[]; result: string; venue: string; organizer: string; tournament: string; created_at: string; updated_at: string;
}
interface DbWarmupItem {
  id: string; routine_id: string; kind: SessionItem["kind"]; exercise_id: string | null; title: string; description: string;
  media_url: string | null; thumbnail_url: string | null; duration_minutes: number; coaching_notes: string; position: number;
}
interface DbWarmupRoutine {
  id: string; team_id: string; name: string; is_default: boolean; meet_minutes_before: number; notes: string;
  created_at: string; updated_at: string; warmup_items?: DbWarmupItem[];
}
interface DbMonthFocus { team_id: string; month: string; note: string; updated_at: string; updated_by: string | null; }
interface DbAttendance { session_id: string; player_id: string; is_present: boolean; checked_in_at: string | null; }
interface DbGrouping { session_id: string; kind: SessionGroupingKind; groups: PlayerGroup[]; generated_at: string; }

function mapExercise(row: DbExercise): Exercise {
  return { id: row.id, name: row.name, description: row.description, category: row.category, ageGroups: row.age_groups ?? [], mediaUrl: row.media_url, mediaKind: row.media_kind,
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
function mapFixture(row: DbFixture): TeamFixture {
  return { id: row.id, teamId: row.team_id, matchNumber: row.match_number, startsAt: row.starts_at, homeTeam: row.home_team,
    awayTeam: row.away_team, ourTeams: row.our_teams ?? [], result: row.result ?? "", venue: row.venue ?? "",
    organizer: row.organizer ?? "", tournament: row.tournament ?? "", createdAt: row.created_at, updatedAt: row.updated_at };
}
function mapWarmupRoutine(row: DbWarmupRoutine): WarmupRoutine {
  return { id: row.id, teamId: row.team_id, name: row.name, isDefault: row.is_default, meetMinutesBefore: row.meet_minutes_before,
    notes: row.notes ?? "", createdAt: row.created_at, updatedAt: row.updated_at,
    items: (row.warmup_items ?? []).sort((a, b) => a.position - b.position).map((item) => ({
      id: item.id, routineId: item.routine_id, kind: item.kind, exerciseId: item.exercise_id, title: item.title,
      description: item.description, mediaUrl: item.media_url, thumbnailUrl: item.thumbnail_url,
      durationMinutes: item.duration_minutes, coachingNotes: item.coaching_notes, position: item.position,
    })) };
}
function mapMonthFocus(row: DbMonthFocus): MonthFocus {
  return { teamId: row.team_id, month: row.month, note: row.note, updatedAt: row.updated_at, updatedBy: row.updated_by };
}
function mapPlayer(row: DbPlayer): TeamPlayer {
  return { id: row.id, teamId: row.team_id, fullName: row.full_name, jerseyNumber: row.jersey_number, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Profile | null>(isSupabaseConfigured ? null : demoUser);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  // Demo mode seeds every array synchronously below, so it starts settled.
  const [workspaceLoaded, setWorkspaceLoaded] = useState(!isSupabaseConfigured);
  const [teams, setTeams] = useState<Team[]>(() => isSupabaseConfigured ? [] : structuredClone(demoTeams));
  const [currentTeamId, setCurrentTeamId] = useState(demoTeams[0].id);
  const [exercises, setExercises] = useState<Exercise[]>(() => isSupabaseConfigured ? [] : structuredClone(demoExercises));
  // Private to the signed-in coach, so this stays empty until `loadPrivateData`
  // fills it — the library itself is public and loads for everyone.
  const [favoriteExerciseIds, setFavoriteExerciseIds] = useState<string[]>([]);
  const [sessions, setSessions] = useState<PlannedSession[]>(() => isSupabaseConfigured ? [] : structuredClone(demoSessions));
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [players, setPlayers] = useState<TeamPlayer[]>(() => isSupabaseConfigured ? [] : structuredClone(demoPlayers));
  const [fixtures, setFixtures] = useState<TeamFixture[]>(() => isSupabaseConfigured ? [] : structuredClone(demoFixtures));
  const [monthFocus, setMonthFocus] = useState<MonthFocus[]>(() => isSupabaseConfigured ? [] : structuredClone(demoMonthFocus));
  const [warmupRoutines, setWarmupRoutines] = useState<WarmupRoutine[]>(() => isSupabaseConfigured ? [] : structuredClone(demoWarmupRoutines));
  const [attendance, setAttendance] = useState<SessionAttendance[]>([]);
  const [groupings, setGroupings] = useState<SessionGrouping[]>([]);
  const [adminTeams, setAdminTeams] = useState<AdminTeam[]>(() => isSupabaseConfigured ? [] : demoAdminTeams());
  const [adminTeamsLoaded, setAdminTeamsLoaded] = useState(!isSupabaseConfigured);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [notice, setNotice] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const currentTeam = teams.find((team) => team.id === currentTeamId) ?? teams[0] ?? null;
  const selectTeam = useCallback((id: string) => { setCurrentTeamId(id); rememberSelectedTeamId(id); }, []);

  const loadPublicExercises = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("exercises").select("*, profiles:created_by(full_name)").is("archived_at", null).order("created_at", { ascending: false });
    if (!error && data) setExercises((data as unknown as DbExercise[]).map(mapExercise));
  }, [supabase]);

  // The whole workspace as the platform owner sees it. Only a global admin may
  // call the RPC — everyone else is refused by it — so it is fired from
  // `loadPrivateData` behind the profile flag rather than joined into the batch
  // that runs before the flag is known.
  const loadAdminTeams = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc("admin_list_teams");
    if (error) setNotice(norwegianServerMessage(error.message, "Lagene kunne ikke lastes."));
    else setAdminTeams(sortAdminTeams(((data ?? []) as AdminTeamRow[]).map(mapAdminTeam)));
    // Settle either way: a page that waits on this to decide what to render
    // would otherwise spin for ever on a failed load.
    setAdminTeamsLoaded(true);
  }, [supabase]);

  const loadPrivateData = useCallback(async (authUser: User) => {
    if (!supabase) return;
    const [{ data: memberships }, { data: sessionRows }, { data: invitationRows }, { data: profileRow, error: profileError }, { data: playerRows }, { data: fixtureRows }, { data: monthFocusRows }, { data: warmupRows }, { data: attendanceRows }, { data: groupingRows }, { data: favoriteRows }] = await Promise.all([
      supabase.from("team_memberships").select("team_id, profile_id, role, teams(id, name, logo_url), profiles(id, email, full_name, avatar_url)"),
      supabase.from("sessions").select("*, session_blocks(*, session_items(*))").order("updated_at", { ascending: false }),
      supabase.from("team_invitations").select("id, team_id, email, role, token, expires_at, accepted_at").is("accepted_at", null).gt("expires_at", new Date().toISOString()),
      supabase.from("profiles").select("id, email, full_name, is_global_admin, must_set_password").eq("id", authUser.id).single(),
      supabase.from("team_players").select("id, team_id, full_name, jersey_number, created_at, updated_at").order("full_name"),
      supabase.from("team_fixtures").select("id, team_id, match_number, starts_at, home_team, away_team, our_teams, result, venue, organizer, tournament, created_at, updated_at").order("starts_at"),
      supabase.from("team_month_focus").select("team_id, month, note, updated_at, updated_by"),
      supabase.from("warmup_routines").select("*, warmup_items(*)"),
      supabase.from("session_attendance").select("session_id, player_id, is_present, checked_in_at"),
      supabase.from("session_groupings").select("session_id, kind, groups, generated_at"),
      supabase.from("exercise_favorites").select("exercise_id"),
    ]);
    if (profileRow) setUser({ id: profileRow.id, email: profileRow.email, fullName: profileRow.full_name, initials: initials(profileRow.full_name), color: "#f0642e", isGlobalAdmin: profileRow.is_global_admin, mustSetPassword: profileRow.must_set_password });
    // This row carries `must_set_password`, so losing it silently means a coach
    // signs in looking fine and skips the forced password change. Say so.
    else if (profileError) setNotice("Profilen din kunne ikke lastes.");
    if (memberships) {
      type MembershipRow = { team_id: string; profile_id: string; role: TeamRole; teams: { id: string; name: string; logo_url: string | null } | null; profiles: { id: string; email: string; full_name: string; avatar_url: string | null } | null };
      const grouped = new Map<string, Team>();
      for (const membership of memberships as unknown as MembershipRow[]) {
        if (!membership.teams) continue;
        const existing = grouped.get(membership.team_id) ?? { id: membership.team_id, name: membership.teams.name, shortName: shortTeamName(membership.teams.name), logoUrl: membership.teams.logo_url, role: "coach" as TeamRole, members: [] };
        if (membership.profile_id === authUser.id) existing.role = membership.role;
        if (membership.profiles && !existing.members.some((member) => member.id === membership.profile_id)) {
          existing.members.push({ id: membership.profiles.id, email: membership.profiles.email, fullName: membership.profiles.full_name, initials: initials(membership.profiles.full_name), color: membership.profile_id === authUser.id ? "#f0642e" : "#477b70", teamRole: membership.role });
        }
        grouped.set(membership.team_id, existing);
      }
      const mapped = [...grouped.values()];
      setTeams(mapped);
      const teamIds = mapped.map((team) => team.id);
      const remembered = readSelectedTeamId();
      setCurrentTeamId((current) => keepSelectedTeamId(current, teamIds, remembered) ?? current);
    }
    if (sessionRows) setSessions((sessionRows as unknown as DbSession[]).map(mapSession));
    if (invitationRows) setInvitations((invitationRows as unknown as Array<{ id: string; team_id: string; email: string; role: TeamRole; token: string; expires_at: string; accepted_at: string | null }>).map((row) => ({ id: row.id, teamId: row.team_id, email: row.email, role: row.role, token: row.token, expiresAt: row.expires_at, acceptedAt: row.accepted_at })));
    if (playerRows) setPlayers((playerRows as unknown as DbPlayer[]).map(mapPlayer));
    if (fixtureRows) setFixtures((fixtureRows as unknown as DbFixture[]).map(mapFixture));
    if (monthFocusRows) setMonthFocus((monthFocusRows as unknown as DbMonthFocus[]).map(mapMonthFocus));
    if (warmupRows) setWarmupRoutines((warmupRows as unknown as DbWarmupRoutine[]).map(mapWarmupRoutine));
    if (attendanceRows) setAttendance((attendanceRows as unknown as DbAttendance[]).map((row) => ({ sessionId: row.session_id, playerId: row.player_id, isPresent: row.is_present, checkedInAt: row.checked_in_at })));
    if (groupingRows) setGroupings((groupingRows as unknown as DbGrouping[]).map((row) => ({ sessionId: row.session_id, kind: row.kind, groups: row.groups, generatedAt: row.generated_at })));
    if (favoriteRows) setFavoriteExerciseIds((favoriteRows as unknown as Array<{ exercise_id: string }>).map((row) => row.exercise_id));
    if (profileRow?.is_global_admin) await loadAdminTeams();
  }, [loadAdminTeams, supabase]);

  useEffect(() => {
    if (!supabase) return;
    const loadTimer = window.setTimeout(() => void loadPublicExercises(), 0);
    void supabase.auth.getUser().then(({ data }) => {
      setUser((current) => seedProfile(current, data.user ? profileFromUser(data.user) : null));
      // `finally`, not `then`: a failed load still settles the workspace, or a
      // waiting page spins for ever on the arena wifi this app is used on.
      if (data.user) void loadPrivateData(data.user).finally(() => setWorkspaceLoaded(true));
      else setWorkspaceLoaded(true);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isIdentityChange(event)) return;
      setUser((current) => seedProfile(current, session?.user ? profileFromUser(session.user) : null));
      if (session?.user) void loadPrivateData(session.user).finally(() => setWorkspaceLoaded(true));
      else setWorkspaceLoaded(true);
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
    // Øvelsesbanken stays readable signed out, so the hearts would otherwise
    // still be on screen for whoever sits down at the machine next.
    if (supabase) setFavoriteExerciseIds([]);
  }, [supabase]);

  const addExercise = useCallback(async (input: ExerciseInput) => {
    if (!user) throw new Error("Logg inn for å legge til en øvelse");
    const media = input.mediaUrl ? await resolveExerciseMedia(input.mediaUrl) : { kind: null, thumbnailUrl: null }; const now = new Date().toISOString(); const id = makeUuid();
    const exercise: Exercise = { id, ...input, mediaKind: media.kind, thumbnailUrl: media.thumbnailUrl, createdBy: user.id, createdByName: user.fullName, archivedAt: null, createdAt: now, updatedAt: now };
    setExercises((current) => [exercise, ...current]);
    try {
      await persist(supabase ? () => supabase.from("exercises").insert({ id, name: input.name, description: input.description, category: input.category, age_groups: input.ageGroups, media_url: input.mediaUrl, media_kind: media.kind, thumbnail_url: media.thumbnailUrl, created_by: user.id }) : null);
    } catch (error) {
      setExercises((current) => current.filter((entry) => entry.id !== id));
      throw error;
    }
  }, [persist, supabase, user]);

  // Only the author or a global admin may change a library exercise. Postgres is
  // the boundary (`exercises_edit_owner`), but it enforces the rule by filtering
  // the row out, so a blocked update comes back as a successful no-op — without
  // this guard the optimistic edit would sit there looking saved.
  const updateExercise = useCallback(async (id: string, input: ExerciseInput) => {
    const previous = exercises.find((exercise) => exercise.id === id);
    if (!previous || !canEditExercise(user, previous)) throw new Error(NOT_EXERCISE_OWNER);
    const media = input.mediaUrl ? await resolveExerciseMedia(input.mediaUrl) : { kind: null, thumbnailUrl: null }; const updatedAt = new Date().toISOString();
    setExercises((current) => current.map((exercise) => exercise.id === id ? { ...exercise, ...input, mediaKind: media.kind, thumbnailUrl: media.thumbnailUrl, updatedAt } : exercise));
    try {
      await persist(supabase ? () => supabase.from("exercises").update({ name: input.name, description: input.description, category: input.category, age_groups: input.ageGroups, media_url: input.mediaUrl, media_kind: media.kind, thumbnail_url: media.thumbnailUrl }).eq("id", id) : null);
    } catch (error) {
      setExercises((current) => current.map((exercise) => exercise.id === id ? previous : exercise));
      throw error;
    }
  }, [exercises, persist, supabase, user]);

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
    const index = exercises.findIndex((exercise) => exercise.id === id); const previous = exercises[index];
    // The card menu hides Arkiver from everyone but the author and a global admin;
    // this reports the same refusal the way `persist` reports a server one, because
    // RLS would answer an unowned archive with a silent no-op.
    if (!previous || !canEditExercise(user, previous)) { setSaveState("error"); setNotice(NOT_EXERCISE_OWNER); throw new Error(NOT_EXERCISE_OWNER); }
    const archivedAt = new Date().toISOString(); setExercises((current) => current.filter((exercise) => exercise.id !== id));
    try {
      await persist(supabase ? () => supabase.from("exercises").update({ archived_at: archivedAt }).eq("id", id) : null);
    } catch (error) {
      setExercises((current) => current.some((exercise) => exercise.id === id) ? current : [...current.slice(0, index), previous, ...current.slice(index)]);
      throw error;
    }
  }, [exercises, persist, supabase, user]);

  // A heart is the coach's own, not the library's: it is a row in
  // `exercise_favorites` keyed by profile, so favouriting never writes to an
  // exercise another coach owns and nobody else can read the shortlist. The
  // optimistic flip is rolled back on failure like `addExercise` — a filled
  // heart is the only feedback the button gives, so it must not lie.
  const toggleFavoriteExercise = useCallback(async (exerciseId: string) => {
    if (!user) throw new Error("Logg inn for å lagre favoritter");
    const wasFavorite = favoriteExerciseIds.includes(exerciseId);
    const add = (current: string[]) => current.includes(exerciseId) ? current : [...current, exerciseId];
    const remove = (current: string[]) => current.filter((id) => id !== exerciseId);
    setFavoriteExerciseIds(wasFavorite ? remove : add);
    try {
      await persist(supabase ? () => wasFavorite
        ? supabase.from("exercise_favorites").delete().eq("profile_id", user.id).eq("exercise_id", exerciseId)
        : supabase.from("exercise_favorites").insert({ profile_id: user.id, exercise_id: exerciseId }) : null);
    } catch (error) {
      setFavoriteExerciseIds(wasFavorite ? add : remove);
      throw error;
    }
  }, [favoriteExerciseIds, persist, supabase, user]);

  // Refetches teams, sessions, players and the rest for the signed-in coach.
  // Anything that changes membership outside the normal mutation path — accepting
  // an invitation, creating a team — must call this, or the workspace stays empty
  // until the next sign-in.
  const refreshWorkspace = useCallback(async () => {
    if (!supabase || !user) return;
    await loadPrivateData({ id: user.id, email: user.email, user_metadata: { full_name: user.fullName } } as unknown as User);
  }, [loadPrivateData, supabase, user]);

  // Onboarding no longer depends on the coach holding an /invite link. Their
  // account is created from the Supabase dashboard, and `invitations_read` lets
  // them select the row addressed to their own email — token included — so the
  // membership can be claimed the moment the workspace loads. The link still
  // works; it is just no longer the only way onto a team.
  const claimedInvitations = useRef(new Set<string>());
  useEffect(() => {
    if (!supabase || !user || !workspaceLoaded) return;
    const waiting = claimableInvitations(user.email, teams.map((team) => team.id), invitations).filter((invitation) => !claimedInvitations.current.has(invitation.id));
    if (waiting.length === 0) return;
    // Claim before awaiting: `teams` and `invitations` both change underneath
    // this effect while the RPCs are in flight, and a second pass would only
    // fail the single-use check.
    for (const invitation of waiting) claimedInvitations.current.add(invitation.id);
    void (async () => {
      let joined = 0;
      for (const invitation of waiting) {
        const { error } = await supabase.rpc("accept_team_invitation", { invitation_token: invitation.token });
        // "Already used" means the /invite page or another tab got there first,
        // which is still a membership — anything else stays quiet rather than
        // interrupting a coach who never asked for this to happen.
        if (!error || isInvitationAlreadyUsed(error.message)) joined += 1;
      }
      if (joined === 0) return;
      await refreshWorkspace();
      setNotice(joined === 1 ? "Du er nå med på laget du ble invitert til." : "Du er nå med på lagene du ble invitert til.");
    })();
  }, [invitations, refreshWorkspace, supabase, teams, user, workspaceLoaded]);

  // Creating a team no longer joins it: the platform owner hands the team to a
  // trainer, who claims the admin seat from the invitation on first sign-in, and
  // so is the only person the team overview ever lists.
  const createTeam = useCallback(async (name: string, firstAdminEmail?: string) => {
    if (!user) throw new Error("Logg inn for å opprette et lag");
    if (!user.isGlobalAdmin) throw new Error("Du må være systemadministrator for å opprette lag");
    const invitedEmail = firstAdminEmail?.trim().toLowerCase() || null;
    if (supabase) {
      const { data, error } = await supabase.rpc("create_team", { team_name: name, first_admin_email: invitedEmail });
      if (error) throw new Error(norwegianServerMessage(error.message, "Laget kunne ikke opprettes."));
      await refreshWorkspace();
      return String(data);
    }
    const id = makeUuid();
    const invitations: TeamInvitation[] = invitedEmail
      ? [{ id: makeUuid(), teamId: id, email: invitedEmail, role: "admin", token: makeUuid(), expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), acceptedAt: null }]
      : [];
    setAdminTeams((current) => sortAdminTeams([...current, { id, name, shortName: shortTeamName(name), logoUrl: null, members: [], invitations }]));
    return id;
  }, [refreshWorkspace, supabase, user]);

  // Upload, repoint the team row, then drop the file the team no longer uses.
  // The path starts with the team id because the storage policy reads that
  // folder to decide whether the caller administers this team. `null` clears
  // the logo. Any leftover object is a stale file in a public bucket, never a
  // broken logo, so cleanup failures stay quiet.
  const saveTeamLogo = useCallback(async (file: File | null) => {
    if (!currentTeam) throw new Error("Velg et lag før du endrer klubblogoen");
    if (currentTeam.role !== "admin") throw new Error("Bare en lagadministrator kan endre klubblogoen");
    const teamId = currentTeam.id; const previousUrl = currentTeam.logoUrl;
    let logoUrl: string | null = null;
    if (file) {
      const logo = validateTeamLogoUpload(file);
      if (!supabase) logoUrl = URL.createObjectURL(file);
      else {
        const path = `${teamId}/${makeUuid()}.${logo.extension}`;
        const { error } = await supabase.storage.from(TEAM_LOGO_BUCKET).upload(path, file, { cacheControl: "31536000", contentType: logo.contentType, upsert: false });
        if (error) throw new Error(norwegianServerMessage(error.message, "Klubblogoen kunne ikke lastes opp."));
        logoUrl = supabase.storage.from(TEAM_LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
      }
    }
    setTeams((current) => current.map((team) => team.id === teamId ? { ...team, logoUrl } : team));
    try {
      await persist(supabase ? () => supabase.from("teams").update({ logo_url: logoUrl }).eq("id", teamId) : null);
    } catch (error) {
      setTeams((current) => current.map((team) => team.id === teamId ? { ...team, logoUrl: previousUrl } : team));
      if (supabase && logoUrl) await removeTeamLogo(supabase, teamId, logoUrl).catch(() => undefined);
      throw error;
    }
    if (supabase && previousUrl) await removeTeamLogo(supabase, teamId, previousUrl).catch(() => undefined);
    else if (!supabase && previousUrl?.startsWith("blob:")) URL.revokeObjectURL(previousUrl);
  }, [currentTeam, persist, supabase]);

  // Membership is administered only from the console, so these take the team
  // explicitly rather than leaning on `currentTeam` — the global admin is not a
  // member of the teams they hand out. 202609020021 is what makes them the only
  // writers: it narrowed the membership and invitation policies to
  // `is_global_admin()`. `adminTeams` is updated optimistically like every other
  // mutation, and a team that is also one of *their* teams is resynced so /team
  // agrees.
  const patchAdminTeam = useCallback((teamId: string, patch: (team: AdminTeam) => AdminTeam) => {
    setAdminTeams((current) => current.map((team) => team.id === teamId ? patch(team) : team));
  }, []);

  const syncOwnTeams = useCallback(async (teamId: string) => {
    if (teams.some((team) => team.id === teamId)) await refreshWorkspace();
  }, [refreshWorkspace, teams]);

  const renameTeam = useCallback(async (teamId: string, name: string) => {
    const trimmed = name.trim();
    if (trimmed.length < 3) throw new Error("Lagnavnet er for kort");
    const previous = adminTeams.find((team) => team.id === teamId);
    patchAdminTeam(teamId, (team) => ({ ...team, name: trimmed, shortName: shortTeamName(trimmed) }));
    try {
      await persist(supabase ? () => supabase.from("teams").update({ name: trimmed }).eq("id", teamId) : null);
    } catch (error) {
      if (previous) patchAdminTeam(teamId, () => previous);
      throw error;
    }
    setAdminTeams((current) => sortAdminTeams(current));
    await syncOwnTeams(teamId);
  }, [adminTeams, patchAdminTeam, persist, supabase, syncOwnTeams]);

  const deleteTeam = useCallback(async (teamId: string) => {
    const previous = adminTeams;
    setAdminTeams((current) => current.filter((team) => team.id !== teamId));
    try {
      await persist(supabase ? () => supabase.from("teams").delete().eq("id", teamId) : null);
    } catch (error) {
      setAdminTeams(previous);
      throw error;
    }
    await syncOwnTeams(teamId);
  }, [adminTeams, persist, supabase, syncOwnTeams]);

  const adminInviteMember = useCallback(async (teamId: string, email: string, role: TeamRole) => {
    if (!user) throw new Error("Logg inn for å invitere en trener");
    const id = makeUuid(); const token = makeUuid(); const address = email.trim().toLowerCase();
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const invitation: TeamInvitation = { id, teamId, email: address, role, token, expiresAt, acceptedAt: null };
    patchAdminTeam(teamId, (team) => ({ ...team, invitations: [...team.invitations, invitation] }));
    try {
      await persist(supabase ? () => supabase.from("team_invitations").insert({ id, token, team_id: teamId, email: address, role, invited_by: user.id, expires_at: expiresAt }) : null);
    } catch (error) {
      patchAdminTeam(teamId, (team) => ({ ...team, invitations: team.invitations.filter((entry) => entry.id !== id) }));
      throw error;
    }
    await syncOwnTeams(teamId);
    return invitationUrl(window.location.origin, token);
  }, [patchAdminTeam, persist, supabase, syncOwnTeams, user]);

  const adminRevokeInvitation = useCallback(async (teamId: string, invitationId: string) => {
    const previous = adminTeams.find((team) => team.id === teamId);
    patchAdminTeam(teamId, (team) => ({ ...team, invitations: team.invitations.filter((entry) => entry.id !== invitationId) }));
    try {
      await persist(supabase ? () => supabase.from("team_invitations").delete().eq("id", invitationId) : null);
    } catch (error) {
      if (previous) patchAdminTeam(teamId, () => previous);
      throw error;
    }
    await syncOwnTeams(teamId);
  }, [adminTeams, patchAdminTeam, persist, supabase, syncOwnTeams]);

  const adminSetMemberRole = useCallback(async (teamId: string, profileId: string, role: TeamRole) => {
    const previous = adminTeams.find((team) => team.id === teamId);
    patchAdminTeam(teamId, (team) => ({ ...team, members: team.members.map((member) => member.id === profileId ? { ...member, teamRole: role } : member) }));
    try {
      await persist(supabase ? () => supabase.from("team_memberships").update({ role }).eq("team_id", teamId).eq("profile_id", profileId) : null);
    } catch (error) {
      if (previous) patchAdminTeam(teamId, () => previous);
      throw error;
    }
    await syncOwnTeams(teamId);
  }, [adminTeams, patchAdminTeam, persist, supabase, syncOwnTeams]);

  const adminRemoveMember = useCallback(async (teamId: string, profileId: string) => {
    const previous = adminTeams.find((team) => team.id === teamId);
    patchAdminTeam(teamId, (team) => ({ ...team, members: team.members.filter((member) => member.id !== profileId) }));
    try {
      await persist(supabase ? () => supabase.from("team_memberships").delete().eq("team_id", teamId).eq("profile_id", profileId) : null);
    } catch (error) {
      if (previous) patchAdminTeam(teamId, () => previous);
      throw error;
    }
    // Removing themselves takes the team out of their own switcher, so this one
    // has to resync even though the row is gone from `adminTeams` already.
    if (profileId === user?.id) await refreshWorkspace();
    else await syncOwnTeams(teamId);
  }, [adminTeams, patchAdminTeam, persist, refreshWorkspace, supabase, syncOwnTeams, user]);

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

  // The schedule is re-published during the season, so an import is an upsert
  // on the match number rather than an append: a moved kick-off corrects the
  // match already on the calendar. A row the local state already knows keeps
  // its id, which is what makes the upsert land on the same row as the unique
  // (team, match number) index does.
  const importFixtures = useCallback(async (input: TeamFixtureInput[]) => {
    if (!currentTeam) throw new Error("Velg et lag først");
    const known = new Map(fixtures.filter((fixture) => fixture.teamId === currentTeam.id).map((fixture) => [fixture.matchNumber, fixture]));
    const now = new Date().toISOString();
    let added = 0; let updated = 0;
    const imported = input.map((entry) => {
      const existing = known.get(entry.matchNumber);
      if (existing) updated += 1; else added += 1;
      return { ...entry, id: existing?.id ?? makeUuid(), teamId: currentTeam.id, createdAt: existing?.createdAt ?? now, updatedAt: now };
    });
    const importedNumbers = new Set(imported.map((fixture) => fixture.matchNumber));
    setFixtures((current) => [...current.filter((fixture) => fixture.teamId !== currentTeam.id || !importedNumbers.has(fixture.matchNumber)), ...imported].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
    const rows = imported.map((fixture) => ({ id: fixture.id, team_id: fixture.teamId, match_number: fixture.matchNumber, starts_at: fixture.startsAt,
      home_team: fixture.homeTeam, away_team: fixture.awayTeam, our_teams: fixture.ourTeams, result: fixture.result,
      venue: fixture.venue, organizer: fixture.organizer, tournament: fixture.tournament }));
    await persist(supabase ? () => supabase.from("team_fixtures").upsert(rows, { onConflict: "team_id,match_number" }) : null);
    setNotice(`${added} ${added === 1 ? "kamp" : "kamper"} lagt til${updated ? `, ${updated} oppdatert` : ""}.`);
    return { added, updated };
  }, [currentTeam, fixtures, persist, supabase]);

  // Only a team admin may delete, and Postgres enforces that by filtering the
  // row out rather than failing, so the removal is rolled back when the row is
  // still there afterwards.
  const removeFixture = useCallback(async (fixtureId: string) => {
    let removed: TeamFixture | undefined;
    setFixtures((current) => { removed = current.find((fixture) => fixture.id === fixtureId); return current.filter((fixture) => fixture.id !== fixtureId); });
    try {
      await persist(supabase ? () => supabase.from("team_fixtures").delete().eq("id", fixtureId) : null);
    } catch (error) {
      if (removed) setFixtures((current) => current.some((fixture) => fixture.id === fixtureId) ? current : [...current, removed as TeamFixture].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
      throw error;
    }
  }, [persist, supabase]);

  // The routine is created the first time a coach edits it, not when the team
  // is made: a team that never opens the warm-up never gets an empty row, and
  // the match modal can render "ingen oppvarming ennå" from nothing.
  const ensureWarmupRoutine = useCallback(async () => {
    if (!currentTeam || !user) throw new Error("Velg et lag først");
    const existing = warmupRoutines.find((routine) => routine.teamId === currentTeam.id && routine.isDefault);
    if (existing) return existing.id;
    const id = makeUuid(); const now = new Date().toISOString();
    const routine: WarmupRoutine = { id, teamId: currentTeam.id, name: "Kampoppvarming", isDefault: true, meetMinutesBefore: 60, notes: "", items: [], createdAt: now, updatedAt: now };
    setWarmupRoutines((current) => [...current, routine]);
    try {
      await persist(supabase ? () => supabase.from("warmup_routines").insert({ id, team_id: currentTeam.id, name: routine.name, is_default: true, meet_minutes_before: 60, created_by: user.id, updated_by: user.id }) : null);
    } catch (error) {
      setWarmupRoutines((current) => current.filter((entry) => entry.id !== id));
      throw error;
    }
    return id;
  }, [currentTeam, persist, supabase, user, warmupRoutines]);

  const patchRoutine = useCallback((routineId: string, change: (routine: WarmupRoutine) => WarmupRoutine) => {
    setWarmupRoutines((current) => current.map((routine) => routine.id === routineId ? change(routine) : routine));
  }, []);

  const updateWarmupRoutine = useCallback(async (routineId: string, patch: WarmupRoutinePatch) => {
    patchRoutine(routineId, (routine) => ({ ...routine, ...patch, updatedAt: new Date().toISOString() }));
    const row = { ...(patch.name !== undefined && { name: patch.name }), ...(patch.meetMinutesBefore !== undefined && { meet_minutes_before: patch.meetMinutesBefore }), ...(patch.notes !== undefined && { notes: patch.notes }), updated_by: user?.id };
    await persist(supabase ? () => supabase.from("warmup_routines").update(row).eq("id", routineId) : null);
  }, [patchRoutine, persist, supabase, user]);

  const dropWarmupItem = useCallback((routineId: string, itemId: string) => {
    patchRoutine(routineId, (routine) => ({ ...routine, items: routine.items.filter((item) => item.id !== itemId) }));
  }, [patchRoutine]);

  const addWarmupItem = useCallback(async (routineId: string, item: WarmupItem, exerciseId: string | null) => {
    patchRoutine(routineId, (routine) => ({ ...routine, items: [...routine.items, item] }));
    try {
      await persist(supabase ? () => supabase.from("warmup_items").insert({ id: item.id, routine_id: routineId, kind: item.kind, exercise_id: exerciseId,
        title: item.title, description: item.description, media_url: item.mediaUrl, thumbnail_url: item.thumbnailUrl,
        duration_minutes: item.durationMinutes, position: item.position, updated_by: user?.id }) : null);
    } catch (error) {
      dropWarmupItem(routineId, item.id);
      throw error;
    }
  }, [dropWarmupItem, patchRoutine, persist, supabase, user]);

  // A warm-up activity copies the exercise the same way a session item does, so
  // the routine keeps reading the way it did the day it was put together.
  const addWarmupExercise = useCallback(async (routineId: string, exercise: Exercise) => {
    const items = warmupRoutines.find((routine) => routine.id === routineId)?.items ?? [];
    await addWarmupItem(routineId, { id: makeUuid(), routineId, kind: "exercise", exerciseId: exercise.id, title: exercise.name,
      description: exercise.description, mediaUrl: exercise.mediaUrl, thumbnailUrl: exercise.thumbnailUrl,
      durationMinutes: 5, coachingNotes: "", position: nextPosition(items) }, exercise.id);
  }, [addWarmupItem, warmupRoutines]);

  const addCustomWarmupItem = useCallback(async (routineId: string) => {
    const items = warmupRoutines.find((routine) => routine.id === routineId)?.items ?? [];
    await addWarmupItem(routineId, { id: makeUuid(), routineId, kind: "custom", exerciseId: null, title: "Ny aktivitet",
      description: "", mediaUrl: null, thumbnailUrl: null, durationMinutes: 5, coachingNotes: "", position: nextPosition(items) }, null);
  }, [addWarmupItem, warmupRoutines]);

  const updateWarmupItem = useCallback(async (routineId: string, itemId: string, patch: WarmupItemPatch) => {
    patchRoutine(routineId, (routine) => ({ ...routine, items: routine.items.map((item) => item.id === itemId ? { ...item, ...patch } : item) }));
    const row = { ...(patch.title !== undefined && { title: patch.title }), ...(patch.description !== undefined && { description: patch.description }), ...(patch.durationMinutes !== undefined && { duration_minutes: patch.durationMinutes }), ...(patch.coachingNotes !== undefined && { coaching_notes: patch.coachingNotes }), updated_by: user?.id };
    await persist(supabase ? () => supabase.from("warmup_items").update(row).eq("id", itemId) : null);
  }, [patchRoutine, persist, supabase, user]);

  const deleteWarmupItem = useCallback(async (routineId: string, itemId: string) => {
    dropWarmupItem(routineId, itemId);
    await persist(supabase ? () => supabase.from("warmup_items").delete().eq("id", itemId) : null);
  }, [dropWarmupItem, persist, supabase]);

  const reorderWarmupItems = useCallback(async (routineId: string, orderedIds: string[]) => {
    patchRoutine(routineId, (routine) => ({ ...routine, items: orderedIds.flatMap((id, position) => { const item = routine.items.find((entry) => entry.id === id); return item ? [{ ...item, position }] : []; }) }));
    await persist(supabase ? () => supabase.rpc("reorder_warmup_items", { target_routine_id: routineId, ordered_item_ids: orderedIds }) : null);
  }, [patchRoutine, persist, supabase]);

  const clearFixtures = useCallback(async () => {
    if (!currentTeam) return;
    const removed = fixtures.filter((fixture) => fixture.teamId === currentTeam.id);
    setFixtures((current) => current.filter((fixture) => fixture.teamId !== currentTeam.id));
    try {
      await persist(supabase ? () => supabase.from("team_fixtures").delete().eq("team_id", currentTeam.id) : null);
    } catch (error) {
      setFixtures((current) => [...current, ...removed.filter((fixture) => !current.some((entry) => entry.id === fixture.id))].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
      throw error;
    }
  }, [currentTeam, fixtures, persist, supabase]);

  // The month focus is a single short note the whole coaching team shares, so
  // there is nothing to merge on a clash: the last coach to save wins, and the
  // next `loadPrivateData` hands everyone the same text. An empty note deletes
  // the row rather than storing a blank — the check constraint refuses one, and
  // "no row" is the only shape the calendar tests for. The optimistic write is
  // rolled back like `toggleFavoriteExercise`: the note on screen is the only
  // confirmation the coach gets, so it must not survive a failed save.
  const saveMonthFocus = useCallback(async (month: string, note: string) => {
    if (!currentTeam) return;
    const teamId = currentTeam.id;
    const trimmed = note.trim().slice(0, MONTH_FOCUS_MAX_LENGTH);
    const previous = monthFocus;
    const others = previous.filter((entry) => entry.teamId !== teamId || entry.month !== month);
    setMonthFocus(trimmed ? [...others, { teamId, month, note: trimmed, updatedAt: new Date().toISOString(), updatedBy: user?.id ?? null }] : others);
    try {
      await persist(supabase ? () => trimmed
        ? supabase.from("team_month_focus").upsert({ team_id: teamId, month, note: trimmed, updated_by: user?.id ?? null }, { onConflict: "team_id,month" })
        : supabase.from("team_month_focus").delete().eq("team_id", teamId).eq("month", month) : null);
    } catch (error) {
      setMonthFocus(previous);
      throw error;
    }
  }, [currentTeam, monthFocus, persist, supabase, user]);

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

  const dropBlock = useCallback((sessionId: string, blockId: string) => setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, blocks: session.blocks.filter((block) => block.id !== blockId) } : session)), []);
  const dropItem = useCallback((sessionId: string, blockId: string, itemId: string) => setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, blocks: session.blocks.map((block) => block.id === blockId ? { ...block, items: block.items.filter((item) => item.id !== itemId) } : block) } : session)), []);

  const addBlock = useCallback(async (sessionId: string, title: string) => {
    const id = makeUuid(); const session = sessions.find((entry) => entry.id === sessionId); const position = nextPosition(session?.blocks ?? []);
    const block: SessionBlock = { id, sessionId, title, notes: "", position, items: [], updatedBy: user?.id ?? demoUser.id };
    setSessions((current) => current.map((entry) => entry.id === sessionId ? { ...entry, blocks: [...entry.blocks, block] } : entry));
    try {
      await persist(supabase ? () => supabase.from("session_blocks").insert({ id, session_id: sessionId, title, position, updated_by: user?.id }) : null);
    } catch (error) {
      dropBlock(sessionId, id);
      throw error;
    }
    return id;
  }, [dropBlock, persist, sessions, supabase, user]);

  const updateBlock = useCallback(async (sessionId: string, blockId: string, patch: BlockPatch) => {
    setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, blocks: session.blocks.map((block) => block.id === blockId ? { ...block, ...patch, updatedBy: user?.id ?? block.updatedBy } : block) } : session));
    const row = { ...(patch.title !== undefined && { title: patch.title }), ...(patch.notes !== undefined && { notes: patch.notes }), updated_by: user?.id };
    await persist(supabase ? () => supabase.from("session_blocks").update(row).eq("id", blockId) : null);
  }, [persist, supabase, user]);
  const deleteBlock = useCallback(async (sessionId: string, blockId: string) => { dropBlock(sessionId, blockId); await persist(supabase ? () => supabase.from("session_blocks").delete().eq("id", blockId) : null); }, [dropBlock, persist, supabase]);
  const reorderBlocks = useCallback(async (sessionId: string, orderedIds: string[]) => { setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, blocks: orderedIds.flatMap((id, position) => { const block = session.blocks.find((entry) => entry.id === id); return block ? [{ ...block, position }] : []; }) } : session)); await persist(supabase ? () => supabase.rpc("reorder_session_blocks", { target_session_id: sessionId, ordered_block_ids: orderedIds }) : null); }, [persist, supabase]);

  const addExerciseItem = useCallback(async (sessionId: string, blockId: string, exercise: Exercise) => {
    const id = makeUuid(); const block = sessions.find((session) => session.id === sessionId)?.blocks.find((entry) => entry.id === blockId); const position = nextPosition(block?.items ?? []);
    const item: SessionItem = { id, blockId, kind: "exercise", exerciseId: exercise.id, title: exercise.name, description: exercise.description, mediaUrl: exercise.mediaUrl, thumbnailUrl: exercise.thumbnailUrl, durationMinutes: 10, coachingNotes: "", position, updatedBy: user?.id ?? demoUser.id };
    setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, blocks: session.blocks.map((entry) => entry.id === blockId ? { ...entry, items: [...entry.items, item] } : entry) } : session));
    try {
      await persist(supabase ? () => supabase.from("session_items").insert({ id, block_id: blockId, kind: item.kind, exercise_id: exercise.id, title: item.title, description: item.description, media_url: item.mediaUrl, thumbnail_url: item.thumbnailUrl, duration_minutes: 10, position, updated_by: user?.id }) : null);
    } catch (error) {
      dropItem(sessionId, blockId, id);
      throw error;
    }
  }, [dropItem, persist, sessions, supabase, user]);

  const addCustomItem = useCallback(async (sessionId: string, blockId: string) => {
    const id = makeUuid(); const block = sessions.find((session) => session.id === sessionId)?.blocks.find((entry) => entry.id === blockId); const position = nextPosition(block?.items ?? []);
    const item: SessionItem = { id, blockId, kind: "custom", exerciseId: null, title: "Ny aktivitet", description: "", mediaUrl: null, thumbnailUrl: null, durationMinutes: 10, coachingNotes: "", position, updatedBy: user?.id ?? demoUser.id };
    setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, blocks: session.blocks.map((entry) => entry.id === blockId ? { ...entry, items: [...entry.items, item] } : entry) } : session));
    try {
      await persist(supabase ? () => supabase.from("session_items").insert({ id, block_id: blockId, kind: "custom", title: item.title, duration_minutes: 10, position, updated_by: user?.id }) : null);
    } catch (error) {
      dropItem(sessionId, blockId, id);
      throw error;
    }
  }, [dropItem, persist, sessions, supabase, user]);

  const updateItem = useCallback(async (sessionId: string, blockId: string, itemId: string, patch: ItemPatch) => { setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, blocks: session.blocks.map((block) => block.id === blockId ? { ...block, items: block.items.map((item) => item.id === itemId ? { ...item, ...patch, updatedBy: user?.id ?? item.updatedBy } : item) } : block) } : session)); const row = { ...(patch.title !== undefined && { title: patch.title }), ...(patch.description !== undefined && { description: patch.description }), ...(patch.durationMinutes !== undefined && { duration_minutes: patch.durationMinutes }), ...(patch.coachingNotes !== undefined && { coaching_notes: patch.coachingNotes }), updated_by: user?.id }; await persist(supabase ? () => supabase.from("session_items").update(row).eq("id", itemId) : null); }, [persist, supabase, user]);
  const deleteItem = useCallback(async (sessionId: string, blockId: string, itemId: string) => { dropItem(sessionId, blockId, itemId); await persist(supabase ? () => supabase.from("session_items").delete().eq("id", itemId) : null); }, [dropItem, persist, supabase]);
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

  // The library wins over the copy a session or warm-up item took when it was
  // added, so an edit in Øvelsesbanken shows on every card linking to that
  // exercise. Resolved on the way out only: mutations below keep reading and
  // writing the stored rows in `sessions`/`warmupRoutines`.
  const exerciseLibrary = useMemo(() => indexExercises(exercises), [exercises]);
  const resolvedSessions = useMemo(() => resolveAll(sessions, (session) => resolveSessionDisplay(session, exerciseLibrary)), [sessions, exerciseLibrary]);
  const resolvedWarmupRoutines = useMemo(() => resolveAll(warmupRoutines, (routine) => resolveWarmupRoutineDisplay(routine, exerciseLibrary)), [warmupRoutines, exerciseLibrary]);

  const value = useMemo<GrepContextValue>(() => ({ user, authLoading, workspaceLoaded, isDemoMode: !supabase, teams, currentTeam, exercises, favoriteExerciseIds, sessions: resolvedSessions, invitations, players, fixtures, monthFocus, warmupRoutines: resolvedWarmupRoutines, attendance, groupings, saveState, notice, sidebarCollapsed, setSidebarCollapsed, setCurrentTeamId: selectTeam, clearNotice: () => setNotice(null), signIn, setPassword, signOut, addExercise, updateExercise, uploadExerciseMedia, discardExerciseMedia, archiveExercise, toggleFavoriteExercise, createTeam, saveTeamLogo, refreshWorkspace, adminTeams, adminTeamsLoaded, renameTeam, deleteTeam, adminInviteMember, adminRevokeInvitation, adminSetMemberRole, adminRemoveMember, importPlayers, removePlayer, importFixtures, removeFixture, clearFixtures, saveMonthFocus, ensureWarmupRoutine, updateWarmupRoutine, addWarmupExercise, addCustomWarmupItem, updateWarmupItem, deleteWarmupItem, reorderWarmupItems, createSession, updateSession, deleteSession, publishSession, startWorkout, startWorkoutWithoutSetup, undoWorkoutStart, finishWorkout, addBlock, updateBlock, deleteBlock, reorderBlocks, addExerciseItem, addCustomItem, updateItem, deleteItem, reorderItems, reloadSession, setPlayerPresent, saveGrouping }), [user, authLoading, workspaceLoaded, supabase, teams, currentTeam, exercises, favoriteExerciseIds, resolvedSessions, invitations, players, fixtures, monthFocus, resolvedWarmupRoutines, attendance, groupings, saveState, notice, sidebarCollapsed, selectTeam, signIn, setPassword, signOut, addExercise, updateExercise, uploadExerciseMedia, discardExerciseMedia, archiveExercise, toggleFavoriteExercise, createTeam, saveTeamLogo, refreshWorkspace, adminTeams, adminTeamsLoaded, renameTeam, deleteTeam, adminInviteMember, adminRevokeInvitation, adminSetMemberRole, adminRemoveMember, importPlayers, removePlayer, importFixtures, removeFixture, clearFixtures, saveMonthFocus, ensureWarmupRoutine, updateWarmupRoutine, addWarmupExercise, addCustomWarmupItem, updateWarmupItem, deleteWarmupItem, reorderWarmupItems, createSession, updateSession, deleteSession, publishSession, startWorkout, startWorkoutWithoutSetup, undoWorkoutStart, finishWorkout, addBlock, updateBlock, deleteBlock, reorderBlocks, addExerciseItem, addCustomItem, updateItem, deleteItem, reorderItems, reloadSession, setPlayerPresent, saveGrouping]);

  return <GrepContext.Provider value={value}>{children}</GrepContext.Provider>;
}

export function useGrep() {
  const context = useContext(GrepContext);
  if (!context) throw new Error("useGrep must be used inside AppProvider");
  return context;
}

export { demoProfiles };
