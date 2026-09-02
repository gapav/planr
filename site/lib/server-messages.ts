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
  return serverMessageTranslations[message] ?? (norwegianServerMessages.has(message) || /[æøå]/i.test(message) ? message : fallback);
}

// True for both the English and the Norwegian wording of the single-use check
// in `accept_team_invitation`, which is the signal that the coach is already on
// the team rather than that something went wrong.
export function isInvitationAlreadyUsed(message: string) {
  return norwegianServerMessage(message, "") === serverMessageTranslations["Invitation has already been used"];
}
