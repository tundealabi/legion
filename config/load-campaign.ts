import { readFile } from "node:fs/promises";

import { parse } from "yaml";

import {
  type CampaignConfig,
  campaignConfigSchema,
} from "../contracts/campaign.js";

export async function loadCampaignConfig(
  path: string,
): Promise<CampaignConfig> {
  const raw = await readFile(path, "utf8");
  const document: unknown = parse(raw);
  return campaignConfigSchema.parse(document);
}
