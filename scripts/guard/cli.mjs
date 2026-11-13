#!/usr/bin/env node
// Command-line entry point for the repository guardrails.
//
// It gathers text from git, hands it to the pure checks in rules.mjs, prints
// any problems and exits non-zero so that the caller stops. Three modes:
//
//   staged              run by the pre-commit hook on the staged changes
//   commit-msg <file>   run by the commit-msg hook on the message being written
//   range <base> <head> run by CI on every commit of a pull request

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { checkCommitMessage, checkDiff, checkPath, parsePrivateTerms } from "./rules.mjs";

const PRIVATE_TERMS_FILE = ".private-terms";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

// CI supplies the list through a repository secret; developers keep it in an
// untracked file at the repository root. Having neither is valid.
function loadPrivateTerms() {
  if (process.env.OMNIDEV_PRIVATE_TERMS) {
    return parsePrivateTerms(process.env.OMNIDEV_PRIVATE_TERMS);
  }
  if (existsSync(PRIVATE_TERMS_FILE)) {
    return parsePrivateTerms(readFileSync(PRIVATE_TERMS_FILE, "utf8"));
  }
  return [];
}

function checkChanges(diffArgs, terms) {
  const paths = git("diff", "--name-only", "--diff-filter=ACMR", ...diffArgs)
    .split("\n")
    .filter(Boolean);
  return [
    ...paths.flatMap((path) => checkPath(path, terms)),
    ...checkDiff(git("diff", "--unified=0", "--no-color", ...diffArgs), terms),
  ];
}

// Runs the full gitleaks scan on staged changes when the tool is installed.
// A missing binary is a warning, not a failure, because the built-in patterns
// have already run and CI runs gitleaks on every pull request regardless.
function runGitleaksOnStaged() {
  const result = spawnSync("gitleaks", ["protect", "--staged", "--redact", "--no-banner"], {
    stdio: "inherit",
  });
  if (result.error?.code === "ENOENT") {
    console.warn("guard: gitleaks is not installed; only the built-in secret patterns ran.");
    return [];
  }
  return result.status === 0 ? [] : ["gitleaks found a possible secret in the staged changes."];
}

function run([mode, ...args]) {
  const terms = loadPrivateTerms();

  if (mode === "staged") {
    return [...checkChanges(["--cached"], terms), ...runGitleaksOnStaged()];
  }
  if (mode === "commit-msg" && args.length === 1) {
    return checkCommitMessage(readFileSync(args[0], "utf8"), terms);
  }
  if (mode === "range" && args.length === 2) {
    const [base, head] = args;
    const commits = git("rev-list", "--no-merges", `${base}..${head}`).split("\n").filter(Boolean);
    const messageProblems = commits.flatMap((commit) =>
      checkCommitMessage(git("log", "-1", "--format=%B", commit), terms).map(
        (problem) => `commit ${commit.slice(0, 7)}: ${problem}`,
      ),
    );
    return [...messageProblems, ...checkChanges([`${base}...${head}`], terms)];
  }

  console.error("usage: cli.mjs staged | commit-msg <file> | range <base> <head>");
  process.exit(2);
}

const problems = run(process.argv.slice(2));
if (problems.length > 0) {
  console.error(
    ["guard: commit blocked.", ...problems.map((problem) => `  - ${problem}`)].join("\n"),
  );
  process.exit(1);
}
