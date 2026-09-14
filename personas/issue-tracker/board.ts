import type { Page } from "playwright";

import type { ActionHelpers } from "../../contracts/persona.js";
import { issueTestId, roles, testIds } from "./locators.js";

export async function openBoard(page: Page): Promise<void> {
  const board = page.getByTestId(testIds.board);
  if (await board.isVisible()) {
    return;
  }
  const origin = new URL(page.url()).origin;
  await page.goto(`${origin}/`);
  await board.waitFor({ state: "visible" });
}

export async function createIssueOnBoard(
  page: Page,
  helpers: ActionHelpers,
): Promise<{ issueId: string; title: string }> {
  const title = helpers.taggedText("Issue");
  await page.getByRole("button", { name: roles.createIssue }).click();
  await page.getByTestId(testIds.issueTitle).fill(title);
  await page.getByRole("button", { name: roles.saveIssue }).click();

  const row = page.getByTestId(testIds.issueRow).filter({ hasText: title });
  await row.waitFor({ state: "visible" });
  const issueId = await row.getAttribute("data-issue-id");
  if (issueId === null || issueId.length === 0) {
    throw new Error("created issue is missing data-issue-id");
  }

  await page.getByTestId(issueTestId(issueId)).waitFor({ state: "visible" });
  helpers.logIntendedWrite({
    entity_id: issueId,
    field: "title",
    value_written: title,
  });
  helpers.rememberEntity("issue", issueId);
  return { issueId, title };
}

export async function ensureOwnIssue(
  page: Page,
  helpers: ActionHelpers,
): Promise<string> {
  const existing = helpers.pickEntity("issue");
  if (existing !== undefined) {
    return existing;
  }
  await openBoard(page);
  const created = await createIssueOnBoard(page, helpers);
  return created.issueId;
}
