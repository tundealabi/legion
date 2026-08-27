import type { Page } from "playwright";

import type { ActionId, BotId } from "./brands.js";
import type { IntendedWriteInput } from "./intended-write.js";

export interface BotAccount {
  username: string;
  password: string;
  role?: string;
}

export interface BotEntityMemory {
  /** entity type (e.g. "issue") -> ids this bot created or is working on */
  byType: Record<string, string[]>;
}

export interface BotContext {
  botId: BotId;
  account: BotAccount;
  memory: BotEntityMemory;
  actionId: ActionId;
}

export interface LatencyBracket {
  /** Mark the first user interaction of an action. */
  start(): void;
  /** Milliseconds from start() to now. Throws if start() was not called. */
  elapsedMs(): number;
}

/** Phase 2: Redis-backed hot resource pool. Stubbed in Phase 1. */
export interface HotPool {
  pick(resourceType: string): Promise<string | null>;
  release(resourceId: string): Promise<void>;
  refresh(): Promise<void>;
}

export interface ActionHelpers {
  /** e.g. "Issue title b7-a3f9" — embeds a verifiable nonce for oracle checks */
  taggedText(prefix: string): string;
  nonce(): string;
  rememberEntity(entityType: string, entityId: string): void;
  forgetEntity(entityType: string, entityId: string): void;
  pickEntity(entityType: string): string | undefined;
  logIntendedWrite(input: IntendedWriteInput): void;
  latency(): LatencyBracket;
  hotPool: HotPool;
}

export type PersonaAction = (
  page: Page,
  ctx: BotContext,
  helpers: ActionHelpers,
) => Promise<void>;

/** Persona modules export named actions; YAML assigns weights at runtime. */
export type PersonaActionRegistry = Record<string, PersonaAction>;

export interface ResolvedPersonaAction {
  name: string;
  weight: number;
  run: PersonaAction;
}

export const stubHotPool: HotPool = {
  pick(_resourceType: string): Promise<string | null> {
    return Promise.resolve(null);
  },
  release(_resourceId: string): Promise<void> {
    return Promise.resolve();
  },
  refresh(): Promise<void> {
    return Promise.resolve();
  },
};
