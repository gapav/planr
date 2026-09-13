import { describe, expect, it } from "vitest";
import { authLinkSiteUrl, confirmLinkUrl, invitationEmail, loginEmail, passwordResetEmail } from "./auth-email";

describe("authLinkSiteUrl", () => {
  it("returns administrator-issued links to localhost even with a production site URL configured", () => {
    expect(authLinkSiteUrl("https://grep.team", "http://localhost:3000/api/admin/auth-link")).toBe("http://localhost:3000");
  });

  it("uses the configured site URL outside localhost", () => {
    expect(authLinkSiteUrl("https://grep.team", "https://preview.example/api/admin/auth-link")).toBe("https://grep.team");
  });
});

describe("confirmLinkUrl", () => {
  it("points at the page that can verify a token hash, not at /auth/v1/verify", () => {
    expect(confirmLinkUrl("https://grep.team", "abc123", "invite")).toBe("https://grep.team/auth/confirm?token_hash=abc123&type=invite");
  });

  it("carries the link type through, so an existing coach is not sent to the password form", () => {
    expect(confirmLinkUrl("https://grep.team", "abc123", "magiclink")).toBe("https://grep.team/auth/confirm?token_hash=abc123&type=magiclink");
  });

  it("does not double the slash when the site url has a trailing one", () => {
    expect(confirmLinkUrl("https://grep.team/", "abc123", "invite")).toBe("https://grep.team/auth/confirm?token_hash=abc123&type=invite");
  });

  it("escapes a token hash that is not url safe", () => {
    expect(confirmLinkUrl("https://grep.team", "a+b/c=", "invite")).toContain("token_hash=a%2Bb%2Fc%3D");
  });

  it("carries an in-app destination through the sign-in", () => {
    expect(confirmLinkUrl("https://grep.team", "abc123", "invite", "/invite/team-token")).toBe("https://grep.team/auth/confirm?token_hash=abc123&type=invite&next=%2Finvite%2Fteam-token");
  });
});

describe("invitationEmail", () => {
  const link = "https://grep.team/auth/confirm?token_hash=abc&type=invite";

  it("names the team in the subject so a coach on several knows which one", () => {
    expect(invitationEmail({ teamName: "Fjordvik G18", link }).subject).toBe("Du er invitert til Fjordvik G18 i Grep");
  });

  it("invites both new and existing coaches without mentioning a password", () => {
    const { html, text } = invitationEmail({ teamName: "Fjordvik G18", link });
    expect(html).not.toContain("passord");
    expect(text).not.toContain("passord");
    expect(text).toContain("logge inn og bli med");
  });

  it("carries the link in both the button and the plain text fallback", () => {
    const { html, text } = invitationEmail({ teamName: "Fjordvik G18", link });
    // Escaped in the href because that is what valid HTML wants; mail clients
    // turn `&amp;` back into `&` before following it.
    expect(html).toContain(`href="${link.replace(/&/g, "&amp;")}"`);
    expect(text).toContain(link);
  });

  it("escapes a team name so it cannot inject markup into the email", () => {
    const { html } = invitationEmail({ teamName: '<img src=x onerror="alert(1)">', link });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain("&lt;img");
  });
});

describe("loginEmail", () => {
  const link = "https://grep.team/auth/confirm?token_hash=abc&type=magiclink";

  it("explains that the browser keeps the coach signed in", () => {
    const { subject, html, text } = loginEmail({ link });
    expect(subject).toBe("Logg inn på Grep");
    expect(html).toContain("Nettleseren husker deg");
    expect(text).toContain(link);
  });
});

describe("passwordResetEmail", () => {
  const link = "https://grep.team/auth/confirm?token_hash=abc&type=recovery";

  it("says an administrator sent it, since the coach did not ask for it themselves", () => {
    expect(passwordResetEmail({ link }).text).toContain("Lagadministratoren");
  });

  it("carries the link in both the button and the plain text fallback", () => {
    const { html, text } = passwordResetEmail({ link });
    expect(html).toContain(`href="${link.replace(/&/g, "&amp;")}"`);
    expect(text).toContain(link);
  });

  it("does not read as an invitation to a team", () => {
    expect(passwordResetEmail({ link }).subject).toBe("Velg et nytt passord i Grep");
  });
});
