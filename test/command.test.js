import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { createOutputMeter, runCommand } from "../src/command.js";
import { completionBody } from "../src/payload.js";

const TAIL_LIMIT = 64 * 1024;

test("the output meter hashes all of stdout and keeps a bounded tail", () => {
  const meter = createOutputMeter();
  const big = Buffer.alloc(70 * 1024, 0x61);
  const suffix = Buffer.from("\ninput_tokens: 9");
  meter.push(big);
  meter.push(suffix);
  const measured = meter.finish();
  assert.equal(measured.outBytes, big.length + suffix.length);
  assert.ok(measured.tail.length <= TAIL_LIMIT);
  assert.match(measured.tail, /input_tokens: 9$/);
  assert.equal(measured.hash, createHash("sha256").update(big).update(suffix).digest("hex"));
});

test("an empty command does not spawn and returns exit 127", async () => {
  const result = await runCommand([]);
  assert.equal(result.exitCode, 127);
  assert.equal(result.outBytes, 0);
  assert.equal(result.errBytes, 0);
  assert.equal(result.tail, "");
  assert.equal(result.hash, createHash("sha256").digest("hex"));
});

test("stdout is echoed and hashed locally; stderr is counted and not hashed", async () => {
  let out = "";
  let err = "";
  const result = await runCommand([process.execPath, "-e", "process.stdout.write('hello'); process.stderr.write('secret-err')"], {
    stdout: {
      write(chunk) {
        out += chunk;
      },
    },
    stderr: {
      write(chunk) {
        err += chunk;
      },
    },
  });
  assert.equal(result.exitCode, 0);
  assert.equal(out, "hello");
  assert.equal(err, "secret-err");
  assert.equal(result.outBytes, 5);
  assert.equal(result.errBytes, "secret-err".length);
  assert.equal(result.tail, "hello");
  assert.equal(result.hash, createHash("sha256").update("hello").digest("hex"));
  assert.equal(result.hash.includes("secret-err"), false);

  const body = completionBody(result, {});
  const serialized = JSON.stringify(body);
  assert.equal(serialized.includes("hello"), false);
  assert.equal(serialized.includes("secret-err"), false);
  assert.equal(body.output_hash, result.hash);
  assert.equal(body.output_bytes, 5);
  assert.equal(body.err_bytes, "secret-err".length);
});

test("a missing executable is exit 127", async () => {
  const result = await runCommand(["/workspace/.missing-staleagent-bin"], {
    stdout: { write() {} },
    stderr: { write() {} },
  });
  assert.equal(result.exitCode, 127);
  assert.equal(result.outBytes, 0);
});

test("a closed parent pipe does not fail the command", async () => {
  const closed = {
    write() {
      throw new Error("EPIPE");
    },
  };
  const result = await runCommand([process.execPath, "-e", "process.stdout.write('abc')"], {
    stdout: closed,
    stderr: closed,
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.outBytes, 3);
  assert.equal(result.tail, "abc");
});
