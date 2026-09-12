export interface PermanentDeletionInput {
  callerId: string;
  callerIsGlobalAdmin: boolean;
  targetId: string;
  targetEmail: string | null | undefined;
  targetIsGlobalAdmin: boolean;
  confirmationEmail: string;
}

export interface DeletionRefusal { status: number; message: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAuthUserId(value: string) { return UUID.test(value); }

/** Server-side guard for the irreversible global-admin account action. */
export function permanentDeletionRefusal(input: PermanentDeletionInput): DeletionRefusal | null {
  if (!input.callerIsGlobalAdmin) return { status: 403, message: "Bare en systemadministrator kan slette en konto permanent." };
  if (!isAuthUserId(input.targetId)) return { status: 400, message: "Brukerkontoen mangler eller er ugyldig." };
  if (input.targetId === input.callerId) return { status: 409, message: "Du kan ikke slette din egen systemadministratorkonto." };
  if (input.targetIsGlobalAdmin) return { status: 409, message: "En systemadministrator kan ikke slettes permanent." };
  if (!input.targetEmail) return { status: 404, message: "Brukerkontoen finnes ikke." };
  if (input.confirmationEmail.trim().toLowerCase() !== input.targetEmail.trim().toLowerCase()) {
    return { status: 400, message: "E-postadressen stemmer ikke. Kontoen ble ikke slettet." };
  }
  return null;
}

export function permanentDeletionError(message: string) {
  if (/storage|object|owner/i.test(message)) {
    return "Kontoen eier filer i Supabase Storage. Flytt eller fjern filene før kontoen slettes permanent.";
  }
  return "Kontoen kunne ikke slettes permanent.";
}
