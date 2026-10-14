// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  tables: {} as Record<string, unknown>,
  generateLink: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: async (token: string) => token === "good" ? { data: { user: { id: "caller-1", email: "caller@example.com" } }, error: null } : { data: { user: null }, error: new Error("bad") },
      admin: { generateLink: state.generateLink },
    },
    from: (table: string) => {
      const result = async () => ({ data: state.tables[table] ?? null });
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "is", "gt", "order", "limit"]) query[method] = () => query;
      query.single = result;
      query.maybeSingle = result;
      return query;
    },
  }),
}));
vi.mock("@/lib/supabase/config", () => ({ supabaseUrl: "https://project.supabase.co", supabasePublishableKey: "sb_publishable_test" }));

const TEAM_ID = "6f1c2a4e-3b5d-4c7e-8f90-1a2b3c4d5e6f";
let post: typeof import("./route").POST;
function request(data: unknown = { email: "Coach@Example.com", teamId: TEAM_ID, intent: "invite" }) {
  return new Request("https://grep.team/api/admin/auth-link", { method: "POST", headers: { authorization: "Bearer good", "content-type": "application/json" }, body: JSON.stringify(data) });
}
beforeEach(async () => {
  vi.resetModules();
  state.generateLink.mockReset().mockResolvedValue({ data: { properties: { hashed_token: "hash-1" } }, error: null });
  state.tables = {
    profiles: { is_global_admin: true },
    team_memberships: { role: "admin" },
    team_invitations: { token: "invite-token" },
    teams: { name: "Fjordvik J14" },
  };
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("RESEND_FROM", "");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://grep.team");
  post = (await import("./route")).POST;
});
afterEach(() => { vi.unstubAllEnvs(); });

it("hands a global admin the link when no mailer is configured", async () => {
  const response = await post(request());
  expect(response.status).toBe(200);
  const payload = await response.json();
  expect(payload.emailed).toBe(false);
  expect(payload.link).toContain("token_hash=hash-1");
  expect(state.generateLink).toHaveBeenCalledWith({ type: "invite", email: "coach@example.com" });
});

// A team admin may reserve a coach seat (202609020027) for any address. When
// that address already has an account the link signs in as its owner, so it
// must never come back to them — or a seat for the global admin's address
// would be a way into the global admin's account.
describe("a team admin", () => {
  beforeEach(() => { state.tables.profiles = { is_global_admin: false }; });
  const existingAccount = () => state.generateLink.mockImplementation(async ({ type }: { type: string }) => type === "invite"
    ? { data: { properties: null }, error: { message: "A user with this email address has already been registered" } }
    : { data: { properties: { hashed_token: "hash-existing" } }, error: null });

  it("is handed the link for an account the invite just created", async () => {
    const payload = await (await post(request())).json();
    expect(payload.link).toContain("token_hash=hash-1");
  });

  it("is never handed a sign-in link for an account that already existed", async () => {
    existingAccount();
    const response = await post(request());
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.link).toBeUndefined();
    expect(payload.emailed).toBe(false);
    expect(payload.emailError).toMatch(/allerede en konto/);
  });

  it("does not get that link back from a failed send either", async () => {
    existingAccount();
    vi.stubEnv("RESEND_API_KEY", "test-only-key");
    vi.stubEnv("RESEND_FROM", "Grep <hello@example.com>");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 })));
    vi.resetModules();
    post = (await import("./route")).POST;
    const payload = await (await post(request())).json();
    expect(payload.link).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("is refused for a team they do not administer, before anything is minted", async () => {
    state.tables.team_memberships = null;
    expect((await post(request())).status).toBe(403);
    expect(state.generateLink).not.toHaveBeenCalled();
  });

  it("is refused a login link", async () => {
    expect((await post(request({ email: "coach@example.com", intent: "login" }))).status).toBe(403);
    expect(state.generateLink).not.toHaveBeenCalled();
  });
});

it("still hands a global admin the link for an existing account", async () => {
  state.generateLink.mockImplementation(async ({ type }: { type: string }) => type === "invite"
    ? { data: { properties: null }, error: { message: "A user with this email address has already been registered" } }
    : { data: { properties: { hashed_token: "hash-existing" } }, error: null });
  const payload = await (await post(request())).json();
  expect(payload.link).toContain("token_hash=hash-existing");
});

it("refuses an invite link for a seat that does not exist", async () => {
  state.tables.team_invitations = null;
  const response = await post(request());
  expect(response.status).toBe(409);
  expect(state.generateLink).not.toHaveBeenCalled();
});
