# Legion

Sustained multi-user browser simulation for staging environments. Legion drives real Playwright sessions as persistent "bots" that perform weighted-random actions over hours or days, logs structured client-side observability data, and (in later phases) detects concurrency bugs via an oracle.

**Only point this at infrastructure you own and have permission to test.**

## Status

Early Phase 1 - public contracts, campaign loader, JSONL log sink, and the single-bot engine action loop are in place. The supervisor is not implemented yet.

See `[architecture.md](architecture.md)` for the full design, roadmap, and conventions.

## Requirements

- Node.js 20+
- [pnpm](https://pnpm.io/) 9+

## Setup

```bash
pnpm install
```

Install Playwright browsers for the engine prove script:

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
