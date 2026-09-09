# logging

JSONL sink for Phase 1 campaign logs, plus a stats pass over those files. One `LogSink` instance owns one file; workers must not share a mutable log path.

```typescript
import { createJsonlSink } from "./index.js";
import type { LogRecord } from "../contracts/log.js";

const sink = await createJsonlSink({
  directory: ".legion/logs",
  workerId: "0",
});
// writes to .legion/logs/worker-0.jsonl

await sink.append(record satisfies LogRecord);
await sink.close();
```

- `append` serializes concurrent calls so lines never interleave mid-JSON.
- Consumers parse lines with `parseLogRecord` from `contracts/`.

## Stats

Reads every `*.jsonl` in a campaign log directory (`worker-*.jsonl` and `supervisor.jsonl` if present). Only `kind: "action"` lines feed action stats. Other kinds are ignored except supervisor events, which get a count-by-event line. Blank lines are ignored. Lines that fail `parseLogRecord` increment `skipped_lines`.

```bash
pnpm run build
node dist/logging/stats-main.js .legion/logs
```

Prints actions/sec over first-to-last action timestamp, error rate by `LegionError.type` (counts over all actions), nearest-rank p95 `latency_ms` per `action_name`, and the same cheap totals per bot.

actions/sec is `n/a` when every action shares one timestamp. p95 on five samples is the last sample (`ceil(n * 0.95)` nearest-rank).

jq if you would rather eyeball a file:

```bash
jq 'select(.kind=="action") | .latency_ms' .legion/logs/worker-0.jsonl
jq -s '[.[] | select(.kind=="action" and .success==false)] | length' .legion/logs/*.jsonl
```

Prove with `node dist/logging/prove-jsonl-sink.js` and `node dist/logging/prove-stats.js` after `pnpm run build`.
