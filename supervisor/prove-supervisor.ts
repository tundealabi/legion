import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseLogRecord } from "../contracts/log.js";
import { sleep } from "../engine/think-time.js";

const cliPath = fileURLToPath(new URL("./cli.js", import.meta.url));

function supervisorEvents(text: string): string[] {
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line, index) => {
      const record = parseLogRecord(line);
      if (record.kind !== "supervisor") {
        throw new Error(`line ${String(index + 1)} is not a supervisor record`);
      }
      return record.event;
    });
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function waitForFileMatch(
  filePath: string,
  match: (text: string) => boolean,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const text = await readFile(filePath, "utf8");
      if (match(text)) {
        return;
      }
    } catch (error: unknown) {
      if (!isEnoent(error)) {
        throw error;
      }
    }
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function waitForEvent(
  filePath: string,
  event: string,
  timeoutMs: number,
): Promise<void> {
  await waitForFileMatch(
    filePath,
    (text) => supervisorEvents(text).includes(event),
    timeoutMs,
    `supervisor event ${event}`,
  );
}

async function waitForActionLog(
  filePath: string,
  timeoutMs: number,
): Promise<void> {
  await waitForFileMatch(
    filePath,
    (text) =>
      text.split("\n").some((line) => {
        if (line.length === 0) {
          return false;
        }
        const record = parseLogRecord(line);
        return record.kind === "action";
      }),
    timeoutMs,
    `action log ${filePath}`,
  );
}

function waitExit(
  child: ReturnType<typeof spawn>,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolve({ code, signal });
    });
  });
}

async function main(): Promise<void> {
  const directory = path.join(
    process.cwd(),
    ".legion",
    "prove-supervisor",
    `run-${String(Date.now())}`,
  );
  await mkdir(directory, { recursive: true });

  const campaignPath = path.join(directory, "campaign.yaml");
  const accountsPath = path.join(directory, "accounts.json");
  const logDirectory = path.join(directory, "logs");
  const flagFile = path.join(directory, "stop");

  await writeFile(
    accountsPath,
    `${JSON.stringify([
      { username: "bot-a", password: "prove" },
      { username: "bot-b", password: "prove" },
    ])}\n`,
    "utf8",
  );

  await writeFile(
    campaignPath,
    `target_url: https://example.com
bot_count: 2
group_size: 2
think_time_ms:
  min_ms: 0
  max_ms: 0
campaign_type: collision
personas:
  - name: stub
    weight: 1
    actions:
      ping: 1
accounts:
  seed_file: ${JSON.stringify(accountsPath)}
log:
  sink: jsonl
  directory: ${JSON.stringify(logDirectory)}
control:
  flag_file: ${JSON.stringify(flagFile)}
`,
    "utf8",
  );

  const start = spawn(
    process.execPath,
    [cliPath, "start", "-c", campaignPath],
    {
      stdio: "inherit",
    },
  );
  const startExit = waitExit(start);
  const supervisorLog = path.join(logDirectory, "supervisor.jsonl");

  try {
    await waitForEvent(supervisorLog, "worker_started", 60_000);
    await waitForActionLog(path.join(logDirectory, "worker-0.jsonl"), 60_000);
    const stop = spawn(
      process.execPath,
      [cliPath, "stop", "-c", campaignPath],
      {
        stdio: "inherit",
      },
    );
    const stopped = await waitExit(stop);
    if (stopped.code !== 0) {
      throw new Error(`legion stop exited ${String(stopped.code)}`);
    }
    const finished = await startExit;
    if (finished.code !== 0) {
      throw new Error(`legion start exited ${String(finished.code)}`);
    }
  } catch (error: unknown) {
    start.kill("SIGTERM");
    await startExit.catch(() => undefined);
    throw error;
  }

  const events = supervisorEvents(await readFile(supervisorLog, "utf8"));
  if (!events.includes("worker_started")) {
    throw new Error("missing worker_started");
  }
  if (!events.includes("campaign_stopped")) {
    throw new Error("missing campaign_stopped");
  }

  console.log(`prove-supervisor: ok (${supervisorLog})`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`prove-supervisor: failed: ${message}`);
  process.exitCode = 1;
});
