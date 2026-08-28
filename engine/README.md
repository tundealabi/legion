# engine

Single-bot action loop and grouped-context worker for Phase 1. Each bot thinks, picks a weighted persona action, runs it against a Playwright `page`, then appends one `action` record to a `LogSink`. A worker hosts several bots as isolated browser contexts in one Chromium process.

```typescript
import { runBotLoop, runWorker } from "./index.js";

await runWorker({
  bots,
  thinkTime: { min_ms: 0, max_ms: 250 },
  sink,
  maxActions: 4,
});
```

- `runWorker` launches one headless Chromium, one context per bot, and runs `runBotLoop` concurrently. One crash of that process takes the whole group.
- `pickAction` walks cumulative weights. An empty table throws. `runWorker` throws if `bots` is empty.
- Think-time is not included in `latency_ms`.
- Failed actions are classified and logged. The loop continues until `maxActions` or `signal` abort.
- Persona loading, UI login, and the supervisor CLI are not in this slice.

Prove the loop with `node dist/engine/prove-bot-loop.js` after `pnpm run build`. Prove the worker with `node dist/engine/prove-worker.js`.
