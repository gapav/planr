import { describe, expect, it } from "vitest";
import { supportEmail, supportSchema } from "./support";

const sender = { name: "Kari N.", email: "kari@example.com", teams: ["Fjordvik J14", "Fjordvik J16"] };

describe("support", () => {
  it("accepts only a message and the page, never a sender or recipient", () => {
    expect(supportSchema.parse({ message: "  Kalenderen er tom  " })).toEqual({ message: "Kalenderen er tom", page: "/" });
    expect(supportSchema.safeParse({ message: "Hei hei", to: "x@example.com" }).success).toBe(false);
    expect(supportSchema.safeParse({ message: "Hei hei", email: "x@example.com" }).success).toBe(false);
    expect(supportSchema.safeParse({ message: "Hei" }).success).toBe(false);
    expect(supportSchema.safeParse({ message: "a".repeat(3001) }).success).toBe(false);
    expect(supportSchema.safeParse({ message: "Hei hei", page: "https://elsewhere.example" }).success).toBe(false);
    expect(supportSchema.safeParse({ message: "Hei hei", page: "/sessions\r\nBcc: x" }).success).toBe(false);
  });

  it("names the coach, their teams and the page, and escapes what they wrote", () => {
    const mail = supportEmail({ message: "<script>alert(1)</script>", page: "/sessions/abc" }, sender);
    expect(mail.subject).toBe("Support fra Kari N.");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.text).toContain("Fjordvik J14, Fjordvik J16");
    expect(mail.text).toContain("/sessions/abc");
    expect(supportEmail({ message: "Hei hei", page: "/" }, { ...sender, teams: [] }).text).toContain("Lag: Ingen lag");
  });
});
