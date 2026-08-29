import { type ChildProcess, fork } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadAccounts } from "../config/load-accounts.js";
import { loadCampaignConfig } from "../config/load-campaign.js";
import type { SupervisorLogRecord } from "../contracts/log.js";
import { sleep } from "../engine/think-time.js";
import { createJsonlSink } from "../logging/jsonl-sink.js";
import { consumeControlCommand } from "./control-file.js";
import { type WorkerSlice, workerSlices } from "./slices.js";

const workerMain = fileURLToPath(
  new URL("../engine/worker-main.js", import.meta.url),
);

export async function runSupervisor(campaignPath: string): Promise<void> {
  const resolvedCampaign = path.resolve(campaignPath);
  const campaign = await loadCampaignConfig(resolvedCampaign);
  const accounts = await loadAccounts(
    path.resolve(campaign.accounts.seed_file),
  );
  const logDirectory = path.resolve(campaign.log.directory);
  const flagFile = path.resolve(campaign.control.flag_file);

  const sink = await createJsonlSink({
    directory: logDirectory,
    fileName: "supervisor.jsonl",
  });

  const children = new Map<string, ChildProcess>();
  let epoch = 0;
  let stopping = false;
  let desiredBotCount = campaign.bot_count;

  const emit = async (
    event: SupervisorLogRecord["event"],
    extra: {
      worker_id?: string;
      bot_count?: number;
      detail?: string;
    } = {},
  ): Promise<void> => {
    const record: SupervisorLogRecord = {
      kind: "supervisor",
      timestamp: new Date().toISOString(),
      event,
    };
    if (extra.worker_id !== undefined) {
      record.worker_id = extra.worker_id;
    }
    if (extra.bot_count !== undefined) {
      record.bot_count = extra.bot_count;
    }
    if (extra.detail !== undefined) {
      record.detail = extra.detail;
    }
    await sink.append(record);
  };

  const waitForExit = (child: ChildProcess): Promise<void> =>
    new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve();
        return;
      }
      child.once("exit", () => {
        resolve();
      });
    });

  const killAll = async (): Promise<void> => {
    const live = [...children.values()];
    for (const child of live) {
      child.kill("SIGTERM");
    }
    await Promise.all(live.map(waitForExit));
    children.clear();
  };

  const spawnSlice = (slice: WorkerSlice, spawnEpoch: number): void => {
    const child = fork(workerMain, [], {
      env: {
        ...process.env,
        LEGION_CAMPAIGN: resolvedCampaign,
        LEGION_WORKER_ID: slice.workerId,
        LEGION_BOT_OFFSET: String(slice.offset),
        LEGION_BOT_COUNT: String(slice.count),
      },
    });
    children.set(slice.workerId, child);
    void emit("worker_started", {
      worker_id: slice.workerId,
      bot_count: slice.count,
    });

    child.once("exit", (code, signal) => {
      children.delete(slice.workerId);
      const crashed = code !== 0 && signal !== "SIGTERM";
      if (crashed) {
        void emit("worker_crashed", {
          worker_id: slice.workerId,
          detail: `code=${String(code)} signal=${String(signal)}`,
        });
      } else {
        void emit("worker_stopped", { worker_id: slice.workerId });
      }

      if (stopping || spawnEpoch !== epoch) {
        return;
      }
      if (!crashed) {
        return;
      }
      void (async () => {
        await sleep(1000);
        if (stopping || spawnEpoch !== epoch) {
          return;
        }
        void emit("worker_restarted", { worker_id: slice.workerId });
        spawnSlice(slice, spawnEpoch);
      })();
    });
  };

  const startWorkers = (botCount: number): void => {
    if (accounts.length < botCount) {
      throw new Error(
        `need ${String(botCount)} accounts, seed file has ${String(accounts.length)}`,
      );
    }
    epoch += 1;
    const spawnEpoch = epoch;
    for (const slice of workerSlices(botCount, campaign.group_size)) {
      spawnSlice(slice, spawnEpoch);
    }
  };

  const requestStop = async (): Promise<void> => {
    if (stopping) {
      return;
    }
    stopping = true;
    epoch += 1;
    await killAll();
    await emit("campaign_stopped", { bot_count: desiredBotCount });
  };

  try {
    startWorkers(desiredBotCount);

    let durationTimer: ReturnType<typeof setTimeout> | undefined;
    if (campaign.duration_ms !== undefined) {
      durationTimer = setTimeout(() => {
        void requestStop();
      }, campaign.duration_ms);
    }

    const onSig = (): void => {
      void requestStop();
    };
    process.on("SIGTERM", onSig);
    process.on("SIGINT", onSig);

    try {
      while (!stopping) {
        let command;
        try {
          command = await consumeControlCommand(flagFile);
        } catch (error: unknown) {
          const detail = error instanceof Error ? error.message : String(error);
          console.error(`legion: bad flag file: ${detail}`);
          await requestStop();
          break;
        }
        if (command?.op === "stop") {
          await requestStop();
          break;
        }
        if (command?.op === "scale") {
          desiredBotCount = command.bot_count;
          epoch += 1;
          await killAll();
          startWorkers(desiredBotCount);
          await emit("scale", { bot_count: desiredBotCount });
        }
        await sleep(100);
      }
    } finally {
      process.off("SIGTERM", onSig);
      process.off("SIGINT", onSig);
      if (durationTimer !== undefined) {
        clearTimeout(durationTimer);
      }
    }
  } finally {
    if (!stopping) {
      await requestStop();
    }
    await sink.close();
  }
}
