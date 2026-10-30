import assert from "node:assert/strict";
import { test } from "node:test";
import { parseArgs } from "../src/run.js";

test("help and version flags", () => {
  assert.deepEqual(parseArgs([]), { help: true });
  assert.deepEqual(parseArgs(["--help"]), { help: true });
  assert.deepEqual(parseArgs(["-h"]), { help: true });
  assert.deepEqual(parseArgs(["run", "--help"]), { help: true });
  assert.deepEqual(parseArgs(["run", "-h"]), { help: true });
  assert.deepEqual(parseArgs(["--version"]), { version: true });
  assert.deepEqual(parseArgs(["-v"]), { version: true });
});

test("rejects an unknown command and incomplete runs", () => {
  assert.equal(parseArgs(["ping"]).error, "Unknown command. Use: staleagent run <token> -- <command>");
  assert.equal(parseArgs(["run"]).error, "Pass the check token before --.");
  assert.equal(parseArgs(["run", "tok"]).error, "Pass a command after --.");
  assert.equal(parseArgs(["run", "tok", "--"]).error, "Pass a command after --.");
  assert.equal(parseArgs(["run", "tok", "extra", "--", "cmd"]).error, "Pass the check token before --.");
  assert.equal(parseArgs(["run", "tok", "--bogus", "--", "cmd"]).error, "Unknown flag --bogus");
});

test("rejects missing or invalid flag values", () => {
  assert.equal(parseArgs(["run", "tok", "--cost", "--", "cmd"]).error, "--cost needs a value");
  assert.equal(parseArgs(["run", "tok", "--cost", "nope", "--", "cmd"]).error, "--cost must be a number");
  assert.equal(parseArgs(["run", "tok", "--cost", "-1", "--", "cmd"]).error, "--cost must be a number");
  assert.equal(parseArgs(["run", "tok", "--tokens", "1.5", "--", "cmd"]).error, "--tokens must be a whole number");
  assert.equal(parseArgs(["run", "tok", "--tokens-in", "-3", "--", "cmd"]).error, "--tokens-in must be a whole number");
  assert.equal(parseArgs(["run", "tok", "--tokens-out"]).error, "--tokens-out needs a value");
  assert.equal(parseArgs(["run", "tok", "--url"]).error, "--url needs a value");
  assert.equal(parseArgs(["run", "tok", "--url", "--dry-run", "--", "cmd"]).error, "--url needs a value");
});

test("parses the token, flags, and command", () => {
  assert.deepEqual(
    parseArgs([
      "run",
      "--dry-run",
      "--no-hash",
      "--cost",
      "0.5",
      "--tokens",
      "10",
      "--tokens-in",
      "8",
      "--tokens-out",
      "0",
      "--url",
      "https://staleagent.com/",
      "my token",
      "--",
      "echo",
      "hello",
      "--no-hash",
    ]),
    {
      dryRun: true,
      noHash: true,
      cost: 0.5,
      tokens: 10,
      tokensIn: 8,
      tokensOut: 0,
      url: "https://staleagent.com/",
      token: "my token",
      command: ["echo", "hello", "--no-hash"],
    },
  );
});

test("defaults flags when only a token and command are present", () => {
  assert.deepEqual(parseArgs(["run", "tok", "--", "cmd"]), {
    dryRun: false,
    noHash: false,
    cost: undefined,
    tokens: undefined,
    tokensIn: undefined,
    tokensOut: undefined,
    url: undefined,
    token: "tok",
    command: ["cmd"],
  });
});
