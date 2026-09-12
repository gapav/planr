import { createClient } from "@supabase/supabase-js";
import { isAuthUserId, permanentDeletionError, permanentDeletionRefusal } from "@/lib/account-lifecycle";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

const secretKey = process.env.SUPABASE_SECRET_KEY;

interface DeleteAccountRequest { profileId?: unknown; confirmationEmail?: unknown }

function bad(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function DELETE(request: Request) {
  if (!supabaseUrl || !supabasePublishableKey) return bad("Supabase er ikke satt opp for dette miljøet.", 503);
  if (!secretKey) return bad("SUPABASE_SECRET_KEY mangler, så kontoen kan ikke slettes.", 503);

  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return bad("Du må være logget inn.", 401);

  const asCaller = createClient(supabaseUrl, supabasePublishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: caller, error: callerError } = await asCaller.auth.getUser(accessToken);
  if (callerError || !caller.user) return bad("Innloggingen din har utløpt. Logg inn på nytt.", 401);

  const body = await request.json().catch((): DeleteAccountRequest => ({}));
  const targetId = typeof body.profileId === "string" ? body.profileId : "";
  const confirmationEmail = typeof body.confirmationEmail === "string" ? body.confirmationEmail : "";

  const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: callerProfile } = await asCaller.from("profiles").select("is_global_admin").eq("id", caller.user.id).single();
  if (callerProfile?.is_global_admin !== true) return bad("Bare en systemadministrator kan slette en konto permanent.", 403);
  if (!isAuthUserId(targetId)) return bad("Brukerkontoen mangler eller er ugyldig.", 400);

  const [targetResult, targetProfileResult, accountDirectoryResult] = await Promise.all([
    admin.auth.admin.getUserById(targetId),
    admin.from("profiles").select("is_global_admin").eq("id", targetId).maybeSingle(),
    asCaller.rpc("admin_list_accounts"),
  ]);

  const refusal = permanentDeletionRefusal({
    callerId: caller.user.id,
    callerIsGlobalAdmin: callerProfile?.is_global_admin === true,
    targetId,
    targetEmail: targetResult.data.user?.email,
    targetIsGlobalAdmin: targetProfileResult.data?.is_global_admin === true,
    confirmationEmail,
  });
  if (refusal) return bad(refusal.message, refusal.status);

  const directory = Array.isArray(accountDirectoryResult.data) ? accountDirectoryResult.data as Array<{ id?: unknown; files_owned?: unknown }> : [];
  const filesOwned = Number(directory.find((account) => account.id === targetId)?.files_owned ?? 0);
  if (filesOwned > 0) {
    return bad("Kontoen eier filer i Supabase Storage. Flytt eller fjern filene før kontoen slettes permanent.", 409);
  }

  const { error } = await admin.auth.admin.deleteUser(targetId, false);
  if (error) return bad(permanentDeletionError(error.message), 409);

  return Response.json({ deletedId: targetId });
}
