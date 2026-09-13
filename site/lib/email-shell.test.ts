import { expect, it } from "vitest";
import { emailShell } from "./email-shell";
it("uses the Grep palette and a credential-free logo URL with readable alt text", () => {
  const html = emailShell({ preheader: "Hei", eyebrow: "Grep", heading: "Velkommen", lead: "Hei", action: { label: "Åpne", link: "https://grep.team/auth/confirm?token_hash=secret" } });
  expect(html).toContain('src="https://grep.team/brand/grep-email-logo.png"');
  expect(html).toContain('alt="Grep"');
  expect(html).toContain("#FFB28A");
  expect(html).toContain("#F1EAF8");
  expect(html).not.toContain("#10201d");
});
