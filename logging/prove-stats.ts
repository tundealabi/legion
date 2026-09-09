import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ActionLogRecord, LogRecord } from "../contracts/log.js";
import { createJsonlSink } from "./jsonl-sink.js";
import { summarizeLogDirectory } from "./stats.js";

function iso(offsetSec: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, offsetSec)).toISOString();
}

function action(fields: {
  timestamp: string;
  bot_id: string;
  action_name: string;
  latency_ms: number;
  success: boolean;
  error?: ActionLogRecord["error"];
}): ActionLogRecord {
  const record: ActionLogRecord = {
    kind: "action",
    timestamp: fields.timestamp,
    bot_id: fields.bot_id,
    action_name: fields.action_name,
    target_entity_id: null,
    latency_ms: fields.latency_ms,
    success: fields.success,
    intended_writes: [],
  };
  if (fields.error !== undefined) {
    record.error = fields.error;
  }
  return record;
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function assertClose(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > 1e-9) {
    throw new Error(
      `${label}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

async function main(): Promise<void> {
  const directory = path.join(
    process.cwd(),
    ".legion",
    "prove-stats",
    `run-${String(Date.now())}`,
  );
  await mkdir(directory, { recursive: true });

  const worker0 = await createJsonlSink({ directory, workerId: "0" });
  const worker1 = await createJsonlSink({ directory, workerId: "1" });
  const supervisor = await createJsonlSink({
    directory,
    fileName: "supervisor.jsonl",
  });

  const botA: LogRecord[] = [
    action({
      timestamp: iso(0),
      bot_id: "bot-a",
      action_name: "create_issue",
      latency_ms: 10,
      success: true,
    }),
    action({
      timestamp: iso(1),
      bot_id: "bot-a",
      action_name: "create_issue",
      latency_ms: 20,
      success: true,
    }),
    action({
      timestamp: iso(2),
      bot_id: "bot-a",
      action_name: "create_issue",
      latency_ms: 30,
      success: true,
    }),
    action({
      timestamp: iso(3),
      bot_id: "bot-a",
      action_name: "create_issue",
      latency_ms: 40,
      success: true,
    }),
    action({
      timestamp: iso(4),
      bot_id: "bot-a",
      action_name: "create_issue",
      latency_ms: 50,
      success: false,
      error: { type: "timeout_waiting", message: "prove timeout" },
    }),
  ];

  const botB: LogRecord[] = [
    action({
      timestamp: iso(5),
      bot_id: "bot-b",
      action_name: "comment",
      latency_ms: 100,
      success: true,
    }),
    action({
      timestamp: iso(6),
      bot_id: "bot-b",
      action_name: "comment",
      latency_ms: 110,
      success: true,
    }),
    action({
      timestamp: iso(7),
      bot_id: "bot-b",
      action_name: "comment",
      latency_ms: 120,
      success: true,
    }),
    action({
      timestamp: iso(8),
      bot_id: "bot-b",
      action_name: "comment",
      latency_ms: 130,
      success: true,
    }),
    action({
      timestamp: iso(9),
      bot_id: "bot-b",
      action_name: "comment",
      latency_ms: 140,
      success: false,
      error: { type: "selector_not_found", message: "prove selector" },
    }),
    {
      kind: "console_error",
      timestamp: iso(9),
      bot_id: "bot-b",
      message: "ignored",
    },
  ];

  const supervisorRecords: LogRecord[] = [
    {
      kind: "supervisor",
      timestamp: iso(0),
      event: "worker_started",
      worker_id: "0",
      bot_count: 1,
    },
    {
      kind: "supervisor",
      timestamp: iso(0),
      event: "worker_started",
      worker_id: "1",
      bot_count: 1,
    },
    {
      kind: "supervisor",
      timestamp: iso(9),
      event: "campaign_stopped",
      bot_count: 2,
    },
  ];

  await Promise.all(botA.map((record) => worker0.append(record)));
  await Promise.all(botB.map((record) => worker1.append(record)));
  await Promise.all(
    supervisorRecords.map((record) => supervisor.append(record)),
  );
  await worker0.close();
  await worker1.close();
  await supervisor.close();

  await writeFile(path.join(directory, "worker-1.jsonl"), "not-json\n", {
    flag: "a",
  });

  const stats = await summarizeLogDirectory(directory);

  assertEqual(stats.actions, 10, "actions");
  assertEqual(stats.window_ms, 9000, "window_ms");
  if (stats.actions_per_sec === null) {
    throw new Error("actions_per_sec: expected a number");
  }
  assertClose(stats.actions_per_sec, 10 / 9, "actions_per_sec");

  assertEqual(stats.errors.count, 2, "errors.count");
  assertClose(stats.errors.rate, 0.2, "errors.rate");
  assertEqual(stats.error_by_type.length, 2, "error_by_type.length");
  const timeout = stats.error_by_type.find(
    (row) => row.type === "timeout_waiting",
  );
  const selector = stats.error_by_type.find(
    (row) => row.type === "selector_not_found",
  );
  if (timeout === undefined || selector === undefined) {
    throw new Error("error_by_type: missing expected types");
  }
  assertEqual(timeout.count, 1, "timeout_waiting.count");
  assertClose(timeout.rate, 0.1, "timeout_waiting.rate");
  assertEqual(selector.count, 1, "selector_not_found.count");
  assertClose(selector.rate, 0.1, "selector_not_found.rate");

  const createIssue = stats.p95_by_action.find(
    (row) => row.action_name === "create_issue",
  );
  const comment = stats.p95_by_action.find(
    (row) => row.action_name === "comment",
  );
  if (createIssue === undefined || comment === undefined) {
    throw new Error("p95_by_action: missing expected actions");
  }
  assertEqual(createIssue.count, 5, "create_issue.count");
  assertEqual(createIssue.p95_ms, 50, "create_issue.p95");
  assertEqual(comment.count, 5, "comment.count");
  assertEqual(comment.p95_ms, 140, "comment.p95");

  assertEqual(stats.bots.length, 2, "bots.length");
  const botAStats = stats.bots[0];
  const botBStats = stats.bots[1];
  if (botAStats === undefined || botBStats === undefined) {
    throw new Error("bots: missing rows");
  }
  assertEqual(botAStats.bot_id, "bot-a", "bot-a.id");
  assertEqual(botAStats.actions, 5, "bot-a.actions");
  assertEqual(botAStats.errors, 1, "bot-a.errors");
  assertEqual(botAStats.window_ms, 4000, "bot-a.window_ms");
  assertEqual(botAStats.p95_ms, 50, "bot-a.p95");
  assertEqual(botBStats.bot_id, "bot-b", "bot-b.id");
  assertEqual(botBStats.actions, 5, "bot-b.actions");
  assertEqual(botBStats.errors, 1, "bot-b.errors");
  assertEqual(botBStats.p95_ms, 140, "bot-b.p95");

  assertEqual(stats.supervisor_by_event.length, 2, "supervisor.length");
  const started = stats.supervisor_by_event.find(
    (row) => row.event === "worker_started",
  );
  const stopped = stats.supervisor_by_event.find(
    (row) => row.event === "campaign_stopped",
  );
  if (started === undefined || stopped === undefined) {
    throw new Error("supervisor: missing expected events");
  }
  assertEqual(started.count, 2, "worker_started.count");
  assertEqual(stopped.count, 1, "campaign_stopped.count");

  assertEqual(stats.skipped_lines, 1, "skipped_lines");

  console.log(`prove-stats: ok (${directory})`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`prove-stats: failed — ${message}`);
  process.exitCode = 1;
});
