// @vitest-environment node
//
// The shell side of `make migrate-*` (scripts/migrate.sh) and the hook that
// guards shipped migrations (.claude/hooks/protect-applied-migrations.sh).
// Neither touches a database: the plan is a pure function of the versions on
// disk and in the remote history, and the hook reads only git.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const migrateScript = path.join(repoRoot, "scripts/migrate.sh");
const hook = path.join(repoRoot, ".claude/hooks/protect-applied-migrations.sh");

function plan(local: string[], remote: string[], tables: number) {
  const out = execFileSync(
    "bash",
    [
      "-c",
      'source "$1"; migration_plan "$2" "$3" "$4" && rc=0 || rc=$?; echo "rc=$rc"',
      "_",
      migrateScript,
      local.join("\n"),
      remote.join("\n"),
      String(tables),
    ],
    { encoding: "utf8" },
  );
  const lines = out.trim().split("\n").filter(Boolean);
  const rc = Number(lines.pop()!.replace("rc=", ""));
  return { rc, lines };
}

function candidates(local: string[], remote: string[], cutoff: string) {
  return execFileSync(
    "bash",
    ["-c", 'source "$1"; baseline_candidates "$2" "$3" "$4"', "_", migrateScript, local.join("\n"), remote.join("\n"), cutoff],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean);
}

describe("migration_plan", () => {
  const disk = ["202609020001", "202609020002", "202610140001"];

  it("has nothing pending when the history matches the files", () => {
    expect(plan(disk, disk, 30)).toEqual({ rc: 0, lines: [] });
  });

  it("lists a new file after the newest applied one as pending", () => {
    expect(plan([...disk, "202611110001"], disk, 30)).toEqual({ rc: 0, lines: ["PENDING 202611110001"] });
  });

  it("refuses when the history is empty but public has tables", () => {
    expect(plan(disk, [], 30).rc).toBe(10);
  });

  it("pushes everything into an empty project with no history", () => {
    expect(plan(disk, [], 0)).toEqual({ rc: 0, lines: disk.map((v) => `PENDING ${v}`) });
  });

  it("refuses a file missing remotely that is older than the newest applied one", () => {
    const result = plan(disk, ["202609020001", "202610140001"], 30);
    expect(result.rc).toBe(11);
    expect(result.lines).toContain("OUT_OF_ORDER 202609020002");
  });

  it("refuses when the history holds a version this checkout lacks", () => {
    const result = plan(disk, [...disk, "202612010001"], 30);
    expect(result.rc).toBe(12);
    expect(result.lines).toContain("MISSING_LOCAL 202612010001");
  });
});

describe("baseline_candidates", () => {
  const disk = ["202609020001", "202609020002", "202610140001", "202611110001"];

  it("marks every file up to the cutoff that the history lacks", () => {
    expect(candidates(disk, [], "202610140001")).toEqual(["202609020001", "202609020002", "202610140001"]);
  });

  it("skips what the history already has", () => {
    expect(candidates(disk, ["202609020001"], "202610140001")).toEqual(["202609020002", "202610140001"]);
  });
});

describe("storage_bucket_names (make backup)", () => {
  const lib = path.join(repoRoot, "scripts/lib.sh");
  const buckets = (cliOutput: string) =>
    execFileSync("bash", ["-c", 'source "$1"; storage_bucket_names', "_", lib], { input: cliOutput, encoding: "utf8" })
      .trim()
      .split("\n")
      .filter(Boolean);

  // In a terminal the CLI prints plain lines; the old parser wanted quotes, so
  // every backup taken by hand skipped Storage without failing.
  it("reads the plain lines the CLI prints in a terminal", () => {
    expect(buckets("exercise-videos/\nteam-logos/\n")).toEqual(["exercise-videos", "team-logos"]);
  });

  it("reads the JSON the CLI prints for an agent", () => {
    expect(buckets('{"paths":["exercise-videos/","team-logos/"],"message":""}\n')).toEqual(["exercise-videos", "team-logos"]);
  });
});

describe("protect-applied-migrations hook", () => {
  let dir = "";
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = "";
  });

  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@example.com",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@example.com",
  };
  const git = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], { env: gitEnv, stdio: "pipe" });

  function setup({ withOrigin = true } = {}) {
    dir = mkdtempSync(path.join(tmpdir(), "hook-"));
    const migrations = path.join(dir, "site/supabase/migrations");
    mkdirSync(migrations, { recursive: true });
    const file = (name: string) => {
      writeFileSync(path.join(migrations, name), "select 1;\n");
      return path.join(migrations, name);
    };
    git("init", "-q", "-b", "main");
    const shipped = file("202609020001_shipped.sql");
    git("add", ".");
    git("commit", "-q", "-m", "shipped");
    if (withOrigin) git("update-ref", "refs/remotes/origin/main", "HEAD");
    git("checkout", "-q", "-b", "feature");
    const branchOnly = file("202611110001_branch.sql");
    git("add", ".");
    git("commit", "-q", "-m", "branch");
    const uncommitted = file("202611110002_new.sql");
    return { shipped, branchOnly, uncommitted, migrations };
  }

  function runHook(filePath: string) {
    const result = spawnSync("bash", [hook], {
      input: JSON.stringify({ tool_input: { file_path: filePath } }),
      encoding: "utf8",
    });
    const decision = result.stdout.trim()
      ? JSON.parse(result.stdout).hookSpecificOutput.permissionDecision
      : undefined;
    return { status: result.status, decision, stderr: result.stderr };
  }

  it("refuses an edit to a migration on origin/main", () => {
    const { shipped } = setup();
    const result = runHook(shipped);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("origin/main");
  });

  it("asks for a migration committed only on the current branch", () => {
    const { branchOnly } = setup();
    expect(runHook(branchOnly)).toMatchObject({ status: 0, decision: "ask" });
  });

  it("passes an uncommitted migration", () => {
    const { uncommitted } = setup();
    expect(runHook(uncommitted)).toMatchObject({ status: 0, decision: undefined });
  });

  it("passes a file that does not exist yet", () => {
    const { migrations } = setup();
    expect(runHook(path.join(migrations, "202611110003_brand_new.sql"))).toMatchObject({ status: 0, decision: undefined });
  });

  it("ignores files outside the migrations folder", () => {
    expect(runHook("/somewhere/site/lib/types.ts")).toMatchObject({ status: 0, decision: undefined });
  });

  it("asks when there is no origin/main to compare with", () => {
    const { shipped } = setup({ withOrigin: false });
    expect(runHook(shipped)).toMatchObject({ status: 0, decision: "ask" });
  });
});
