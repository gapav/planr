// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const details = { name: "Ingrid Berg", email: "ingrid@example.com", team: "Fjordvik IL", message: "Håndball J2016", website: "" };
let post: typeof import("./route").POST;
let fetcher: ReturnType<typeof vi.fn>;
function request(data: unknown = details, headers: Record<string, string> = {}) {
  return new Request("https://grep.team/api/interest", { method: "POST", headers: { origin: "https://grep.team", "content-type": "application/json", "x-real-ip": "192.0.2.1", ...headers }, body: JSON.stringify(data) });
}
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("RESEND_API_KEY", "test-only-key");
  vi.stubEnv("RESEND_FROM", "Grep <hello@example.com>");
  vi.stubEnv("GREP_INTEREST_TO", "owner@example.com");
  fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email-test" }), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  post = (await import("./route")).POST;
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("allows unauthenticated interest and sends only to the owner with Reply-To", async () => {
  expect((await post(request())).status).toBe(200);
  const payload = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(payload.to).toEqual(["owner@example.com"]);
  expect(payload.reply_to).toBe("ingrid@example.com");
  expect(payload.text).toContain("Fjordvik IL");
  expect(fetcher.mock.calls[0][1].headers["Idempotency-Key"]).toMatch(/^grep-interest-/);
});

it("uses the explicitly requested owner by default", async () => {
  vi.stubEnv("GREP_INTEREST_TO", "");
  await post(request());
  expect(JSON.parse(fetcher.mock.calls[0][1].body).to).toEqual(["gardpavels@gmail.com"]);
});

it("rejects cross-origin requests, invalid email and client-selected recipients", async () => {
  expect((await post(request(details, { origin: "https://elsewhere.example" }))).status).toBe(403);
  expect((await post(request({ ...details, email: "bad\r\nBcc: someone@example.com" }))).status).toBe(400);
  expect((await post(request({ ...details, to: "someone@example.com" }))).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});

it("enforces required fields, message limits and format", async () => {
  expect((await post(request({ ...details, name: " " }))).status).toBe(400);
  expect((await post(request({ ...details, team: "" }))).status).toBe(400);
  expect((await post(request({ ...details, message: "a".repeat(1501) }))).status).toBe(400);
  expect((await post(request(details, { "content-type": "text/plain" }))).status).toBe(415);
  expect(fetcher).not.toHaveBeenCalled();
});

it("limits actual body size even without content-length and rejects malformed JSON", async () => {
  expect((await post(request({ ...details, message: "a".repeat(9000) }))).status).toBe(413);
  expect((await post(new Request("https://grep.team/api/interest", { method: "POST", headers: { origin: "https://grep.team", "content-type": "application/json" }, body: "{" }))).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});

it("silently discards the honeypot without sending", async () => {
  expect((await post(request({ ...details, website: "spam" }))).status).toBe(200);
  expect(fetcher).not.toHaveBeenCalled();
});

it("escapes user HTML in notification emails", async () => {
  await post(request({ ...details, name: "<img src=x>", message: "<script>alert(1)</script>" }));
  const html = JSON.parse(fetcher.mock.calls[0][1].body).html;
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("&lt;img src=x&gt;");
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

it("uses stable deduplication keys and limits repeated requests", async () => {
  for (let i = 0; i < 3; i++) {
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ id: "email-test" })));
    expect((await post(request())).status).toBe(200);
  }
  expect(fetcher.mock.calls[0][1].headers["Idempotency-Key"]).toBe(fetcher.mock.calls[1][1].headers["Idempotency-Key"]);
  expect((await post(request())).status).toBe(429);
  expect(fetcher).toHaveBeenCalledTimes(3);
});
