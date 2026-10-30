import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLOWED_BODY_KEYS } from "../src/payload.js";
import { execute } from "../src/run.js";

const TAIL = "prompt: triage the inbox\nOPENAI_API_KEY=sk-live-secret\ninput_tokens: 3\noutput_tokens: 1\ncost_usd: 0.25\n";

function capture() {
  let text = "";
  return {
    write(chunk) {
      text += chunk;
    },
    read() {
      return text;
    },
  };
}

function result(overrides = {}) {
  return {
    exitCode: 0,
    durationMs: 12,
    outBytes: TAIL.length,
    errBytes: 0,
    hash: "abc123",
    tail: TAIL,
    ...overrides,
  };
}

async function run(argv, { env = {}, commandResult = result(), post } = {}) {
  const calls = [];
  const stdout = capture();
  const stderr = capture();
  let ran = null;
  const code = await execute(argv, {
    env,
    stdout,
    stderr,
    post:
      post ??
      (async (url, body) => {
        calls.push({ url, body });
      }),
    runCommand: async (command) => {
      ran = command;
      return commandResult;
    },
  });
  return { calls, code, ran, stdout: stdout.read(), stderr: stderr.read() };
}

function assertMetadataOnly(body) {
  for (const key of Object.keys(body)) assert.ok(ALLOWED_BODY_KEYS.includes(key), key);
  const serialized = JSON.stringify(body);
  assert.equal(serialized.includes("sk-live-secret"), false);
  assert.equal(serialized.includes("triage the inbox"), false);
  assert.equal(serialized.includes("OPENAI_API_KEY"), false);
  assert.equal("tail" in body, false);
}

test("a normal run posts metadata to the default origin", async () => {
  const { calls, code, ran } = await run(["run", "tok en", "--", "echo", "hi"], {
    env: { OPENAI_API_KEY: "sk-live-secret", PATH: "/usr/bin" },
  });
  assert.equal(code, 0);
  assert.deepEqual(ran, ["echo", "hi"]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://staleagent.com/p/tok%20en/start");
  assert.deepEqual(calls[0].body, { source: "cli", client_version: "0.1.0" });
  assert.equal(calls[1].url, "https://staleagent.com/p/tok%20en/ok");
  assert.equal(calls[1].body.exit_code, 0);
  assert.equal(calls[1].body.tokens_in, 3);
  assert.equal(calls[1].body.tokens_out, 1);
  assert.equal(calls[1].body.cost_usd, 0.25);
  assert.equal(calls[1].body.output_hash, "abc123");
  assert.equal(JSON.stringify(calls).includes("sk-live-secret"), false);
  assert.equal(JSON.stringify(calls).includes("/usr/bin"), false);
  for (const call of calls) assertMetadataOnly(call.body);
});

test("a non-zero exit posts to /fail", async () => {
  const { calls, code } = await run(["run", "tok", "--", "cmd"], {
    commandResult: result({ exitCode: 2 }),
  });
  assert.equal(code, 2);
  assert.equal(calls[1].url, "https://staleagent.com/p/tok/fail");
  assert.equal(calls[1].body.exit_code, 2);
});

test("--url wins over STALEAGENT_BASE_URL and a trailing slash is removed", async () => {
  const { calls } = await run(["run", "tok", "--url", "https://example.com/base/", "--no-hash", "--", "cmd"], {
    env: { STALEAGENT_BASE_URL: "https://staleagent.com/ignored/" },
  });
  assert.equal(calls[0].url, "https://example.com/base/p/tok/start");
  assert.equal(calls[1].url, "https://example.com/base/p/tok/ok");
  assert.equal("output_hash" in calls[1].body, false);
  assertMetadataOnly(calls[1].body);
});

test("STALEAGENT_BASE_URL is used when --url is absent", async () => {
  const { calls } = await run(["run", "tok", "--", "cmd"], {
    env: { STALEAGENT_BASE_URL: "https://example.com/" },
  });
  assert.equal(calls[0].url, "https://example.com/p/tok/start");
  assert.equal(calls[1].url, "https://example.com/p/tok/ok");
});

test("--dry-run prints the requests and does not post them", async () => {
  let posted = false;
  const { calls, code, stderr } = await run(["run", "tok", "--dry-run", "--no-hash", "--", "cmd", "arg"], {
    commandResult: result({ exitCode: 4 }),
    post: async () => {
      posted = true;
    },
  });
  assert.equal(posted, false);
  assert.equal(calls.length, 0);
  assert.equal(code, 4);
  assert.match(stderr, /Nothing was sent/);
  assert.match(stderr, /POST https:\/\/staleagent\.com\/p\/tok\/start/);
  assert.match(stderr, /POST https:\/\/staleagent\.com\/p\/tok\/fail/);
  assert.equal(stderr.includes("sk-live-secret"), false);
  assert.equal(stderr.includes("triage the inbox"), false);
  assert.equal(stderr.includes("output_hash"), false);
  assert.match(stderr, /"tokens_in": 3/);
});

test("a failed ping still runs the command and preserves its exit code", async () => {
  const { code, ran, stderr } = await run(["run", "tok", "--", "cmd"], {
    commandResult: result({ exitCode: 3 }),
    post: async () => {
      throw new Error("HTTP 500");
    },
  });
  assert.deepEqual(ran, ["cmd"]);
  assert.equal(code, 3);
  assert.match(stderr, /start ping failed \(HTTP 500\)/);
  assert.match(stderr, /result ping failed \(HTTP 500\)/);
  assert.equal(stderr.includes("sk-live-secret"), false);
});

test("help and version do not run a command or post", async () => {
  let posted = false;
  const help = await run(["--help"], {
    post: async () => {
      posted = true;
    },
  });
  assert.equal(help.code, 0);
  assert.equal(help.ran, null);
  assert.equal(posted, false);
  assert.match(help.stderr, /--dry-run/);
  assert.match(help.stderr, /--no-hash/);
  assert.match(help.stderr, /Nothing from the prompt/);

  const version = await run(["-v"], {
    post: async () => {
      posted = true;
    },
  });
  assert.equal(version.code, 0);
  assert.equal(version.ran, null);
  assert.equal(version.stdout, "0.1.0\n");
  assert.equal(posted, false);
});

test("invalid arguments exit 2 without running a command", async () => {
  let posted = false;
  const { code, ran, stderr } = await run(["run", "tok"], {
    post: async () => {
      posted = true;
    },
  });
  assert.equal(code, 2);
  assert.equal(ran, null);
  assert.equal(posted, false);
  assert.match(stderr, /Pass a command after --/);
  assert.match(stderr, /--dry-run/);
});
