# supervisor

Spawns worker processes, watches the campaign flag file, and exposes `legion start`, `legion stop`, and `legion scale <n>`.

```bash
pnpm run build
node dist/supervisor/cli.js start -c config/campaign.yaml
# elsewhere
node dist/supervisor/cli.js stop -c config/campaign.yaml
```

- `start` stays in the foreground until stop (flag file, SIGINT, SIGTERM, or `duration_ms`).
- `stop` writes `{ "op": "stop" }` to `control.flag_file`. The supervisor SIGTERMs workers, waits for them to finish the current action, then exits.
- `scale <n>` writes `{ "op": "scale", "bot_count": n }`. The supervisor tears down workers and brings up a new set. Need at least `n` seeded accounts.
- Each worker is `engine/worker-main.js`: one Chromium, `group_size` contexts, one JSONL file. Supervisor events go to `supervisor.jsonl`.
- Personas are still a stub `ping` on `about:blank`. Campaign YAML action names are ignored until issue-tracker personas land.

Crashed workers restart after 1s unless a stop or scale is in flight.

Prove with `node dist/supervisor/prove-supervisor.js` after `pnpm run build`.
