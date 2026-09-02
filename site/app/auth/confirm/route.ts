import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const flowId = searchParams.get("sb_flow_id");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next")?.startsWith("/") ? searchParams.get("next")! : "/sessions";
  const supabase = await getSupabaseServerClient();

  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );
    if (!error) redirect(`${origin}${next}`);
  }

  if (tokenHash && type && supabase) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) redirect(`${origin}${next}`);
  }
  redirect(`${origin}/sign-in?error=invalid-link`);
}
