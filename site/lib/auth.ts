export const MIN_PASSWORD_LENGTH = 10;

/** Returns a message describing why the password is unusable, or null when it is fine. */
export function passwordProblem(password: string, confirmation: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.trim().length === 0) return "Use at least one non-space character.";
  if (password !== confirmation) return "The two passwords do not match.";
  return null;
}

/** The link an admin sends to a coach so they can join a team once signed in. */
export function invitationUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/invite/${token}`;
}
