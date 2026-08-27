# engine

Single-bot action loop for Phase 1. Each bot thinks, picks a weighted persona action, runs it against a Playwright `page`, then appends one `action` record to a `LogSink`.

```typescript
import { runBotLoop } from "./index.js";

await runBotLoop({
  page,
  botId,
  account,
  actions,
  thinkTime: { min_ms: 0, max_ms: 250 },
  sink,
  maxActions: 4,
});
```

- `pickAction` walks cumulative weights. An empty table throws.
- Think-time is not included in `latency_ms`.
- Failed actions are classified and logged. The loop continues until `maxActions` or `signal` abort.
- Grouped browser contexts (about 5 per worker) are not in this slice.

Prove with `node dist/engine/prove-bot-loop.js` after `pnpm run build`.
