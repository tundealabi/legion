import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { type LogRecord, parseLogRecord } from "../contracts/log.js";
import { createJsonlSink } from "./jsonl-sink.js";

async function main(): Promise<void> {
  const directory = path.join(
    process.cwd(),
    ".legion",
    "prove-jsonl",
    `run-${Date.now()}`,
  );
  await mkdir(directory, { recursive: true });

  const workerId = "prove";
  const sink = await createJsonlSink({ directory, workerId });

  const now = new Date().toISOString();
  const records: LogRecord[] = [
    {
      kind: "action",
      timestamp: now,
      bot_id: "bot-1",
      action_name: "create_issue",
      target_entity_id: "issue-1",
      latency_ms: 42,
      success: true,
      intended_writes: [
        {
          bot_id: "bot-1",
          entity_id: "issue-1",
          field: "title",
          value_written: "Prove JSONL sink",
          timestamp: now,
          action_id: "act-1",
        },
      ],
    },
    {
      kind: "console_error",
      timestamp: now,
      bot_id: "bot-1",
      message: "Uncaught Error: prove boom",
      source: "https://example.test/app.js:1",
    },
    {
      kind: "supervisor",
      timestamp: now,
      event: "worker_started",
      worker_id: workerId,
      bot_count: 1,
      detail: "prove-jsonl-sink",
    },
  ];

  await Promise.all(records.map((record) => sink.append(record)));
  await sink.close();
  await sink.close();

  const filePath = path.join(directory, `worker-${workerId}.jsonl`);
  const text = await readFile(filePath, "utf8");
  const lines = text.split("\n").filter((line) => line.length > 0);

  if (lines.length !== records.length) {
    throw new Error(
      `expected ${String(records.length)} JSONL lines, got ${String(lines.length)}`,
    );
  }

  for (const [index, line] of lines.entries()) {
    try {
      parseLogRecord(line);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `line ${String(index + 1)} failed parseLogRecord: ${detail}`,
      );
    }
  }

  console.log(
    `prove-jsonl-sink: ok (${String(lines.length)} lines at ${filePath})`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`prove-jsonl-sink: failed — ${message}`);
  process.exitCode = 1;
});
