import { defineConfig } from "vitest/config";
import path from "node:path";

// Grep's coaches are in Norway, and several tests assert local clock times.
// Pin the zone so the suite gives the same answer on a laptop and in CI (UTC).
process.env.TZ = "Europe/Oslo";

export default defineConfig({
  test: { environment: "jsdom", globals: true, setupFiles: ["./vitest.setup.ts"] },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
});
