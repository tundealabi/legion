import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  type LegionErrorType,
  type LogRecord,
  parseLogRecord,
  type SupervisorLogRecord,
} from "../contracts/log.js";

export type CountRate = {
  readonly count: number;
  readonly rate: number;
};

export type ErrorTypeStats = {
  readonly type: LegionErrorType;
  readonly count: number;
  readonly rate: number;
};

export type ActionLatencyStats = {
  readonly action_name: string;
  readonly count: number;
  readonly p95_ms: number;
};

export type SupervisorEventStats = {
  readonly event: SupervisorLogRecord["event"];
  readonly count: number;
};

export type BotStats = {
  readonly bot_id: string;
  readonly actions: number;
  readonly errors: number;
  readonly window_ms: number | null;
  readonly actions_per_sec: number | null;
  readonly p95_ms: number | null;
};

export type CampaignStats = {
  readonly actions: number;
  readonly errors: CountRate;
  readonly window_ms: number | null;
  readonly actions_per_sec: number | null;
  readonly error_by_type: readonly ErrorTypeStats[];
  readonly p95_by_action: readonly ActionLatencyStats[];
  readonly bots: readonly BotStats[];
  readonly supervisor_by_event: readonly SupervisorEventStats[];
  readonly skipped_lines: number;
};

type BotAcc = {
  timestamps: number[];
  latencies: number[];
  errors: number;
};

/** Nearest-rank percentile. Empty samples throw. */
export function percentileNearestRank(
  samples: readonly number[],
  p: number,
): number {
  if (samples.length === 0) {
    throw new Error("percentile of empty sample");
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil(p * sorted.length);
  const index = Math.max(1, Math.min(sorted.length, rank)) - 1;
  const value = sorted[index];
  if (value === undefined) {
    throw new Error("percentile index out of range");
  }
  return value;
}

function windowMs(timestamps: readonly number[]): number | null {
  if (timestamps.length === 0) {
    return null;
  }
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const ts of timestamps) {
    if (ts < min) {
      min = ts;
    }
    if (ts > max) {
      max = ts;
    }
  }
  return max - min;
}

function actionsPerSec(count: number, window_ms: number | null): number | null {
  if (count === 0) {
    return 0;
  }
  if (window_ms === null || window_ms === 0) {
    return null;
  }
  return count / (window_ms / 1000);
}

function rate(count: number, total: number): number {
  if (total === 0) {
    return 0;
  }
  return count / total;
}

export function summarizeRecords(
  records: readonly LogRecord[],
  skipped_lines = 0,
): CampaignStats {
  const timestamps: number[] = [];
  const latenciesByAction = new Map<string, number[]>();
  const errorCounts = new Map<LegionErrorType, number>();
  const bots = new Map<string, BotAcc>();
  const supervisorCounts = new Map<SupervisorLogRecord["event"], number>();
  let actions = 0;
  let errors = 0;

  const botAcc = (bot_id: string): BotAcc => {
    const existing = bots.get(bot_id);
    if (existing !== undefined) {
      return existing;
    }
    const created: BotAcc = { timestamps: [], latencies: [], errors: 0 };
    bots.set(bot_id, created);
    return created;
  };

  for (const record of records) {
    if (record.kind === "supervisor") {
      const prev = supervisorCounts.get(record.event) ?? 0;
      supervisorCounts.set(record.event, prev + 1);
      continue;
    }
    if (record.kind !== "action") {
      continue;
    }

    actions += 1;
    const ts = Date.parse(record.timestamp);
    timestamps.push(ts);

    const actionLatencies = latenciesByAction.get(record.action_name);
    if (actionLatencies === undefined) {
      latenciesByAction.set(record.action_name, [record.latency_ms]);
    } else {
      actionLatencies.push(record.latency_ms);
    }

    const bot = botAcc(record.bot_id);
    bot.timestamps.push(ts);
    bot.latencies.push(record.latency_ms);

    if (!record.success) {
      errors += 1;
      bot.errors += 1;
    }
    if (record.error !== undefined) {
      const prev = errorCounts.get(record.error.type) ?? 0;
      errorCounts.set(record.error.type, prev + 1);
    }
  }

  const window_ms = windowMs(timestamps);
  const error_by_type = [...errorCounts.entries()]
    .map(([type, count]) => ({ type, count, rate: rate(count, actions) }))
    .sort((a, b) => a.type.localeCompare(b.type));

  const p95_by_action = [...latenciesByAction.entries()]
    .map(([action_name, latencies]) => ({
      action_name,
      count: latencies.length,
      p95_ms: percentileNearestRank(latencies, 0.95),
    }))
    .sort((a, b) => a.action_name.localeCompare(b.action_name));

  const botStats: BotStats[] = [...bots.entries()]
    .map(([bot_id, acc]) => {
      const botWindow = windowMs(acc.timestamps);
      return {
        bot_id,
        actions: acc.latencies.length,
        errors: acc.errors,
        window_ms: botWindow,
        actions_per_sec: actionsPerSec(acc.latencies.length, botWindow),
        p95_ms:
          acc.latencies.length === 0
            ? null
            : percentileNearestRank(acc.latencies, 0.95),
      };
    })
    .sort((a, b) => a.bot_id.localeCompare(b.bot_id));

  const supervisor_by_event = [...supervisorCounts.entries()]
    .map(([event, count]) => ({ event, count }))
    .sort((a, b) => a.event.localeCompare(b.event));

  return {
    actions,
    errors: { count: errors, rate: rate(errors, actions) },
    window_ms,
    actions_per_sec: actionsPerSec(actions, window_ms),
    error_by_type,
    p95_by_action,
    bots: botStats,
    supervisor_by_event,
    skipped_lines,
  };
}

export function summarizeJsonl(text: string): CampaignStats {
  const records: LogRecord[] = [];
  let skipped_lines = 0;
  for (const line of text.split("\n")) {
    if (line.length === 0) {
      continue;
    }
    try {
      records.push(parseLogRecord(line));
    } catch {
      skipped_lines += 1;
    }
  }
  return summarizeRecords(records, skipped_lines);
}

export async function summarizeLogDirectory(
  directory: string,
): Promise<CampaignStats> {
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".jsonl"))
    .sort((a, b) => a.localeCompare(b));

  const records: LogRecord[] = [];
  let skipped_lines = 0;
  for (const name of names) {
    const text = await readFile(path.join(directory, name), "utf8");
    for (const line of text.split("\n")) {
      if (line.length === 0) {
        continue;
      }
      try {
        records.push(parseLogRecord(line));
      } catch {
        skipped_lines += 1;
      }
    }
  }
  return summarizeRecords(records, skipped_lines);
}

function fmtRate(value: number | null): string {
  if (value === null) {
    return "n/a";
  }
  return value.toFixed(3);
}

function fmtMs(value: number | null): string {
  if (value === null) {
    return "n/a";
  }
  return String(value);
}

export function formatCampaignStats(stats: CampaignStats): string {
  const lines: string[] = [
    `actions: ${String(stats.actions)}`,
    `window_ms: ${fmtMs(stats.window_ms)}`,
    `actions/sec: ${fmtRate(stats.actions_per_sec)}`,
    `errors: ${String(stats.errors.count)} (${fmtRate(stats.errors.rate)} of actions)`,
  ];

  if (stats.error_by_type.length === 0) {
    lines.push("error by type: (none)");
  } else {
    lines.push("error by type:");
    for (const row of stats.error_by_type) {
      lines.push(`  ${row.type}: ${String(row.count)} (${fmtRate(row.rate)})`);
    }
  }

  if (stats.p95_by_action.length === 0) {
    lines.push("p95 latency_ms: (none)");
  } else {
    lines.push("p95 latency_ms:");
    for (const row of stats.p95_by_action) {
      lines.push(
        `  ${row.action_name}: ${String(row.p95_ms)} (n=${String(row.count)})`,
      );
    }
  }

  if (stats.bots.length === 0) {
    lines.push("per bot: (none)");
  } else {
    lines.push("per bot:");
    for (const bot of stats.bots) {
      lines.push(
        `  ${bot.bot_id}: ${String(bot.actions)} actions, ${String(bot.errors)} errors, ${fmtRate(bot.actions_per_sec)}/sec, p95 ${fmtMs(bot.p95_ms)}ms`,
      );
    }
  }

  if (stats.supervisor_by_event.length === 0) {
    lines.push("supervisor: (none)");
  } else {
    lines.push("supervisor:");
    for (const row of stats.supervisor_by_event) {
      lines.push(`  ${row.event}: ${String(row.count)}`);
    }
  }

  lines.push(`skipped_lines: ${String(stats.skipped_lines)}`);
  lines.push("");
  return lines.join("\n");
}
