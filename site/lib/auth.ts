export const MIN_PASSWORD_LENGTH = 10;

/** Returns a message describing why the password is unusable, or null when it is fine. */
export function passwordProblem(password: string, confirmation: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.trim().length === 0) return "Use at least one non-space character.";
  if (password !== confirmation) return "The two passwords do not match.";
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

/** Only a same-origin path is a safe post-auth redirect target. */
export function internalPath(value: string | null | undefined, fallback = "/sessions"): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

/** The link an admin sends to a coach so they can join a team once signed in. */
export function invitationUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/invite/${token}`;
}
