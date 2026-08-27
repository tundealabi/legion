import { randomBytes } from "node:crypto";

import type { ActionId, BotId } from "../contracts/brands.js";
import type {
  IntendedWrite,
  IntendedWriteInput,
} from "../contracts/intended-write.js";
import {
  type ActionHelpers,
  type BotEntityMemory,
  type HotPool,
  type LatencyBracket,
  stubHotPool,
} from "../contracts/persona.js";

export function createActionHelpers(options: {
  botId: BotId;
  actionId: ActionId;
  memory: BotEntityMemory;
  hotPool?: HotPool;
}): {
  helpers: ActionHelpers;
  drainIntendedWrites(): IntendedWrite[];
} {
  const { botId, actionId, memory } = options;
  const hotPool = options.hotPool ?? stubHotPool;
  const buffer: IntendedWrite[] = [];
  let startedAt: number | undefined;

  const nonce = (): string => randomBytes(4).toString("hex");

  const latency: LatencyBracket = {
    start(): void {
      startedAt = Date.now();
    },
    elapsedMs(): number {
      if (startedAt === undefined) {
        throw new Error("latency.start() was not called");
      }
      return Date.now() - startedAt;
    },
  };

  const helpers: ActionHelpers = {
    taggedText(prefix: string): string {
      return `${prefix} [${nonce()}]`;
    },
    nonce,
    rememberEntity(entityType: string, entityId: string): void {
      const existing = memory.byType[entityType];
      if (existing === undefined) {
        memory.byType[entityType] = [entityId];
        return;
      }
      if (!existing.includes(entityId)) {
        existing.push(entityId);
      }
    },
    forgetEntity(entityType: string, entityId: string): void {
      const existing = memory.byType[entityType];
      if (existing === undefined) {
        return;
      }
      memory.byType[entityType] = existing.filter((id) => id !== entityId);
    },
    pickEntity(entityType: string): string | undefined {
      const ids = memory.byType[entityType];
      if (ids === undefined || ids.length === 0) {
        return undefined;
      }
      return ids[ids.length - 1];
    },
    logIntendedWrite(input: IntendedWriteInput): void {
      buffer.push({
        entity_id: input.entity_id,
        field: input.field,
        value_written: input.value_written,
        bot_id: botId,
        action_id: actionId,
        timestamp: new Date().toISOString(),
      });
    },
    latency(): LatencyBracket {
      return latency;
    },
    hotPool,
  };

  const drainIntendedWrites = (): IntendedWrite[] => {
    const writes = buffer.splice(0, buffer.length);
    return writes;
  };

  return { helpers, drainIntendedWrites };
}
