import type { Page } from "playwright";

import type { BotAccount } from "../../contracts/persona.js";
import { appUrl, roles, testIds } from "./locators.js";

/** UI login once per browser context. Not a weighted campaign action. */
export async function loginIssueTracker(
  page: Page,
  account: BotAccount,
  targetUrl: string,
): Promise<void> {
  await page.goto(appUrl(targetUrl, "login"));
  await page.getByTestId(testIds.loginUsername).fill(account.username);
  await page.getByTestId(testIds.loginPassword).fill(account.password);
  await page.getByRole("button", { name: roles.signIn }).click();
  await page.getByTestId(testIds.board).waitFor({ state: "visible" });
}
