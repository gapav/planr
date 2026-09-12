import { describe, expect, it } from "vitest";
import { permanentDeletionError, permanentDeletionRefusal, type PermanentDeletionInput } from "./account-lifecycle";

const valid: PermanentDeletionInput = {
  callerId: "10000000-0000-4000-8000-000000000001",
  callerIsGlobalAdmin: true,
  targetId: "20000000-0000-4000-8000-000000000002",
  targetEmail: "coach@example.com",
  targetIsGlobalAdmin: false,
  confirmationEmail: "coach@example.com",
};

describe("permanent account deletion", () => {
  it("allows a global admin to delete a different non-admin account after exact email confirmation", () => {
    expect(permanentDeletionRefusal(valid)).toBeNull();
    expect(permanentDeletionRefusal({ ...valid, confirmationEmail: " Coach@Example.com " })).toBeNull();
  });

  it("refuses non-admins, self-deletion and deletion of another global admin", () => {
    expect(permanentDeletionRefusal({ ...valid, callerIsGlobalAdmin: false })?.status).toBe(403);
    expect(permanentDeletionRefusal({ ...valid, targetId: valid.callerId })?.status).toBe(409);
    expect(permanentDeletionRefusal({ ...valid, targetIsGlobalAdmin: true })?.status).toBe(409);
  });

  it("requires a valid target and a matching confirmation address", () => {
    expect(permanentDeletionRefusal({ ...valid, targetId: "not-a-user" })?.status).toBe(400);
    expect(permanentDeletionRefusal({ ...valid, targetEmail: null })?.status).toBe(404);
    expect(permanentDeletionRefusal({ ...valid, confirmationEmail: "someone@example.com" })?.message).toMatch(/stemmer ikke/);
  });

  it("turns Storage ownership failures into an actionable message", () => {
    expect(permanentDeletionError("User owns storage objects")).toMatch(/Supabase Storage/);
    expect(permanentDeletionError("Database error deleting user")).toBe("Kontoen kunne ikke slettes permanent.");
  });
});
