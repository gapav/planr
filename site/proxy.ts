import { NextResponse } from "next/server";

/**
 * The browser is the only owner of the Supabase auth cookie.
 *
 * This used to run `supabase.auth.getClaims()` on every request so Server
 * Components would see a fresh session. Nothing on the server reads the session
 * — `lib/supabase/server.ts` has no callers, there are no server actions and the
 * App Router routes are shells around client components — so all it did was add
 * a *second* refresher for one rotating refresh token. Next.js fires several
 * proxy invocations at once (RSC navigations plus `<Link>` prefetches), each
 * with its own server client, so an expired token had several of them racing to
 * redeem the same refresh token. The losers get "Invalid Refresh Token: Already
 * Used", and @supabase/ssr answers that by clearing the auth cookies — silently
 * signing out a browser whose session was fine. The tab never hears about it
 * (the deletion happens server-side, so no SIGNED_OUT event fires), which is why
 * it surfaced as a signed-in-looking page whose next write failed with
 * "Auth session missing!".
 *
 * Leave refreshing to the browser client, which serialises it behind a lock and
 * has the reuse-interval grace period. If server-side session reads are ever
 * added, restore the refresh here and give the server a way to be the single
 * writer instead.
 */
export function proxy() {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
