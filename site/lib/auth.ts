import type { Profile } from "./types";

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

/** Only a same-origin path is a safe post-auth redirect target. */
export function internalPath(value: string | null | undefined, fallback = "/sessions"): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

/** The link an admin sends to a coach so they can join a team once signed in. */
export function invitationUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/invite/${token}`;
}
