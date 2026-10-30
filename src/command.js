import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const TAIL_LIMIT = 64 * 1024;

export function createOutputMeter() {
  const hash = createHash("sha256");
  let outBytes = 0;
  let tail = "";
  return {
    push(buffer) {
      const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
      outBytes += buf.length;
      hash.update(buf);
      tail = (tail + buf.toString("utf8")).slice(-TAIL_LIMIT);
    },
    finish() {
      return { outBytes, hash: hash.digest("hex"), tail };
    },
  };
}

function safeWrite(stream, buffer) {
  try {
    stream.write(buffer);
  } catch {
    // The parent pipe can close while the command is still writing.
  }
}

export function runCommand(command, streams = { stdout: process.stdout, stderr: process.stderr }) {
  const started = Date.now();
  const [bin, ...args] = command;
  if (!bin) {
    return Promise.resolve({
      exitCode: 127,
      durationMs: 0,
      outBytes: 0,
      errBytes: 0,
      hash: createHash("sha256").digest("hex"),
      tail: "",
    });
  }

  return new Promise((resolve) => {
    let settled = false;
    const meter = createOutputMeter();
    let errBytes = 0;
    const finish = (exitCode) => {
      if (settled) return;
      settled = true;
      const measured = meter.finish();
      resolve({
        exitCode,
        durationMs: Math.max(0, Date.now() - started),
        outBytes: measured.outBytes,
        errBytes,
        hash: measured.hash,
        tail: measured.tail,
      });
    };

    const child = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      windowsHide: true,
    });
    child.stdout.on("data", (buf) => {
      meter.push(buf);
      safeWrite(streams.stdout ?? process.stdout, buf);
    });
    child.stderr.on("data", (buf) => {
      errBytes += buf.length;
      safeWrite(streams.stderr ?? process.stderr, buf);
    });
    child.on("error", () => finish(127));
    child.on("close", (code) => finish(code ?? 1));
  });
}
