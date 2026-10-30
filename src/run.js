import { completionBody, formatDryRun, startBody } from "./payload.js";

const HELP = `staleagent run <token> -- <command>

Wrap a scheduled agent and ping StaleAgent with metadata only.
Nothing from the prompt, the output, the environment, or API keys is sent.

  --dry-run       Run the command locally and print the requests. Do not send them.
  --no-hash       Do not include the SHA-256 of stdout.
  --cost <usd>    Report a cost estimate.
  --tokens <n>    Report a token estimate when you only have one number.
  --tokens-in <n>
  --tokens-out <n>
  --url <base>    Ping this origin instead of STALEAGENT_BASE_URL or https://staleagent.com.

The dry-run report is written to stderr so it stays separate from the command.
`;

function takeValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value == null || value.startsWith("--")) return { error: `${flag} needs a value` };
  return { value };
}

function parseNumber(raw, flag, integer) {
  if (integer && !/^\d+$/.test(raw)) return { error: `${flag} must be a whole number` };
  if (!integer && !/^\d+(\.\d+)?$/.test(raw)) return { error: `${flag} must be a number` };
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return { error: `${flag} must be zero or more` };
  return { value };
}

export function parseArgs(argv) {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") return { help: true };
  if (argv[0] === "--version" || argv[0] === "-v") return { version: true };
  if (argv[0] !== "run") return { error: "Unknown command. Use: staleagent run <token> -- <command>" };
  if (argv[1] === "--help" || argv[1] === "-h") return { help: true };

  const rest = argv.slice(1);
  const options = {
    dryRun: false,
    noHash: false,
    cost: undefined,
    tokens: undefined,
    tokensIn: undefined,
    tokensOut: undefined,
    url: undefined,
  };
  const positionals = [];
  let command = null;

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "--") {
      command = rest.slice(i + 1);
      break;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--no-hash") {
      options.noHash = true;
      continue;
    }
    if (arg === "--cost" || arg === "--tokens" || arg === "--tokens-in" || arg === "--tokens-out" || arg === "--url") {
      const next = takeValue(rest, i, arg);
      if (next.error) return next;
      i += 1;
      if (arg === "--url") {
        options.url = next.value;
        continue;
      }
      const parsed = parseNumber(next.value, arg, arg !== "--cost");
      if (parsed.error) return parsed;
      if (arg === "--cost") options.cost = parsed.value;
      if (arg === "--tokens") options.tokens = parsed.value;
      if (arg === "--tokens-in") options.tokensIn = parsed.value;
      if (arg === "--tokens-out") options.tokensOut = parsed.value;
      continue;
    }
    if (arg.startsWith("--")) return { error: `Unknown flag ${arg}` };
    positionals.push(arg);
  }

  if (positionals.length !== 1) return { error: "Pass the check token before --." };
  if (!command || command.length === 0) return { error: "Pass a command after --." };
  return { ...options, token: positionals[0], command };
}

export async function execute(argv, deps) {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    deps.stderr.write(HELP);
    return 0;
  }
  if (parsed.version) {
    deps.stdout.write("0.1.0\n");
    return 0;
  }
  if (parsed.error) {
    deps.stderr.write(`${parsed.error}\n\n${HELP}`);
    return 2;
  }

  const base = String(parsed.url || deps.env.STALEAGENT_BASE_URL || "https://staleagent.com").replace(/\/$/, "");
  const encoded = encodeURIComponent(parsed.token);
  const startUrl = `${base}/p/${encoded}/start`;
  const started = startBody();
  if (!parsed.dryRun) {
    try {
      await deps.post(startUrl, started);
    } catch (error) {
      const message = error instanceof Error ? error.message : "request failed";
      deps.stderr.write(`staleagent: start ping failed (${message}). The command will still run.\n`);
    }
  }

  const result = await deps.runCommand(parsed.command);
  const finishKind = result.exitCode === 0 ? "ok" : "fail";
  const finishUrl = `${base}/p/${encoded}/${finishKind}`;
  const body = completionBody(result, parsed);
  if (parsed.dryRun) {
    deps.stderr.write(formatDryRun({ startUrl, startBody: started, finishUrl, finishBody: body }));
  } else {
    try {
      await deps.post(finishUrl, body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "request failed";
      deps.stderr.write(`staleagent: result ping failed (${message}).\n`);
    }
  }
  return result.exitCode ?? 1;
}

export { HELP };
