// Database functions raise user-facing text directly. Migration 202609020016
// translated those messages to Norwegian, but already-applied databases may
// still be on the English wording, so both spellings map to the same Norwegian
// string and callers must never match on the raw message.
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

export function norwegianServerMessage(message: string, fallback = "Handlingen kunne ikke fullføres.") {
  if (/our_team_colors/.test(message) && /column|schema cache/i.test(message)) return "Lagfarger trenger en databaseoppdatering. Be systemadministratoren bruke migrasjonen 202609130001 før du importerer.";
  // Migrations are applied by hand, so a feature can reach the browser before
  // its tables reach the database. Name the migration rather than let PostgREST
  // say "schema cache" to a coach.
  if (/exercise_collections?/.test(message) && /schema cache|does not exist/i.test(message)) return "Samlinger trenger en databaseoppdatering. Be systemadministratoren bruke migrasjonen 202609170001.";
  // The unique index folds case and trims, so two coaches naming the same
  // samling at the same moment is the only way past the check in the dialog.
  if (/exercise_collections_team_name_key/.test(message)) return "Laget har allerede en samling med dette navnet.";
  return serverMessageTranslations[message] ?? (norwegianServerMessages.has(message) || /[æøå]/i.test(message) ? message : fallback);
}

// True for both the English and the Norwegian wording of the single-use check
// in `accept_team_invitation`, which is the signal that the coach is already on
// the team rather than that something went wrong.
export function isInvitationAlreadyUsed(message: string) {
  return norwegianServerMessage(message, "") === serverMessageTranslations["Invitation has already been used"];
}

/**
 * True when the request never got an answer from PostgREST at all.
 *
 * postgrest-js turns a rejected `fetch` — the wifi dropped, the phone slept
 * mid-request, the tab was navigating away — into an ordinary error result:
 * `{ status: 0, error: { message: "TypeError: Failed to fetch", code: "" } }`,
 * shaped exactly like a refusal from the database. It is the one failure where
 * the row may well have been written and only the answer was lost, so calling
 * it "handlingen kunne ikke fullføres" is a false alarm — the coach watches the
 * change survive a refresh and learns to ignore every warning after it.
 */
export function isTransportFailure(result: { status?: number; error?: { message?: string } | null }): boolean {
  if (result.status === 0) return true;
  // The `${error.name ?? "FetchError"}: ${error.message}` postgrest-js builds
  // from the rejection; no message the database raises is shaped like it.
  return /^(?:TypeError|FetchError|AbortError|NetworkError|TimeoutError):/.test(result.error?.message ?? "");
}

/**
 * What to say about a lost answer: never "it failed", because it may not have.
 */
export const CONNECTION_LOST_MESSAGE = "Vi mistet forbindelsen mens endringen ble lagret. Den kan ha blitt lagret likevel — oppdater siden for å se hva som gjelder.";
