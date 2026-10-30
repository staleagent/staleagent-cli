# staleagent

Metadata-only command wrapper for [StaleAgent](https://staleagent.com), healthchecks for scheduled AI agents.

`staleagent` runs a command you already schedule, then pings that agent's check. The ping carries run metadata: exit code, duration, stdout and stderr sizes, an optional SHA-256 of stdout, and optional token and cost numbers. Prompts, command output, environment variables, and API keys stay on the machine.

## Install

npm publish is pending, so `staleagent` is not on the registry yet. After it is published:

```bash
npx staleagent run <token> -- <command>
npm i -g staleagent
```

Until then, clone this repository and run the entrypoint with Node.js 18 or newer:

```bash
git clone https://github.com/staleagent/staleagent-cli.git
cd staleagent-cli
node src/cli.js run <token> -- <command>
```

The package has no dependencies.

## Usage

```bash
staleagent run <token> -- <command>
```

`<token>` is the check token from StaleAgent. The CLI posts to `https://staleagent.com/p/<token>/start`, then to `/ok` or `/fail`. Pass the token itself, not a full URL. Everything after `--` is the command and its arguments.

```bash
staleagent run <token> -- python agent.py
staleagent run <token> --dry-run --no-hash -- node agent.js --inbox
```

Flags go before `--`. Anything after `--` is left untouched for your command.

| Flag | Effect |
| --- | --- |
| `--dry-run` | Run the command and print both HTTP requests on stderr. Nothing is sent. |
| `--no-hash` | Omit `output_hash` from the finish ping. |
| `--cost <usd>` | Report this cost as `cost_usd`. |
| `--tokens <n>` | Report a single token estimate as `tokens_in`. |
| `--tokens-in <n>` | Report input tokens. Overrides `--tokens` and any parsed input count. |
| `--tokens-out <n>` | Report output tokens. |
| `--url <base>` | Ping this origin instead of `STALEAGENT_BASE_URL` or `https://staleagent.com`. |
| `-h`, `--help` | Print help. |
| `-v`, `--version` | Print the version. |

The process exits with the command's exit code. A failed ping prints a warning on stderr and does not change that code. If the start ping fails, the command still runs.

If stdout contains a usage summary, the wrapper reads the last `input_tokens`, `output_tokens`, and `total_cost_usd` or `cost_usd` locally. Both `input_tokens: 1200` and `"input_tokens": 1200` match. Flags override parsed numbers. `--tokens` fills `tokens_in` only.

## What gets sent

The default origin is `https://staleagent.com`. `--url` wins over `STALEAGENT_BASE_URL`. A trailing slash on the origin is removed.

`--dry-run` still runs the command, including its side effects. It prints the requests on stderr so they stay out of stdout, and it does not open a network connection. That transcript shows the URL, `content-type`, `user-agent`, and JSON body. Use it to inspect the body before a real run. `--no-hash` drops the stdout hash from that body.

Without `--dry-run`, two POSTs leave the machine:

1. `POST /p/<token>/start` when the command starts.
2. `POST /p/<token>/ok` when the exit code is 0, otherwise `POST /p/<token>/fail`.

The check token is URL-encoded and appears only in that path. It is not a JSON field.

Both live requests send these headers (`accept` is sent on the wire; the dry-run transcript does not print it):

- `content-type: application/json`
- `accept: application/json`
- `user-agent: staleagent/0.1.0`

**Start body**

| Field | Value |
| --- | --- |
| `source` | `"cli"` |
| `client_version` | `"0.1.0"` |

**Finish body**

| Field | Sent |
| --- | --- |
| `exit_code` | Always. The command's exit code. |
| `duration_ms` | Always. Wall-clock duration of the command. |
| `output_bytes` | Always. Stdout length in bytes. |
| `err_bytes` | Always. Stderr length in bytes. |
| `output_hash` | SHA-256 of stdout, used to spot repeated output. Omitted with `--no-hash`. |
| `cost_usd` | `--cost`, otherwise the last cost parsed from local stdout. Omitted when neither is present. |
| `tokens_in` | `--tokens-in`, otherwise `--tokens`, otherwise the last `input_tokens` value parsed from local stdout. Omitted when none are present. |
| `tokens_out` | `--tokens-out`, otherwise the last `output_tokens` value parsed from local stdout. Omitted when neither is present. |
| `source` | Always `"cli"`. |
| `client_version` | Always `"0.1.0"`. |

No other JSON fields are sent. While the command runs, the wrapper keeps an in-memory tail of stdout (the last 64KB) solely to parse those usage numbers. The tail is discarded and is not uploaded. Stderr is counted and is not hashed, stored, or uploaded.

These never leave the machine:

- prompts and command arguments
- stdout and stderr text
- environment variables
- API keys and files

The wrapped command inherits the parent environment so it can run. The wrapper does not copy that environment into the ping. The stdout hash cannot be turned back into the output.

Example finish body, with illustrative values:

```json
{
  "exit_code": 0,
  "duration_ms": 842,
  "output_bytes": 1532,
  "err_bytes": 0,
  "output_hash": "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  "cost_usd": 0.02,
  "tokens_in": 1200,
  "tokens_out": 340,
  "source": "cli",
  "client_version": "0.1.0"
}
```

`cost_usd`, `tokens_in`, `tokens_out`, and `output_hash` appear only when the rules above include them.

## Development

```bash
npm test
```

Tests use the built-in `node:test` runner. Contribution guidelines are in [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities to security@staleagent.com as described in [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).

## Links

- Product: https://staleagent.com
- Docs: https://staleagent.com/docs
- Issues: https://github.com/staleagent/staleagent-cli/issues
