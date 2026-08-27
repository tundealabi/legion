import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

import { botId } from "../contracts/brands.js";
import { parseLogRecord } from "../contracts/log.js";
import type {
  PersonaAction,
  ResolvedPersonaAction,
} from "../contracts/persona.js";
import { createJsonlSink } from "../logging/jsonl-sink.js";
import { runBotLoop } from "./bot-loop.js";

const succeed: PersonaAction = async (page, _ctx, helpers) => {
  await page.goto("about:blank");
  const bracket = helpers.latency();
  bracket.start();
  const title = helpers.taggedText("Issue");
  helpers.rememberEntity("issue", "issue-prove-1");
  helpers.logIntendedWrite({
    entity_id: "issue-prove-1",
    field: "title",
    value_written: title,
  });
  bracket.elapsedMs();
};

const fail: PersonaAction = async (page, _ctx, helpers) => {
  await page.goto("about:blank");
  helpers.latency().start();
  const error = new Error("Timeout 1ms exceeded");
  error.name = "TimeoutError";
  throw error;
};

const actions: ResolvedPersonaAction[] = [
  { name: "succeed", weight: 1, run: succeed },
  { name: "fail", weight: 1, run: fail },
];

async function main(): Promise<void> {
  const directory = path.join(
    process.cwd(),
    ".legion",
    "prove-bot-loop",
    `run-${String(Date.now())}`,
  );
  await mkdir(directory, { recursive: true });

  const workerId = "prove";
  const sink = await createJsonlSink({ directory, workerId });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let flip = false;
  const random = (): number => {
    flip = !flip;
    return flip ? 0 : 0.999999;
  };

  try {
    await runBotLoop({
      page,
      botId: botId("bot-prove"),
      account: { username: "prove", password: "prove" },
      actions,
      thinkTime: { min_ms: 0, max_ms: 0 },
      sink,
      maxActions: 4,
      random,
    });
  } finally {
    await page.close();
    await browser.close();
  }

  await sink.close();

  const filePath = path.join(directory, `worker-${workerId}.jsonl`);
  const text = await readFile(filePath, "utf8");
  const lines = text.split("\n").filter((line) => line.length > 0);

  const records = lines.map((line, index) => {
    try {
      return parseLogRecord(line);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `line ${String(index + 1)} failed parseLogRecord: ${detail}`,
      );
    }
  });

  const successWithWrites = records.some(
    (record) =>
      record.kind === "action" &&
      record.success &&
      record.intended_writes.length > 0,
  );
  const classifiedFailure = records.some(
    (record) =>
      record.kind === "action" &&
      record.success === false &&
      record.error !== undefined,
  );

  if (!successWithWrites) {
    throw new Error("expected a successful action with intended_writes");
  }
  if (!classifiedFailure) {
    throw new Error("expected a failed action with a classified error");
  }

  console.log(
    `prove-bot-loop: ok (${String(lines.length)} lines at ${filePath})`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`prove-bot-loop: failed: ${message}`);
  process.exitCode = 1;
});
