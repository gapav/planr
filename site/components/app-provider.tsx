"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { demoExercises, demoProfiles, demoSessions, demoTeams, demoUser } from "@/lib/demo-data";
import { parseExerciseMedia } from "@/lib/media";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Exercise, PlannedSession, Profile, SaveState, SessionBlock, SessionItem, Team, TeamInvitation, TeamRole } from "@/lib/types";
import { initials, makeId } from "@/lib/utils";

type SessionPatch = Partial<Pick<PlannedSession, "title" | "startsAt" | "venue" | "plannedDurationMinutes" | "objective" | "notes">>;
type ItemPatch = Partial<Pick<SessionItem, "title" | "description" | "durationMinutes" | "coachingNotes">>;

interface PlannrContextValue {
  user: Profile | null;
  authLoading: boolean;
  isDemoMode: boolean;
  teams: Team[];
  currentTeam: Team | null;
  exercises: Exercise[];
  sessions: PlannedSession[];
  invitations: TeamInvitation[];
  saveState: SaveState;
  notice: string | null;
  setCurrentTeamId(id: string): void;
  clearNotice(): void;
  signIn(email: string, next?: string): Promise<void>;
  signOut(): Promise<void>;
  addExercise(input: Pick<Exercise, "name" | "description" | "mediaUrl">): Promise<void>;
  updateExercise(id: string, input: Pick<Exercise, "name" | "description" | "mediaUrl">): Promise<void>;
  archiveExercise(id: string): Promise<void>;
  createTeam(name: string): Promise<string>;
  inviteMember(email: string, role: TeamRole): Promise<void>;
  resendInvitation(invitation: TeamInvitation): Promise<void>;
  revokeInvitation(id: string): Promise<void>;
  updateMemberRole(profileId: string, role: TeamRole): Promise<void>;
  removeMember(profileId: string): Promise<void>;
  createSession(): Promise<string>;
  updateSession(id: string, patch: SessionPatch): Promise<void>;
  deleteSession(id: string): Promise<void>;
  publishSession(id: string): Promise<void>;
  addBlock(sessionId: string, title: string): Promise<string>;
  updateBlock(sessionId: string, blockId: string, title: string): Promise<void>;
  deleteBlock(sessionId: string, blockId: string): Promise<void>;
  reorderBlocks(sessionId: string, orderedIds: string[]): Promise<void>;
  addExerciseItem(sessionId: string, blockId: string, exercise: Exercise): Promise<void>;
  addCustomItem(sessionId: string, blockId: string): Promise<void>;
  updateItem(sessionId: string, blockId: string, itemId: string, patch: ItemPatch): Promise<void>;
  deleteItem(sessionId: string, blockId: string, itemId: string): Promise<void>;
  reorderItems(sessionId: string, blockId: string, orderedIds: string[]): Promise<void>;
  reloadSession(id: string): Promise<void>;
}

const PlannrContext = createContext<PlannrContextValue | null>(null);

interface DbExercise {
  id: string; name: string; description: string; media_url: string; media_kind: Exercise["mediaKind"];
  thumbnail_url: string | null; created_by: string; archived_at: string | null; created_at: string; updated_at: string;
  profiles?: { full_name?: string | null } | null;
}
interface DbItem {
  id: string; block_id: string; kind: SessionItem["kind"]; exercise_id: string | null; title: string; description: string;
  media_url: string | null; thumbnail_url: string | null; duration_minutes: number; coaching_notes: string; position: number; updated_by: string;
}
interface DbBlock { id: string; session_id: string; title: string; position: number; updated_by: string; session_items?: DbItem[]; }
interface DbSession {
  id: string; team_id: string; title: string; starts_at: string | null; venue: string; planned_duration_minutes: number;
  objective: string; notes: string; status: PlannedSession["status"]; created_by: string; updated_by: string;
  created_at: string; updated_at: string; session_blocks?: DbBlock[];
}

function mapExercise(row: DbExercise): Exercise {
  return { id: row.id, name: row.name, description: row.description, mediaUrl: row.media_url, mediaKind: row.media_kind,
    thumbnailUrl: row.thumbnail_url, createdBy: row.created_by, createdByName: row.profiles?.full_name ?? "Community coach",
    archivedAt: row.archived_at, createdAt: row.created_at, updatedAt: row.updated_at };
}
function mapSession(row: DbSession): PlannedSession {
  return { id: row.id, teamId: row.team_id, title: row.title, startsAt: row.starts_at, venue: row.venue,
    plannedDurationMinutes: row.planned_duration_minutes, objective: row.objective, notes: row.notes, status: row.status,
    createdBy: row.created_by, updatedBy: row.updated_by, createdAt: row.created_at, updatedAt: row.updated_at,
    blocks: (row.session_blocks ?? []).sort((a, b) => a.position - b.position).map((block) => ({
      id: block.id, sessionId: block.session_id, title: block.title, position: block.position, updatedBy: block.updated_by,
      items: (block.session_items ?? []).sort((a, b) => a.position - b.position).map((item) => ({
        id: item.id, blockId: item.block_id, kind: item.kind, exerciseId: item.exercise_id, title: item.title,
        description: item.description, mediaUrl: item.media_url, thumbnailUrl: item.thumbnail_url,
        durationMinutes: item.duration_minutes, coachingNotes: item.coaching_notes, position: item.position, updatedBy: item.updated_by,
      })),
    })) };
}
function profileFromUser(user: User): Profile {
  const fullName = String(user.user_metadata.full_name ?? user.email?.split("@")[0] ?? "Coach");
  return { id: user.id, email: user.email ?? "", fullName, initials: initials(fullName), color: "#f0642e" };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Profile | null>(isSupabaseConfigured ? null : demoUser);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [teams, setTeams] = useState<Team[]>(() => isSupabaseConfigured ? [] : structuredClone(demoTeams));
  const [currentTeamId, setCurrentTeamId] = useState(demoTeams[0].id);
  const [exercises, setExercises] = useState<Exercise[]>(() => isSupabaseConfigured ? [] : structuredClone(demoExercises));
  const [sessions, setSessions] = useState<PlannedSession[]>(() => isSupabaseConfigured ? [] : structuredClone(demoSessions));
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [notice, setNotice] = useState<string | null>(null);
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const currentTeam = teams.find((team) => team.id === currentTeamId) ?? teams[0] ?? null;

  const loadPublicExercises = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("exercises").select("*, profiles:created_by(full_name)").is("archived_at", null).order("created_at", { ascending: false });
    if (!error && data) setExercises((data as unknown as DbExercise[]).map(mapExercise));
  }, [supabase]);

  const loadPrivateData = useCallback(async (authUser: User) => {
    if (!supabase) return;
    const [{ data: memberships }, { data: sessionRows }, { data: invitationRows }, { data: profileRow }] = await Promise.all([
      supabase.from("team_memberships").select("team_id, profile_id, role, teams(id, name), profiles(id, email, full_name, avatar_url)"),
      supabase.from("sessions").select("*, session_blocks(*, session_items(*))").order("updated_at", { ascending: false }),
      supabase.from("team_invitations").select("id, team_id, email, role, expires_at, accepted_at").is("accepted_at", null).gt("expires_at", new Date().toISOString()),
      supabase.from("profiles").select("id, email, full_name, is_global_admin").eq("id", authUser.id).single(),
    ]);
    if (profileRow) setUser({ id: profileRow.id, email: profileRow.email, fullName: profileRow.full_name, initials: initials(profileRow.full_name), color: "#f0642e", isGlobalAdmin: profileRow.is_global_admin });
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
    if (invitationRows) setInvitations((invitationRows as unknown as Array<{ id: string; team_id: string; email: string; role: TeamRole; expires_at: string; accepted_at: string | null }>).map((row) => ({ id: row.id, teamId: row.team_id, email: row.email, role: row.role, expiresAt: row.expires_at, acceptedAt: row.accepted_at })));
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    const loadTimer = window.setTimeout(() => void loadPublicExercises(), 0);
    void supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ? profileFromUser(data.user) : null);
      if (data.user) void loadPrivateData(data.user);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? profileFromUser(session.user) : null);
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
    if (error) { setSaveState("error"); setNotice(error.message); throw new Error(error.message); }
    setSaveState("saved");
  }, []);

  const signIn = useCallback(async (email: string, next = "/sessions") => {
    if (!supabase) { setUser(demoUser); setNotice("Preview mode is active — no email was sent."); return; }
    const emailRedirectTo = `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } });
    if (error) throw error;
    setNotice("Check your email for a secure sign-in link.");
  }, [supabase]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setUser(supabase ? null : demoUser);
  }, [supabase]);

  const addExercise = useCallback(async (input: Pick<Exercise, "name" | "description" | "mediaUrl">) => {
    if (!user) throw new Error("Sign in to add an exercise");
    const media = parseExerciseMedia(input.mediaUrl); const now = new Date().toISOString(); const id = makeId("exercise");
    const exercise: Exercise = { id, ...input, mediaKind: media.kind, thumbnailUrl: media.thumbnailUrl, createdBy: user.id, createdByName: user.fullName, archivedAt: null, createdAt: now, updatedAt: now };
    setExercises((current) => [exercise, ...current]);
    await persist(supabase ? () => supabase.from("exercises").insert({ id, name: input.name, description: input.description, media_url: input.mediaUrl, media_kind: media.kind, thumbnail_url: media.thumbnailUrl, created_by: user.id }) : null);
  }, [persist, supabase, user]);

  const updateExercise = useCallback(async (id: string, input: Pick<Exercise, "name" | "description" | "mediaUrl">) => {
    const media = parseExerciseMedia(input.mediaUrl); const updatedAt = new Date().toISOString();
    setExercises((current) => current.map((exercise) => exercise.id === id ? { ...exercise, ...input, mediaKind: media.kind, thumbnailUrl: media.thumbnailUrl, updatedAt } : exercise));
    await persist(supabase ? () => supabase.from("exercises").update({ name: input.name, description: input.description, media_url: input.mediaUrl, media_kind: media.kind, thumbnail_url: media.thumbnailUrl }).eq("id", id) : null);
  }, [persist, supabase]);

  const archiveExercise = useCallback(async (id: string) => {
    const archivedAt = new Date().toISOString(); setExercises((current) => current.filter((exercise) => exercise.id !== id));
    await persist(supabase ? () => supabase.from("exercises").update({ archived_at: archivedAt }).eq("id", id) : null);
  }, [persist, supabase]);

  const createTeam = useCallback(async (name: string) => {
    if (!user) throw new Error("Sign in to create a team");
    if (supabase) {
      const { data, error } = await supabase.rpc("create_team", { team_name: name });
      if (error) throw error; await loadPrivateData({ id: user.id, email: user.email, user_metadata: { full_name: user.fullName } } as unknown as User);
      return String(data);
    }
    const id = makeId("team"); setTeams((current) => [...current, { id, name, shortName: name, role: "admin", members: [user] }]); setCurrentTeamId(id); return id;
  }, [loadPrivateData, supabase, user]);

  const inviteMember = useCallback(async (email: string, role: TeamRole) => {
    if (!currentTeam || !user) return; const id = crypto.randomUUID(); const token = crypto.randomUUID(); const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    setInvitations((current) => [...current, { id, teamId: currentTeam.id, email: email.toLowerCase(), role, expiresAt, acceptedAt: null }]);
    if (supabase) {
      await persist(() => supabase.from("team_invitations").insert({ id, token, team_id: currentTeam.id, email: email.toLowerCase(), role, invited_by: user.id, expires_at: expiresAt }));
      const emailRedirectTo = `${window.location.origin}/auth/confirm?next=${encodeURIComponent(`/invite/${token}`)}`;
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } }); if (error) throw error;
    } else {
      setNotice(`Preview invite prepared for ${email}.`);
    }
  }, [currentTeam, persist, supabase, user]);

  const resendInvitation = useCallback(async (invitation: TeamInvitation) => {
    if (!supabase) { setNotice(`Preview invite resent to ${invitation.email}.`); return; }
    const { data, error } = await supabase.from("team_invitations").select("token").eq("id", invitation.id).single();
    if (error) throw error;
    const emailRedirectTo = `${window.location.origin}/auth/confirm?next=${encodeURIComponent(`/invite/${data.token}`)}`;
    const result = await supabase.auth.signInWithOtp({ email: invitation.email, options: { emailRedirectTo } });
    if (result.error) throw result.error;
    setNotice(`Invitation resent to ${invitation.email}.`);
  }, [supabase]);

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

  const createSession = useCallback(async () => {
    if (!currentTeam || !user) throw new Error("Choose a team first"); const id = makeId("session"); const now = new Date().toISOString();
    const session: PlannedSession = { id, teamId: currentTeam.id, title: "Untitled session", startsAt: null, venue: "", plannedDurationMinutes: 90, objective: "", notes: "", status: "draft", blocks: [], createdBy: user.id, updatedBy: user.id, createdAt: now, updatedAt: now };
    setSessions((current) => [session, ...current]);
    await persist(supabase ? () => supabase.from("sessions").insert({ id, team_id: currentTeam.id, title: session.title, planned_duration_minutes: 90, created_by: user.id, updated_by: user.id }) : null);
    return id;
  }, [currentTeam, persist, supabase, user]);

  const updateSession = useCallback(async (id: string, patch: SessionPatch) => {
    const now = new Date().toISOString(); setSessions((current) => current.map((session) => session.id === id ? { ...session, ...patch, updatedBy: user?.id ?? session.updatedBy, updatedAt: now } : session));
    const row = { ...(patch.title !== undefined && { title: patch.title }), ...(patch.startsAt !== undefined && { starts_at: patch.startsAt }), ...(patch.venue !== undefined && { venue: patch.venue }), ...(patch.plannedDurationMinutes !== undefined && { planned_duration_minutes: patch.plannedDurationMinutes }), ...(patch.objective !== undefined && { objective: patch.objective }), ...(patch.notes !== undefined && { notes: patch.notes }), updated_by: user?.id };
    await persist(supabase ? () => supabase.from("sessions").update(row).eq("id", id) : null);
  }, [persist, supabase, user]);

  const deleteSession = useCallback(async (id: string) => { setSessions((current) => current.filter((session) => session.id !== id)); await persist(supabase ? () => supabase.from("sessions").delete().eq("id", id) : null); }, [persist, supabase]);
  const publishSession = useCallback(async (id: string) => { setSessions((current) => current.map((session) => session.id === id ? { ...session, status: "published", updatedAt: new Date().toISOString() } : session)); await persist(supabase ? () => supabase.rpc("publish_session", { target_session_id: id }) : null); }, [persist, supabase]);

  const addBlock = useCallback(async (sessionId: string, title: string) => {
    const id = makeId("block"); const session = sessions.find((entry) => entry.id === sessionId); const position = session?.blocks.length ?? 0;
    const block: SessionBlock = { id, sessionId, title, position, items: [], updatedBy: user?.id ?? demoUser.id };
    setSessions((current) => current.map((entry) => entry.id === sessionId ? { ...entry, blocks: [...entry.blocks, block] } : entry));
    await persist(supabase ? () => supabase.from("session_blocks").insert({ id, session_id: sessionId, title, position, updated_by: user?.id }) : null); return id;
  }, [persist, sessions, supabase, user]);

  const updateBlock = useCallback(async (sessionId: string, blockId: string, title: string) => { setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, blocks: session.blocks.map((block) => block.id === blockId ? { ...block, title, updatedBy: user?.id ?? block.updatedBy } : block) } : session)); await persist(supabase ? () => supabase.from("session_blocks").update({ title, updated_by: user?.id }).eq("id", blockId) : null); }, [persist, supabase, user]);
  const deleteBlock = useCallback(async (sessionId: string, blockId: string) => { setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, blocks: session.blocks.filter((block) => block.id !== blockId).map((block, position) => ({ ...block, position })) } : session)); await persist(supabase ? () => supabase.from("session_blocks").delete().eq("id", blockId) : null); }, [persist, supabase]);
  const reorderBlocks = useCallback(async (sessionId: string, orderedIds: string[]) => { setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, blocks: orderedIds.flatMap((id, position) => { const block = session.blocks.find((entry) => entry.id === id); return block ? [{ ...block, position }] : []; }) } : session)); await persist(supabase ? () => supabase.rpc("reorder_session_blocks", { target_session_id: sessionId, ordered_block_ids: orderedIds }) : null); }, [persist, supabase]);

  const addExerciseItem = useCallback(async (sessionId: string, blockId: string, exercise: Exercise) => {
    const id = makeId("item"); const block = sessions.find((session) => session.id === sessionId)?.blocks.find((entry) => entry.id === blockId); const position = block?.items.length ?? 0;
    const item: SessionItem = { id, blockId, kind: "exercise", exerciseId: exercise.id, title: exercise.name, description: exercise.description, mediaUrl: exercise.mediaUrl, thumbnailUrl: exercise.thumbnailUrl, durationMinutes: 10, coachingNotes: "", position, updatedBy: user?.id ?? demoUser.id };
    setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, blocks: session.blocks.map((entry) => entry.id === blockId ? { ...entry, items: [...entry.items, item] } : entry) } : session));
    await persist(supabase ? () => supabase.from("session_items").insert({ id, block_id: blockId, kind: item.kind, exercise_id: exercise.id, title: item.title, description: item.description, media_url: item.mediaUrl, thumbnail_url: item.thumbnailUrl, duration_minutes: 10, position, updated_by: user?.id }) : null);
  }, [persist, sessions, supabase, user]);

  const addCustomItem = useCallback(async (sessionId: string, blockId: string) => {
    const id = makeId("item"); const block = sessions.find((session) => session.id === sessionId)?.blocks.find((entry) => entry.id === blockId); const position = block?.items.length ?? 0;
    const item: SessionItem = { id, blockId, kind: "custom", exerciseId: null, title: "New activity", description: "", mediaUrl: null, thumbnailUrl: null, durationMinutes: 10, coachingNotes: "", position, updatedBy: user?.id ?? demoUser.id };
    setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, blocks: session.blocks.map((entry) => entry.id === blockId ? { ...entry, items: [...entry.items, item] } : entry) } : session));
    await persist(supabase ? () => supabase.from("session_items").insert({ id, block_id: blockId, kind: "custom", title: item.title, duration_minutes: 10, position, updated_by: user?.id }) : null);
  }, [persist, sessions, supabase, user]);

  const updateItem = useCallback(async (sessionId: string, blockId: string, itemId: string, patch: ItemPatch) => { setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, blocks: session.blocks.map((block) => block.id === blockId ? { ...block, items: block.items.map((item) => item.id === itemId ? { ...item, ...patch, updatedBy: user?.id ?? item.updatedBy } : item) } : block) } : session)); const row = { ...(patch.title !== undefined && { title: patch.title }), ...(patch.description !== undefined && { description: patch.description }), ...(patch.durationMinutes !== undefined && { duration_minutes: patch.durationMinutes }), ...(patch.coachingNotes !== undefined && { coaching_notes: patch.coachingNotes }), updated_by: user?.id }; await persist(supabase ? () => supabase.from("session_items").update(row).eq("id", itemId) : null); }, [persist, supabase, user]);
  const deleteItem = useCallback(async (sessionId: string, blockId: string, itemId: string) => { setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, blocks: session.blocks.map((block) => block.id === blockId ? { ...block, items: block.items.filter((item) => item.id !== itemId).map((item, position) => ({ ...item, position })) } : block) } : session)); await persist(supabase ? () => supabase.from("session_items").delete().eq("id", itemId) : null); }, [persist, supabase]);
  const reorderItems = useCallback(async (sessionId: string, blockId: string, orderedIds: string[]) => { setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, blocks: session.blocks.map((block) => block.id === blockId ? { ...block, items: orderedIds.flatMap((id, position) => { const item = block.items.find((entry) => entry.id === id); return item ? [{ ...item, position }] : []; }) } : block) } : session)); await persist(supabase ? () => supabase.rpc("reorder_block_items", { target_block_id: blockId, ordered_item_ids: orderedIds }) : null); }, [persist, supabase]);

  const reloadSession = useCallback(async (id: string) => { if (!supabase) return; const { data } = await supabase.from("sessions").select("*, session_blocks(*, session_items(*))").eq("id", id).single(); if (data) setSessions((current) => current.map((session) => session.id === id ? mapSession(data as unknown as DbSession) : session)); }, [supabase]);

  const value = useMemo<PlannrContextValue>(() => ({ user, authLoading, isDemoMode: !supabase, teams, currentTeam, exercises, sessions, invitations, saveState, notice, setCurrentTeamId, clearNotice: () => setNotice(null), signIn, signOut, addExercise, updateExercise, archiveExercise, createTeam, inviteMember, resendInvitation, revokeInvitation, updateMemberRole, removeMember, createSession, updateSession, deleteSession, publishSession, addBlock, updateBlock, deleteBlock, reorderBlocks, addExerciseItem, addCustomItem, updateItem, deleteItem, reorderItems, reloadSession }), [user, authLoading, supabase, teams, currentTeam, exercises, sessions, invitations, saveState, notice, signIn, signOut, addExercise, updateExercise, archiveExercise, createTeam, inviteMember, resendInvitation, revokeInvitation, updateMemberRole, removeMember, createSession, updateSession, deleteSession, publishSession, addBlock, updateBlock, deleteBlock, reorderBlocks, addExerciseItem, addCustomItem, updateItem, deleteItem, reorderItems, reloadSession]);

  return <PlannrContext.Provider value={value}>{children}</PlannrContext.Provider>;
}

export function usePlannr() {
  const context = useContext(PlannrContext);
  if (!context) throw new Error("usePlannr must be used inside AppProvider");
  return context;
}

export { demoProfiles };
