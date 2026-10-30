import { parseUsage } from "./usage.js";

export const CLIENT_VERSION = "0.1.0";

export const ALLOWED_BODY_KEYS = [
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

export function startBody() {
  return {
    source: "cli",
    client_version: CLIENT_VERSION,
  };
}

export function completionBody(result, options) {
  const usage = parseUsage(result.tail);
  const body = {
    exit_code: result.exitCode,
    duration_ms: result.durationMs,
    output_bytes: result.outBytes,
    err_bytes: result.errBytes,
    source: "cli",
    client_version: CLIENT_VERSION,
  };
  if (!options.noHash) body.output_hash = result.hash;
  const cost = options.cost ?? usage.costUsd;
  if (cost != null) body.cost_usd = cost;
  const tokensIn = options.tokensIn ?? (options.tokens != null ? options.tokens : usage.tokensIn);
  const tokensOut = options.tokensOut ?? usage.tokensOut;
  if (tokensIn != null) body.tokens_in = tokensIn;
  if (tokensOut != null) body.tokens_out = tokensOut;
  return body;
}

export function formatRequest(url, body) {
  return [`POST ${url}`, "content-type: application/json", `user-agent: staleagent/${CLIENT_VERSION}`, "", JSON.stringify(body, null, 2)].join(
    "\n",
  );
}

export function formatDryRun({ startUrl, startBody: start, finishUrl, finishBody }) {
  return [
    "staleagent dry-run",
    "The command ran locally. Nothing was sent.",
    "",
    formatRequest(startUrl, start),
    "",
    formatRequest(finishUrl, finishBody),
    "",
  ].join("\n");
}
