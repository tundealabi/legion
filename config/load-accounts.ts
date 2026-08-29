import { readFile } from "node:fs/promises";

import { botAccountSchema } from "../contracts/campaign.js";
import type { BotAccount } from "../contracts/persona.js";

export async function loadAccounts(path: string): Promise<BotAccount[]> {
  const raw = await readFile(path, "utf8");
  const document: unknown = JSON.parse(raw);
  return botAccountSchema
    .array()
    .min(1)
    .parse(document)
    .map((account) => {
      const mapped: BotAccount = {
        username: account.username,
        password: account.password,
      };
      if (account.role !== undefined) {
        mapped.role = account.role;
      }
      return mapped;
    });
}
