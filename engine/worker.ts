import { chromium, type Page } from "playwright";

import type { BotId } from "../contracts/brands.js";
import type { ThinkTimeMs } from "../contracts/campaign.js";
import type {
  BotAccount,
  ResolvedPersonaAction,
} from "../contracts/persona.js";
import type { LogSink } from "../logging/sink.js";
import { runBotLoop, type RunBotLoopOptions } from "./bot-loop.js";

export interface WorkerBot {
  botId: BotId;
  account: BotAccount;
  actions: ResolvedPersonaAction[];
}

export interface RunWorkerOptions {
  bots: WorkerBot[];
  thinkTime: ThinkTimeMs;
  sink: LogSink;
  signal?: AbortSignal;
  maxActions?: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

function loopOptions(
  page: Page,
  bot: WorkerBot,
  options: RunWorkerOptions,
): RunBotLoopOptions {
  const loop: RunBotLoopOptions = {
    page,
    botId: bot.botId,
    account: bot.account,
    actions: bot.actions,
    thinkTime: options.thinkTime,
    sink: options.sink,
  };
  if (options.signal !== undefined) {
    loop.signal = options.signal;
  }
  if (options.maxActions !== undefined) {
    loop.maxActions = options.maxActions;
  }
  if (options.now !== undefined) {
    loop.now = options.now;
  }
  if (options.sleep !== undefined) {
    loop.sleep = options.sleep;
  }
  return loop;
}

export async function runWorker(options: RunWorkerOptions): Promise<void> {
  if (options.bots[0] === undefined) {
    throw new Error("runWorker requires at least one bot");
  }

  const browser = await chromium.launch({ headless: true });

  try {
    await Promise.all(
      options.bots.map(async (bot) => {
        const context = await browser.newContext();
        try {
          const page = await context.newPage();
          await runBotLoop(loopOptions(page, bot, options));
        } finally {
          await context.close().catch(() => undefined);
        }
      }),
    );
  } finally {
    await browser.close().catch(() => undefined);
  }
}
