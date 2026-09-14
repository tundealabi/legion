# Legion

Sustained multi-user browser simulation for staging environments. Legion drives real Playwright sessions as persistent "bots" that perform weighted-random actions over hours or days, logs structured client-side observability data, and (in later phases) detects concurrency bugs via an oracle.

**Only point this at infrastructure you own and have permission to test.**

## Status

Early Phase 1. Contracts, campaign loader, JSONL sink, bot loop, grouped contexts, supervisor CLI, JSONL stats, and issue-tracker personas are in place. Redis and the oracle are not.

See `[architecture.md](architecture.md)` for the full design, roadmap, and conventions.

After `pnpm run build`:

```bash
node dist/supervisor/cli.js start -c config/campaign.yaml
```

`stop` and `scale <n>` take the same `-c` flag. They write the campaign flag file. Bots log in through the target app's UI and run issue-tracker actions (`create_issue`, `add_comment`, `move_card`). Need at least `bot_count` entries in the accounts seed file. The app must match the locators in `personas/issue-tracker/`.

After a run, `node dist/logging/stats-main.js <log-directory>` prints actions/sec, error rates, and p95 latency from the JSONL files.

## Requirements

- Node.js 20+
- [pnpm](https://pnpm.io/) 9+

## Setup

```bash
pnpm install
```

Install Playwright browsers for the engine and supervisor prove scripts:

```bash
pnpm exec playwright install chromium
```

## Scripts

| Command                 | Description               |
| ----------------------- | ------------------------- |
| `pnpm run build`        | Compile TypeScript        |
| `pnpm run typecheck`    | Type-check without emit   |
| `pnpm run lint`         | ESLint                    |
| `pnpm run lint:fix`     | ESLint with auto-fix      |
| `pnpm run format`       | Prettier write            |
| `pnpm run format:check` | Prettier check            |
| `pnpm run check`        | lint + format + typecheck |

Pre-commit hooks run `pnpm run check` automatically (check only - no auto-fix on commit).

## Layout

```
contracts/   Shared types (persona API, campaign schema, log records)
config/      Campaign YAML loader and examples
engine/      Bot loop and Playwright driver (Phase 1+)
supervisor/  Worker management and CLI (Phase 1+)
personas/    Target-app action functions
logging/     JSONL sink and stats (Phase 1+)
```

## Target apps

Teams integrating an app with Legion should read `[docs/target-app-requirements.md](docs/target-app-requirements.md)`.

## License

[MIT](LICENSE)
