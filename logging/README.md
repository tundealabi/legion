# logging

JSONL sink for Phase 1 campaign logs. One `LogSink` instance owns one file; workers must not share a mutable log path.

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
- Stats script and Loki adapters land in later phases.
