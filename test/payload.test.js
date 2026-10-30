import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { ALLOWED_BODY_KEYS, CLIENT_VERSION, completionBody, formatDryRun, startBody } from "../src/payload.js";
import { parseUsage } from "../src/usage.js";

const METADATA_KEYS = [
  "exit_code",
  "duration_ms",
  "output_bytes",
  "err_bytes",
  "output_hash",
  "cost_usd",
  "tokens_in",
  "tokens_out",
  "source",
  "client_version",
];

function assertMetadataOnly(body) {
  assert.deepEqual(Object.keys(body).filter((key) => !ALLOWED_BODY_KEYS.includes(key)), []);
  for (const key of Object.keys(body)) assert.ok(METADATA_KEYS.includes(key), key);
  const serialized = JSON.stringify(body);
  for (const secret of ["sk-live-secret", "OPENAI_API_KEY", "triage the inbox", "BEGIN PRIVATE"]) {
    assert.equal(serialized.includes(secret), false, secret);
  }
  assert.equal("tail" in body, false);
  assert.equal("hash" in body, false);
  assert.equal("command" in body, false);
  assert.equal("env" in body, false);
}

const SECRET_TAIL = [
  "prompt: triage the inbox",
  "OPENAI_API_KEY=sk-live-secret",
  "-----BEGIN PRIVATE KEY-----",
  "input_tokens: 1",
  "output_tokens: 2",
  "cost_usd: 9",
  'later "input_tokens": 1200',
  "output_tokens: 340",
  "total_cost_usd: 0.02",
].join("\n");

test("the allowlist is exactly the metadata fields", () => {
  assert.deepEqual(ALLOWED_BODY_KEYS, METADATA_KEYS);
});

test("the start body is source and client version", () => {
  const body = startBody();
  assert.deepEqual(body, { source: "cli", client_version: CLIENT_VERSION });
  assertMetadataOnly(body);
});

test("the finish body keeps usage numbers and drops the text they came from", () => {
  const body = completionBody(
    {
      exitCode: 0,
      durationMs: 842,
      outBytes: 1532,
      errBytes: 4,
      hash: "abc123",
      tail: SECRET_TAIL,
    },
    {},
  );
  assert.deepEqual(body, {
    exit_code: 0,
    duration_ms: 842,
    output_bytes: 1532,
    err_bytes: 4,
    output_hash: "abc123",
    source: "cli",
    client_version: "0.1.0",
    cost_usd: 0.02,
    tokens_in: 1200,
    tokens_out: 340,
  });
  assertMetadataOnly(body);
});

test("--no-hash omits output_hash and flags override parsed usage", () => {
  const body = completionBody(
    {
      exitCode: 2,
      durationMs: 5,
      outBytes: 0,
      errBytes: 0,
      hash: "should-not-appear",
      tail: SECRET_TAIL,
    },
    { noHash: true, cost: 0, tokens: 9, tokensOut: 8 },
  );
  assert.equal("output_hash" in body, false);
  assert.equal(JSON.stringify(body).includes("should-not-appear"), false);
  assert.equal(body.cost_usd, 0);
  assert.equal(body.tokens_in, 9);
  assert.equal(body.tokens_out, 8);
  assertMetadataOnly(body);
});

test("--tokens-in wins over --tokens and parsed input tokens", () => {
  const body = completionBody(
    { exitCode: 0, durationMs: 1, outBytes: 1, errBytes: 0, hash: "h", tail: SECRET_TAIL },
    { noHash: true, tokens: 9, tokensIn: 4 },
  );
  assert.equal(body.tokens_in, 4);
  assert.equal(body.tokens_out, 340);
  assert.equal(body.cost_usd, 0.02);
  assert.equal("output_hash" in body, false);
  assertMetadataOnly(body);
});

test("usage fields are omitted when stdout has no summary and no flags are set", () => {
  const body = completionBody(
    { exitCode: 1, durationMs: 1, outBytes: 3, errBytes: 2, hash: "h", tail: "hello from the agent" },
    { noHash: true },
  );
  assert.deepEqual(Object.keys(body).sort(), ["client_version", "duration_ms", "err_bytes", "exit_code", "output_bytes", "source"]);
  assert.equal(JSON.stringify(body).includes("hello from the agent"), false);
  assertMetadataOnly(body);
});

test("dry-run formatting shows the request bodies and not local output", () => {
  const finish = completionBody(
    { exitCode: 0, durationMs: 1, outBytes: 1, errBytes: 0, hash: "h", tail: SECRET_TAIL },
    { noHash: true },
  );
  const report = formatDryRun({
    startUrl: "https://staleagent.com/p/tok/start",
    startBody: startBody(),
    finishUrl: "https://staleagent.com/p/tok/ok",
    finishBody: finish,
  });
  assert.match(report, /Nothing was sent/);
  assert.match(report, /POST https:\/\/staleagent\.com\/p\/tok\/start/);
  assert.match(report, /POST https:\/\/staleagent\.com\/p\/tok\/ok/);
  assert.equal(report.includes("sk-live-secret"), false);
  assert.equal(report.includes("triage the inbox"), false);
  assert.equal(report.includes("output_hash"), false);
});

test("usage parsing keeps the last number and ignores surrounding text", () => {
  const once = parseUsage('noise input_tokens: 3 "output_tokens": 4 cost_usd: 1 total_cost_usd: 0.5');
  const twice = parseUsage('"input_tokens": 7');
  assert.deepEqual(once, { tokensIn: 3, tokensOut: 4, costUsd: 0.5 });
  assert.deepEqual(twice, { tokensIn: 7, tokensOut: null, costUsd: null });
  assert.deepEqual(parseUsage(""), { tokensIn: null, tokensOut: null, costUsd: null });
  assert.deepEqual(parseUsage(), { tokensIn: null, tokensOut: null, costUsd: null });
});

test("a stdout hash is sha256 of the full output, not of the tail alone", () => {
  const payload = `hello\n${SECRET_TAIL}`;
  const body = completionBody(
    {
      exitCode: 0,
      durationMs: 1,
      outBytes: Buffer.byteLength(payload),
      errBytes: 0,
      hash: createHash("sha256").update(payload).digest("hex"),
      tail: SECRET_TAIL,
    },
    {},
  );
  assert.equal(body.output_hash, createHash("sha256").update(payload).digest("hex"));
  assert.equal(body.output_hash.includes("sk-live-secret"), false);
  assertMetadataOnly(body);
});
