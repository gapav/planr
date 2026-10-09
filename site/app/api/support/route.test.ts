// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  user: { id: "user-1", email: "Kari@Example.com" } as { id: string; email?: string } | null,
  tables: {} as Record<string, unknown>,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: async (token: string) => token === "good" && auth.user ? { data: { user: auth.user }, error: null } : { data: { user: null }, error: new Error("bad") } },
    from: (table: string) => {
      const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: auth.tables[table] }), then: (resolve: (value: unknown) => void) => resolve({ data: auth.tables[table] }) };
      return query;
    },
  }),
}));
vi.mock("@/lib/supabase/config", () => ({ supabaseUrl: "https://project.supabase.co", supabasePublishableKey: "sb_publishable_test" }));

let post: typeof import("./route").POST;
let fetcher: ReturnType<typeof vi.fn>;
function request(data: unknown = { message: "Kalenderen viser ingen økter.", page: "/sessions" }, headers: Record<string, string> = {}) {
  return new Request("https://grep.team/api/support", { method: "POST", headers: { origin: "https://grep.team", authorization: "Bearer good", "content-type": "application/json", ...headers }, body: JSON.stringify(data) });
}
beforeEach(async () => {
  vi.resetModules();
  auth.user = { id: "user-1", email: "Kari@Example.com" };
  auth.tables = { profiles: { full_name: "Kari N." }, team_memberships: [{ teams: { name: "Fjordvik J14" } }] };
  vi.stubEnv("RESEND_API_KEY", "test-only-key");
  vi.stubEnv("RESEND_FROM", "Grep <hello@example.com>");
  vi.stubEnv("GREP_SUPPORT_TO", "owner@example.com");
  fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ id: "email-test" }), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  post = (await import("./route")).POST;
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("mails the owner as the verified coach, with the coach as Reply-To", async () => {
  expect((await post(request())).status).toBe(200);
  const payload = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(payload.to).toEqual(["owner@example.com"]);
  expect(payload.reply_to).toBe("kari@example.com");
  expect(payload.subject).toBe("Support fra Kari N.");
  expect(payload.text).toContain("Fjordvik J14");
  expect(payload.text).toContain("/sessions");
  expect(fetcher.mock.calls[0][1].headers["Idempotency-Key"]).toMatch(/^grep-support-/);
});

it("defaults to the owner's own address", async () => {
  vi.stubEnv("GREP_SUPPORT_TO", "");
  await post(request());
  expect(JSON.parse(fetcher.mock.calls[0][1].body).to).toEqual(["gardpavels@gmail.com"]);
});

it("turns away signed-out, expired and cross-origin callers", async () => {
  expect((await post(request(undefined, { authorization: "" }))).status).toBe(401);
  expect((await post(request(undefined, { authorization: "Bearer forged" }))).status).toBe(401);
  expect((await post(request(undefined, { origin: "https://elsewhere.example" }))).status).toBe(403);
  expect(fetcher).not.toHaveBeenCalled();
});

it("rejects a chosen recipient or sender, empty and oversized messages", async () => {
  expect((await post(request({ message: "Hei hei", to: "x@example.com" }))).status).toBe(400);
  expect((await post(request({ message: "Hei hei", email: "x@example.com" }))).status).toBe(400);
  expect((await post(request({ message: " " }))).status).toBe(400);
  expect((await post(request({ message: "a".repeat(20000) }))).status).toBe(413);
  expect(fetcher).not.toHaveBeenCalled();
});

it("caps each coach at five messages an hour", async () => {
  for (let i = 0; i < 5; i++) expect((await post(request({ message: `Melding nummer ${i}` }))).status).toBe(200);
  expect((await post(request())).status).toBe(429);
});

it("does not report success without email configuration or provider acceptance", async () => {
  vi.stubEnv("RESEND_API_KEY", "");
  expect((await post(request())).status).toBe(503);
  expect(fetcher).not.toHaveBeenCalled();
  vi.stubEnv("RESEND_API_KEY", "test-only-key");
  fetcher.mockResolvedValueOnce(new Response("upstream error", { status: 500 }));
  expect((await post(request())).status).toBe(502);
  fetcher.mockRejectedValueOnce(new Error("network"));
  expect((await post(request())).status).toBe(502);
});
