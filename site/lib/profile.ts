/**
 * The coach's screen name.
 *
 * A profile starts life with `full_name` derived from the email local part —
 * `split_part(email, '@', 1)` in `handle_new_user` — because an account is
 * created from the dashboard before anybody has asked its owner what to call
 * them. That placeholder is what every avatar, byline and morning letter shows,
 * so the coach needs to be able to replace it. Email stays the login; this is
 * only the name on screen.
 *
 * The rules here are mirrored by a check constraint in migration
 * `202609130003`, so a name the form accepts is one the database accepts.
 */
export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 60;

/** Trims the ends and collapses inner runs of whitespace to single spaces. */
export function normalizeDisplayName(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

/** The Norwegian refusal for a name that cannot be saved, or `null` if it can. */
export function displayNameError(input: string): string | null {
  const name = normalizeDisplayName(input);
  if (name.length < DISPLAY_NAME_MIN_LENGTH) return "Visningsnavnet må ha minst to tegn.";
  if (name.length > DISPLAY_NAME_MAX_LENGTH) return `Visningsnavnet kan ha høyst ${DISPLAY_NAME_MAX_LENGTH} tegn.`;
  return null;
}
