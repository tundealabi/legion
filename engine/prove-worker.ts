import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { botId } from "../contracts/brands.js";
import { parseLogRecord } from "../contracts/log.js";
import type {
  PersonaAction,
  ResolvedPersonaAction,
} from "../contracts/persona.js";
import { createJsonlSink } from "../logging/jsonl-sink.js";
import { runWorker } from "./worker.js";

const ping: PersonaAction = async (page, ctx, helpers) => {
  await page.goto("about:blank");
  helpers.latency().start();
  helpers.logIntendedWrite({
    entity_id: ctx.botId,
    field: "ping",
    value_written: "1",
  });
  helpers.latency().elapsedMs();
};

const actions: ResolvedPersonaAction[] = [
  { name: "ping", weight: 1, run: ping },
];

function abortableSleep(signal: AbortSignal) {
  return (ms: number): Promise<void> =>
    new Promise((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const timer = setTimeout(resolve, ms);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
}

function actionBotIds(fileText: string): string[] {
  const lines = fileText.split("\n").filter((line) => line.length > 0);
  return lines.map((line, index) => {
    try {
      const record = parseLogRecord(line);
      if (record.kind !== "action") {
        throw new Error(`line ${String(index + 1)} is not an action record`);
      }
      return record.bot_id;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`line ${String(index + 1)}: ${detail}`);
    }
  });
}

async function main(): Promise<void> {
  const directory = path.join(
    process.cwd(),
    ".legion",
    "prove-worker",
    `run-${String(Date.now())}`,
  );
  await mkdir(directory, { recursive: true });

  const groupedSink = await createJsonlSink({
    directory,
    workerId: "grouped",
  });
  const bots = ["bot-a", "bot-b", "bot-c"].map((id) => ({
    botId: botId(id),
    account: { username: id, password: "prove" },
    actions,
  }));

  try {
    await runWorker({
      bots,
      thinkTime: { min_ms: 0, max_ms: 0 },
      sink: groupedSink,
      maxActions: 2,
    });
  } finally {
    await groupedSink.close();
  }

  const groupedPath = path.join(directory, "worker-grouped.jsonl");
  const groupedIds = actionBotIds(await readFile(groupedPath, "utf8"));
  const unique = new Set(groupedIds);
  if (groupedIds.length !== 6) {
    throw new Error(
      `expected 6 action lines, got ${String(groupedIds.length)}`,
    );
  }
  if (unique.size !== 3) {
    throw new Error(`expected 3 bot ids, got ${String(unique.size)}`);
  }

  const abortSink = await createJsonlSink({ directory, workerId: "abort" });
  const controller = new AbortController();
  const abortBots = ["bot-d", "bot-e"].map((id) => ({
    botId: botId(id),
    account: { username: id, password: "prove" },
    actions,
  }));

  try {
    const running = runWorker({
      bots: abortBots,
      thinkTime: { min_ms: 60_000, max_ms: 60_000 },
      sink: abortSink,
      maxActions: 20,
      signal: controller.signal,
      sleep: abortableSleep(controller.signal),
    });
    controller.abort();
    await running;
  } finally {
    await abortSink.close();
  }

  const abortPath = path.join(directory, "worker-abort.jsonl");
  const abortIds = actionBotIds(await readFile(abortPath, "utf8"));
  if (abortIds.length !== 0) {
    throw new Error(
      `expected abort before any action, got ${String(abortIds.length)} lines`,
    );
  }

  console.log(`prove-worker: ok (${groupedPath})`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`prove-worker: failed: ${message}`);
  process.exitCode = 1;
});
