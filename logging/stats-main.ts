#!/usr/bin/env node

import path from "node:path";

import { formatCampaignStats, summarizeLogDirectory } from "./stats.js";

async function main(): Promise<void> {
  const raw = process.argv[2];
  if (raw === undefined || raw.length === 0) {
    throw new Error("usage: node dist/logging/stats-main.js <log-directory>");
  }
  const stats = await summarizeLogDirectory(path.resolve(raw));
  process.stdout.write(formatCampaignStats(stats));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`legion-stats: ${message}`);
  process.exitCode = 1;
});
