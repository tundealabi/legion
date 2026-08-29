import { randomUUID } from "node:crypto";

import type { Page } from "playwright";

import { actionId, type BotId } from "../contracts/brands.js";
import type { ThinkTimeMs } from "../contracts/campaign.js";
import type { ActionLogRecord } from "../contracts/log.js";
import type {
  ActionHelpers,
  BotAccount,
  BotEntityMemory,
  ResolvedPersonaAction,
} from "../contracts/persona.js";
import type { LogSink } from "../logging/sink.js";
import { classifyError } from "./classify-error.js";
import { createActionHelpers } from "./helpers.js";
import { pickAction } from "./pick-action.js";
import { sleep as defaultSleep, thinkTimeMs } from "./think-time.js";

export interface RunBotLoopOptions {
  page: Page;
  botId: BotId;
  account: BotAccount;
  actions: ResolvedPersonaAction[];
  thinkTime: ThinkTimeMs;
  sink: LogSink;
  signal?: AbortSignal;
  maxActions?: number;
  now?: () => Date;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

function readLatencyMs(helpers: ActionHelpers): number {
  try {
    return helpers.latency().elapsedMs();
  } catch {
    return 0;
  }
}

export async function runBotLoop(options: RunBotLoopOptions): Promise<void> {
  const now = options.now ?? (() => new Date());
  const random = options.random ?? Math.random;
  const sleep =
    options.sleep ?? ((ms: number) => defaultSleep(ms, options.signal));
  const memory: BotEntityMemory = { byType: {} };
  const aborted = (): boolean => options.signal?.aborted === true;

  for (
    let completed = 0;
    options.maxActions === undefined || completed < options.maxActions;
    completed += 1
  ) {
    if (aborted()) {
      return;
    }

    const waitMs = thinkTimeMs(options.thinkTime, random);
    if (waitMs !== 0) {
      await sleep(waitMs);
    }

    if (aborted()) {
      return;
    }

    const action = pickAction(options.actions, random);
    const id = actionId(randomUUID());
    const session = createActionHelpers({
      botId: options.botId,
      actionId: id,
      memory,
    });
    const helpers = session.helpers;

    const ctx = {
      botId: options.botId,
      account: options.account,
      memory,
      actionId: id,
    };

    try {
      await action.run(options.page, ctx, helpers);
      const intended_writes = session.drainIntendedWrites();
      const record: ActionLogRecord = {
        kind: "action",
        timestamp: now().toISOString(),
        bot_id: options.botId,
        action_name: action.name,
        target_entity_id: intended_writes[0]?.entity_id ?? null,
        latency_ms: readLatencyMs(helpers),
        success: true,
        intended_writes,
      };
      await options.sink.append(record);
    } catch (error: unknown) {
      const intended_writes = session.drainIntendedWrites();
      const record: ActionLogRecord = {
        kind: "action",
        timestamp: now().toISOString(),
        bot_id: options.botId,
        action_name: action.name,
        target_entity_id: intended_writes[0]?.entity_id ?? null,
        latency_ms: readLatencyMs(helpers),
        success: false,
        error: classifyError(error),
        intended_writes,
      };
      await options.sink.append(record);
    }
  }
}
