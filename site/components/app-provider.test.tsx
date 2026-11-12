import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProvider, useGrep } from "./app-provider";

// The provider is otherwise tested through the pure helpers it calls; this
// covers only the `exercisesLoaded` latch (decision 9), which lives in its
// load sequence and nowhere else.
const mocks = vi.hoisted(() => ({ configured: false, client: null as unknown }));
vi.mock("@/lib/supabase/config", () => ({ get isSupabaseConfigured() { return mocks.configured; }, supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "key" }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => mocks.client }));

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
