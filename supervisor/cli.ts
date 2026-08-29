#!/usr/bin/env node

import { loadCampaignConfig } from "../config/load-campaign.js";
import { writeControlCommand } from "./control-file.js";
import { parseCliArgs } from "./parse-args.js";
import { runSupervisor } from "./run.js";

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (parsed.command === "start") {
    await runSupervisor(parsed.configPath);
    return;
  }

  const campaign = await loadCampaignConfig(parsed.configPath);
  if (parsed.command === "stop") {
    await writeControlCommand(campaign.control.flag_file, { op: "stop" });
    return;
  }

  await writeControlCommand(campaign.control.flag_file, {
    op: "scale",
    bot_count: parsed.botCount,
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`legion: ${message}`);
  process.exitCode = 1;
});
