import path from "node:path";

import { z } from "zod";

import { loadAccounts } from "../config/load-accounts.js";
import { loadCampaignConfig } from "../config/load-campaign.js";
import { botId } from "../contracts/brands.js";
import { createJsonlSink } from "../logging/jsonl-sink.js";
import { stubPingActions } from "./stub-ping.js";
import { runWorker } from "./worker.js";

const workerEnvSchema = z.object({
  LEGION_CAMPAIGN: z.string().min(1),
  LEGION_WORKER_ID: z.string().min(1),
  LEGION_BOT_OFFSET: z
    .string()
    .regex(/^\d+$/)
    .transform((value) => Number(value)),
  LEGION_BOT_COUNT: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform((value) => Number(value)),
});

async function main(): Promise<void> {
  const env = workerEnvSchema.parse(process.env);
  const campaign = await loadCampaignConfig(env.LEGION_CAMPAIGN);
  const accounts = await loadAccounts(
    path.resolve(campaign.accounts.seed_file),
  );
  const end = env.LEGION_BOT_OFFSET + env.LEGION_BOT_COUNT;
  if (accounts.length < end) {
    throw new Error(
      `need ${String(end)} accounts, seed file has ${String(accounts.length)}`,
    );
  }

  const slice = accounts.slice(env.LEGION_BOT_OFFSET, end);
  const bots = slice.map((account, index) => ({
    botId: botId(`bot-${String(env.LEGION_BOT_OFFSET + index)}`),
    account,
    actions: stubPingActions,
  }));

  const sink = await createJsonlSink({
    directory: path.resolve(campaign.log.directory),
    workerId: env.LEGION_WORKER_ID,
  });

  const controller = new AbortController();
  const onStop = (): void => {
    controller.abort();
  };
  process.on("SIGTERM", onStop);
  process.on("SIGINT", onStop);

  try {
    await runWorker({
      bots,
      thinkTime: campaign.think_time_ms,
      sink,
      signal: controller.signal,
    });
  } finally {
    process.off("SIGTERM", onStop);
    process.off("SIGINT", onStop);
    await sink.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`worker-main: failed: ${message}`);
  process.exitCode = 1;
});
