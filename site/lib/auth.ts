import type { Profile, TeamInvitation } from "./types";

export const MIN_PASSWORD_LENGTH = 10;

/** Returns a message describing why the password is unusable, or null when it is fine. */
export function passwordProblem(password: string, confirmation: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Bruk minst ${MIN_PASSWORD_LENGTH} tegn.`;
  if (password.trim().length === 0) return "Bruk minst ett tegn som ikke er et mellomrom.";
  if (password !== confirmation) return "Passordene er ikke like.";
  return null;
}

/**
 * Whether an auth event changes *who* is signed in. Refetching on the others is
 * not just wasted work: `updateUser` emits USER_UPDATED, and a reload racing the
 * write that clears `must_set_password` reads the old value and puts a coach back
 * on the password screen they just completed.
 */
export function isIdentityChange(event: string): boolean {
  return event !== "TOKEN_REFRESHED" && event !== "USER_UPDATED";
}

/**
 * The identity to hold while `loadPrivateData` is in flight.
 *
 * An auth event only carries the Supabase auth user, which knows nothing about
 * `profiles` — so the placeholder built from it has no `mustSetPassword`. Those
 * events fire repeatedly for one signed-in coach (`getUser` and
 * `INITIAL_SESSION` both on load, `SIGNED_IN` again whenever the tab is
 * refocused), and overwriting the loaded profile each time blanks the flag back
 * to "unknown", which reads as "no password change needed" and lets a coach
 * walk straight past the forced screen. Keep what is already loaded for the
 * same id; only a different coach replaces it.
 */
export function seedProfile(current: Profile | null, next: Profile | null): Profile | null {
  return next && current && current.id === next.id ? current : next;
}

/**
 * The team to show after a workspace load.
 *
 * `loadPrivateData` runs again on every SIGNED_IN, which Supabase re-emits each
 * time the tab is refocused — so picking the first team unconditionally threw a
 * coach back to their first team whenever they switched browser tabs. Keep the
 * selection they made as long as it is still a team they are on.
 *
 * A page reload has no selection to keep: the provider starts from a
 * placeholder, so the same fallback sent the coach back to their first team on
 * every refresh. `remembered` is the id the team switcher persisted, and is
 * tried next; the first team wins only when neither is a team they are on.
 */
export function keepSelectedTeamId(current: string | null, teamIds: readonly string[], remembered: string | null = null): string | null {
  if (current && teamIds.includes(current)) return current;
  if (remembered && teamIds.includes(remembered)) return remembered;
  return teamIds[0] ?? current;
}

/** Only a same-origin path is a safe post-auth redirect target. */
export function internalPath(value: string | null | undefined, fallback = "/sessions"): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

/** The link an admin sends to a coach so they can join a team once signed in. */
export function invitationUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/invite/${token}`;
}

/** An invitation whose token this coach can read, and so can accept unaided. */
export type ClaimableInvitation = TeamInvitation & { token: string };

/**
 * The invitations waiting for this coach that they can accept without ever
 * holding the /invite link.
 *
 * `invitations_read` already lets a signed-in user select the rows addressed to
 * their own email — token included — so an account created from the Supabase
 * dashboard is enough on its own to get onto a team. Rows for teams they are
 * already on are skipped so an admin never re-accepts their own pending
 * invitations, and expired ones are dropped here rather than sent to
 * `accept_team_invitation` only to come back as an error notice.
 */
export function claimableInvitations(
  email: string | null | undefined,
  memberTeamIds: readonly string[],
  invitations: readonly TeamInvitation[],
  now: Date = new Date(),
): ClaimableInvitation[] {
  const address = email?.trim().toLowerCase();
  if (!address) return [];
  const joined = new Set(memberTeamIds);
  return invitations.filter((invitation): invitation is ClaimableInvitation =>
    invitation.token !== null &&
    invitation.acceptedAt === null &&
    !joined.has(invitation.teamId) &&
    invitation.email.trim().toLowerCase() === address &&
    new Date(invitation.expiresAt).getTime() > now.getTime());
}
