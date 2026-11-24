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

// «Foreslå alternativ» (decision 14): suggesting and dismissing are optimistic
// and roll back on a refusal; accepting changes the plan only once
// `accept_item_suggestion` has answered. Demo mode runs all three locally.
describe("suggestions", () => {
  afterEach(() => { mocks.configured = false; mocks.client = null; });

  const coach = { id: "coach-1", email: "coach@example.com" };
  const stamp = "2026-11-01T10:00:00Z";
  const exerciseRow = (id: string, name: string) => ({ id, name, description: `${name} beskrevet.`, category: "Angrep", age_groups: [], subtopics: [], media_url: `https://example.com/${id}.jpg`, media_kind: "image", thumbnail_url: `https://example.com/${id}-thumb.jpg`, created_by: "coach-2", archived_at: null, created_at: stamp, updated_at: stamp });
  const sessionRow = {
    id: "session-1", team_id: "team-1", title: "Tirsdagstrening", starts_at: "2026-11-25T17:00:00Z", venue: "", planned_duration_minutes: 60, objective: "", notes: "", status: "published", created_by: coach.id, updated_by: coach.id, created_at: stamp, updated_at: stamp,
    session_blocks: [{ id: "block-1", session_id: "session-1", title: "Hoveddel", notes: "", kind: "sequence", rotation_minutes: null, position: 0, updated_by: coach.id, session_items: [{
      id: "item-1", block_id: "block-1", kind: "exercise", exercise_id: "ex-1", title: "Første", description: "Første beskrevet.", media_url: null, thumbnail_url: null, duration_minutes: 12, coaching_notes: "Stikkord", assigned_coach_ids: [coach.id], position: 0, updated_by: coach.id,
      session_item_suggestions: [{ id: "s-1", item_id: "item-1", exercise_id: "ex-2", suggested_by: "coach-2", comment: "Bedre", created_at: stamp, updated_at: stamp, exercise: exerciseRow("ex-2", "Andre") }],
    }] }],
  };

  /** A signed-in coach on one plan with one suggestion; writes answer `write`, the accept RPC `accept`. */
  function clientWith(write: Result, accept: Result) {
    const calls: string[] = [];
    const client = fakeClient(coach, () => Promise.resolve({ data: [exerciseRow("ex-1", "Første"), exerciseRow("ex-2", "Andre"), exerciseRow("ex-3", "Tredje")], error: null }));
    return {
      ...client,
      calls,
      from: (table: string) => {
        if (table === "exercises") return client.from(table);
        return query(() => {
          if (table === "profiles") return Promise.resolve({ data: { id: coach.id, email: coach.email, full_name: "Coach One", is_global_admin: false, session_digest_email: true }, error: null });
          if (table === "team_memberships") return Promise.resolve({ data: [{ team_id: "team-1", profile_id: coach.id, role: "coach", teams: { id: "team-1", name: "Kolbotn - B2020", logo_url: null }, profiles: { id: coach.id, email: coach.email, full_name: "Coach One", avatar_url: null } }], error: null });
          if (table === "sessions") return Promise.resolve({ data: [sessionRow], error: null });
          if (table === "session_item_suggestions") { calls.push(table); return Promise.resolve(write); }
          return Promise.resolve({ data: [], error: null });
        });
      },
      rpc: (name: string) => query(() => { calls.push(name); return Promise.resolve(name === "accept_item_suggestion" ? accept : refused); }),
    };
  }

  function SuggestionProbe({ sessionId, itemId }: { sessionId: string; itemId: string }) {
    const { sessions, exercises, suggestAlternative, acceptSuggestion, dismissSuggestion } = useGrep();
    const item = sessions.find((session) => session.id === sessionId)?.blocks.flatMap((block) => block.items).find((entry) => entry.id === itemId);
    const exercise = exercises.find((entry) => entry.id !== item?.exerciseId && !item?.suggestions?.some((suggestion) => suggestion.exerciseId === entry.id));
    const first = item?.suggestions?.[0];
    return <>
      <p data-testid="item">{item ? `${item.exerciseId}|${item.title}|${item.durationMinutes}|${item.coachingNotes}` : "none"}</p>
      <p data-testid="suggestions">{(item?.suggestions ?? []).map((suggestion) => `${suggestion.exerciseId}:${suggestion.comment}`).join(",")}</p>
      <button onClick={() => exercise && void suggestAlternative(sessionId, itemId, exercise, "  Mindre kø  ").catch(() => undefined)}>suggest</button>
      <button onClick={() => first && void acceptSuggestion(sessionId, first.id).catch(() => undefined)}>accept</button>
      <button onClick={() => first && void dismissSuggestion(sessionId, first.id).catch(() => undefined)}>dismiss</button>
    </>;
  }
  const text = (id: string) => screen.getByTestId(id).textContent;
  const click = async (name: string) => { await act(async () => { screen.getByRole("button", { name }).click(); }); };

  it("suggests, swaps and dismisses on the demo plan with local state", async () => {
    render(<AppProvider><SuggestionProbe sessionId="session-friday" itemId="item-activation" /></AppProvider>);
    expect(text("suggestions")).toBe("exercise-6:Mindre kø, flere ballberøringer");
    // The demo user's first suggestion is added beside Nora's.
    await click("suggest");
    expect(text("suggestions")).toMatch(/^exercise-6:Mindre kø, flere ballberøringer,exercise-\d:Mindre kø$/);
    await click("accept");
    await waitFor(() => expect(text("item")).toMatch(/^exercise-6\|Tålmodig angrep 6 mot 5\|10\|/));
    expect(text("suggestions")).toMatch(/^exercise-\d:Mindre kø$/);
    await click("dismiss");
    expect(text("suggestions")).toBe("");
  });

  it("rolls a refused suggestion back", async () => {
    mocks.configured = true;
    mocks.client = clientWith(refused, refused);
    render(<AppProvider><SuggestionProbe sessionId="session-1" itemId="item-1" /></AppProvider>);
    await waitFor(() => expect(text("suggestions")).toBe("ex-2:Bedre"));
    await waitFor(() => expect(screen.getByRole("button", { name: "suggest" })).toBeInTheDocument());
    await click("suggest");
    await waitFor(() => expect((mocks.client as ReturnType<typeof clientWith>).calls).toContain("session_item_suggestions"));
    await waitFor(() => expect(text("suggestions")).toBe("ex-2:Bedre"));
  });

  it("rolls a refused dismissal back", async () => {
    mocks.configured = true;
    mocks.client = clientWith(refused, refused);
    render(<AppProvider><SuggestionProbe sessionId="session-1" itemId="item-1" /></AppProvider>);
    await waitFor(() => expect(text("suggestions")).toBe("ex-2:Bedre"));
    await click("dismiss");
    await waitFor(() => expect(text("suggestions")).toBe("ex-2:Bedre"));
  });

  it("keeps the plan as it was when the accept is refused, and swaps once it is answered", async () => {
    mocks.configured = true;
    mocks.client = clientWith({ data: null, error: null }, refused);
    const { unmount } = render(<AppProvider><SuggestionProbe sessionId="session-1" itemId="item-1" /></AppProvider>);
    await waitFor(() => expect(text("suggestions")).toBe("ex-2:Bedre"));
    await click("accept");
    await waitFor(() => expect((mocks.client as ReturnType<typeof clientWith>).calls).toContain("accept_item_suggestion"));
    expect(text("item")).toBe("ex-1|Første|12|Stikkord");
    expect(text("suggestions")).toBe("ex-2:Bedre");
    unmount();

    mocks.client = clientWith({ data: null, error: null }, { data: null, error: null });
    render(<AppProvider><SuggestionProbe sessionId="session-1" itemId="item-1" /></AppProvider>);
    await waitFor(() => expect(text("suggestions")).toBe("ex-2:Bedre"));
    await click("accept");
    await waitFor(() => expect(text("item")).toBe("ex-2|Andre|12|Stikkord"));
    expect(text("suggestions")).toBe("");
  });
});
