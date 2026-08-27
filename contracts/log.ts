import { z } from "zod";

import { IntendedWriteSchema } from "./intended-write.js";

export const legionErrorTypeSchema = z.enum([
  "selector_not_found",
  "timeout_waiting",
  "bot_crash",
  "assertion_failed",
  "network_request_failed",
  "console_error_observed",
  "oracle_violation",
]);

export type LegionErrorType = z.infer<typeof legionErrorTypeSchema>;

export const isBotSideError = (type: LegionErrorType): boolean =>
  type === "selector_not_found" ||
  type === "timeout_waiting" ||
  type === "bot_crash";

export const legionErrorSchema = z.object({
  type: legionErrorTypeSchema,
  message: z.string(),
  /** Set when classification is ambiguous; defaults bot-side per architecture.md §16 */
  review_flag: z.boolean().optional(),
});

export type LegionError = z.infer<typeof legionErrorSchema>;

const baseRecordSchema = z.object({
  timestamp: z.string().datetime(),
});

export const actionLogRecordSchema = baseRecordSchema.extend({
  kind: z.literal("action"),
  bot_id: z.string().min(1),
  action_name: z.string().min(1),
  target_entity_id: z.string().nullable(),
  latency_ms: z.number().nonnegative(),
  success: z.boolean(),
  error: legionErrorSchema.optional(),
  trace_id: z.string().optional(),
  request_id: z.string().optional(),
  intended_writes: z.array(IntendedWriteSchema),
});

export type ActionLogRecord = z.infer<typeof actionLogRecordSchema>;

export const consoleErrorRecordSchema = baseRecordSchema.extend({
  kind: z.literal("console_error"),
  bot_id: z.string().min(1),
  message: z.string(),
  source: z.string().optional(),
});

export type ConsoleErrorRecord = z.infer<typeof consoleErrorRecordSchema>;

export const requestFailedRecordSchema = baseRecordSchema.extend({
  kind: z.literal("request_failed"),
  bot_id: z.string().min(1),
  url: z.string(),
  method: z.string(),
  failure_text: z.string(),
});

export type RequestFailedRecord = z.infer<typeof requestFailedRecordSchema>;

export const supervisorEventSchema = z.enum([
  "worker_started",
  "worker_stopped",
  "worker_crashed",
  "worker_restarted",
  "campaign_stopped",
  "scale",
]);

export const supervisorLogRecordSchema = baseRecordSchema.extend({
  kind: z.literal("supervisor"),
  event: supervisorEventSchema,
  worker_id: z.string().optional(),
  bot_count: z.number().int().nonnegative().optional(),
  detail: z.string().optional(),
});

export type SupervisorLogRecord = z.infer<typeof supervisorLogRecordSchema>;

/** Phase 2+: oracle verdicts and in-bot read-back checks */
export const oracleVerdictSchema = z.enum([
  "consistent",
  "superseded",
  "indeterminate",
  "violation",
]);

export const oracleVerdictRecordSchema = baseRecordSchema.extend({
  kind: z.literal("oracle_verdict"),
  verdict: oracleVerdictSchema,
  entity_id: z.string(),
  field: z.string(),
  bot_ids: z.array(z.string()),
  action_ids: z.array(z.string()),
  trace_ids: z.array(z.string()).optional(),
  detail: z.string().optional(),
});

export type OracleVerdictRecord = z.infer<typeof oracleVerdictRecordSchema>;

export const readBackRecordSchema = baseRecordSchema.extend({
  kind: z.literal("read_back"),
  bot_id: z.string().min(1),
  entity_id: z.string(),
  field: z.string(),
  expected: z.string(),
  observed: z.string().nullable(),
  consistent: z.boolean(),
  action_id: z.string(),
});

export type ReadBackRecord = z.infer<typeof readBackRecordSchema>;

export const logRecordSchema = z.discriminatedUnion("kind", [
  actionLogRecordSchema,
  consoleErrorRecordSchema,
  requestFailedRecordSchema,
  supervisorLogRecordSchema,
  oracleVerdictRecordSchema,
  readBackRecordSchema,
]);

export type LogRecord = z.infer<typeof logRecordSchema>;

/** Parse one JSONL line at a log consumer boundary. */
export function parseLogRecord(line: string): LogRecord {
  const json: unknown = JSON.parse(line);
  return logRecordSchema.parse(json);
}
