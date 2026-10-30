# Contributing

Thanks for improving the StaleAgent CLI.

## Setup

Install Node.js 18 or newer. The CLI has no runtime dependencies and no install step.

```bash
git clone https://github.com/staleagent/staleagent-cli.git
cd staleagent-cli
npm test
node src/cli.js --help
```

`npm test` runs `node --test` on the files in `test/`.

To try a ping without sending it:

```bash
node src/cli.js run <token> --dry-run -- <command>
```

`--dry-run` still executes the command. It only skips the network, and it prints both requests on stderr.

## Pull requests

Open pull requests against `main`.

- Add or update tests for argument parsing and for the ping payload.
- Keep every posted JSON field inside the metadata allowlist in `src/payload.js`. The tests fail if a body contains anything else.
- Do not send prompts, command output, environment variables, files, or secrets. The check token belongs in the URL path only.
- Do not commit credentials, internal hosts, or references to private repositories.
- Run `npm test` before pushing.

## Security

Please report vulnerabilities to security@staleagent.com. See [SECURITY.md](SECURITY.md). Do not file a public issue for a security report.
