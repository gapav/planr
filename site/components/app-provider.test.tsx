import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProvider, useGrep } from "./app-provider";

// The provider is otherwise tested through the pure helpers it calls; this
// covers only the `exercisesLoaded` latch (decision 9), which lives in its
// load sequence and nowhere else.
const mocks = vi.hoisted(() => ({ configured: false, client: null as unknown }));
vi.mock("@/lib/supabase/config", () => ({ get isSupabaseConfigured() { return mocks.configured; }, supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "key" }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => mocks.client }));
// No real waiting between retries of a failed workspace load.
vi.mock("@/lib/auth", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/auth")>(), WORKSPACE_RETRY_DELAYS_MS: [0, 0] }));

type Result = { data: unknown; error: unknown };
const refused: Result = { data: null, error: { message: "nope" } };

/** A query builder whose every method chains and which resolves to `result`. */
function query(result: () => Promise<Result>): unknown {
  const target = () => undefined;
  return new Proxy(target, {
    get: (_target, prop) => prop === "then" ? (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => result().then(resolve, reject) : () => query(result),
  });
}

function fakeClient(user: { id: string; email: string } | null, exercises: () => Promise<Result>) {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: user && { ...user, user_metadata: {}, app_metadata: {} } }, error: null }),
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
    from: (table: string) => query(table === "exercises" ? exercises : () => Promise.resolve(refused)),
    rpc: () => query(() => Promise.resolve(refused)),
    storage: { from: () => query(() => Promise.resolve(refused)) },
  };
}

function Probe() {
  const { exercisesLoaded } = useGrep();
  return <p data-testid="probe">{String(exercisesLoaded)}</p>;
}
const probe = () => screen.getByTestId("probe").textContent;

describe("exercisesLoaded", () => {
  afterEach(() => { mocks.configured = false; mocks.client = null; });

  it("starts true in demo mode", () => {
    render(<AppProvider><Probe /></AppProvider>);
    expect(probe()).toBe("true");
  });

  it("settles true for a signed-out visitor", async () => {
    mocks.configured = true;
    mocks.client = fakeClient(null, () => Promise.resolve({ data: [], error: null }));
    render(<AppProvider><Probe /></AppProvider>);
    expect(probe()).toBe("false");
    await waitFor(() => expect(probe()).toBe("true"));
  });

  it("waits for the first fetch, and settles true when it fails", async () => {
    let fail: (reason: unknown) => void = () => undefined;
    mocks.configured = true;
    mocks.client = fakeClient({ id: "coach-1", email: "coach@example.com" }, () => new Promise<Result>((_resolve, reject) => { fail = reject; }));
    render(<AppProvider><Probe /></AppProvider>);
    // Let the auth check resolve and the exercise fetch start.
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(probe()).toBe("false");
    await act(async () => { fail(new TypeError("Failed to fetch")); });
    await waitFor(() => expect(probe()).toBe("true"));
  });

  it("settles true when the fetch answers with an error", async () => {
    mocks.configured = true;
    mocks.client = fakeClient({ id: "coach-1", email: "coach@example.com" }, () => Promise.resolve(refused));
    render(<AppProvider><Probe /></AppProvider>);
    await waitFor(() => expect(probe()).toBe("true"));
  });
});

describe("workspace load", () => {
  afterEach(() => { mocks.configured = false; mocks.client = null; });

  const coach = { id: "coach-1", email: "coach@example.com" };
  const sessionRow = { id: "session-1", team_id: "team-1", title: "Tirsdagstrening", status: "published", scheduled_for: "2026-11-20", session_blocks: [], created_by: "coach-1", updated_by: "coach-1", created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z" };

  /** A signed-in coach whose profile always reads; `sessions` answers from the given sequence, the rest with no rows. */
  function clientWithSessions(sessionAnswers: Result[]) {
    let sessionCalls = 0;
    const client = fakeClient(coach, () => Promise.resolve({ data: [], error: null }));
    return {
      ...client,
      from: (table: string) => query(() => {
        if (table === "profiles") return Promise.resolve({ data: { id: coach.id, email: coach.email, full_name: "Coach One", is_global_admin: false, session_digest_email: true }, error: null });
        if (table === "team_memberships") return Promise.resolve({ data: [{ team_id: "team-1", profile_id: coach.id, role: "admin", teams: { id: "team-1", name: "Kolbotn - B2020", logo_url: null }, profiles: { id: coach.id, email: coach.email, full_name: "Coach One", avatar_url: null } }], error: null });
        if (table === "sessions") { const answer = sessionAnswers[Math.min(sessionCalls, sessionAnswers.length - 1)]; sessionCalls += 1; return Promise.resolve(answer); }
        return Promise.resolve({ data: [], error: null });
      }),
      sessionCalls: () => sessionCalls,
    };
  }

  function WorkspaceProbe() {
    const { workspaceLoaded, sessions } = useGrep();
    return <p data-testid="workspace">{workspaceLoaded ? `loaded:${sessions.length}` : "loading"}</p>;
  }
  const workspace = () => screen.getByTestId("workspace").textContent;

  // The bug behind «Kommende (0)»: the sessions query alone failing (iOS
  // cutting a request off on suspend/resume) was taken as "no sessions".
  it("retries when only the sessions query fails, instead of settling on an empty calendar", async () => {
    const client = clientWithSessions([refused, { data: [sessionRow], error: null }]);
    mocks.configured = true;
    mocks.client = client;
    render(<AppProvider><WorkspaceProbe /></AppProvider>);
    await waitFor(() => expect(workspace()).toBe("loaded:1"));
    expect(client.sessionCalls()).toBe(2);
  });

  it("settles after the last retry when the sessions query keeps failing", async () => {
    const client = clientWithSessions([refused]);
    mocks.configured = true;
    mocks.client = client;
    render(<AppProvider><WorkspaceProbe /></AppProvider>);
    await waitFor(() => expect(workspace()).toBe("loaded:0"));
    expect(client.sessionCalls()).toBe(3);
  });
});

// Decision 12: starting a session is one call with no setup. Demo mode (no
// Supabase env) has to run the whole way through on its own.
describe("starting a workout", () => {
  afterEach(() => { mocks.configured = false; mocks.client = null; });

  function LifecycleProbe() {
    const { sessions, startWorkout, finishWorkout } = useGrep();
    const session = sessions.find((entry) => entry.id === "session-monday");
    return <>
      <p data-testid="status">{session?.status}</p>
      <button onClick={() => void startWorkout("session-monday")}>start</button>
      <button onClick={() => void finishWorkout("session-monday")}>finish</button>
    </>;
  }
  const status = () => screen.getByTestId("status").textContent;

  it("starts and finishes a published demo session", async () => {
    render(<AppProvider><LifecycleProbe /></AppProvider>);
    expect(status()).toBe("published");

    await act(async () => { screen.getByRole("button", { name: "start" }).click(); });
    await waitFor(() => expect(status()).toBe("in_progress"));

    await act(async () => { screen.getByRole("button", { name: "finish" }).click(); });
    await waitFor(() => expect(status()).toBe("completed"));
  });
});
