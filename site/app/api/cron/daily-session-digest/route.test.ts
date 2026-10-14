// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// The route holds `SUPABASE_SECRET_KEY`, and `CRON_SECRET` is the only thing in
// front of it. These pin that gate: nothing is read — no secret-key client is
// even created — until the caller has proved they are the scheduler.
const createClient = vi.hoisted(() => vi.fn(() => {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "gte", "lt", "in", "lte"]) query[method] = () => query;
  query.then = (resolve: (value: unknown) => void) => resolve({ data: [], error: null });
  return { from: () => query };
}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
vi.mock("@/lib/supabase/config", () => ({ supabaseUrl: "https://project.supabase.co", supabasePublishableKey: "sb_publishable_test" }));

let get: typeof import("./route").GET;
async function load(cronSecret: string) {
  vi.resetModules();
  vi.stubEnv("CRON_SECRET", cronSecret);
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
  get = (await import("./route")).GET;
}
const call = (authorization?: string) => get(new Request("https://grep.team/api/cron/daily-session-digest?dry=1", { headers: authorization ? { authorization } : {} }));

beforeEach(() => { createClient.mockClear(); });
afterEach(() => { vi.unstubAllEnvs(); });

it("is switched off, not open, when CRON_SECRET is unset", async () => {
  await load("");
  expect((await call("Bearer anything")).status).toBe(503);
  expect(createClient).not.toHaveBeenCalled();
});

it("refuses a missing or wrong secret before touching the database", async () => {
  await load("a-long-random-cron-secret");
  expect((await call()).status).toBe(401);
  expect((await call("Bearer a-long-random-cron-secreT")).status).toBe(401);
  expect((await call("Bearer a-long-random-cron-secret-and-more")).status).toBe(401);
  expect(createClient).not.toHaveBeenCalled();
});

it("runs for the scheduler's bearer token", async () => {
  await load("a-long-random-cron-secret");
  const response = await call("Bearer a-long-random-cron-secret");
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ sessions: 0, sent: 0 });
  expect(createClient).toHaveBeenCalledOnce();
});
