import type { PersonaAction } from "../../contracts/persona.js";
import { ensureOwnIssue, openBoard } from "./board.js";
import {
  columnTestId,
  type IssueStatus,
  issueTestId,
  testIds,
} from "./locators.js";

function nextStatus(current: string): IssueStatus {
  if (current === "todo") {
    return "in_progress";
  }
  if (current === "in_progress") {
    return "done";
  }
  return "todo";
}

export const moveCard: PersonaAction = async (page, _ctx, helpers) => {
  const issueId = await ensureOwnIssue(page, helpers);
  await openBoard(page);

  const bracket = helpers.latency();
  bracket.start();
  await page.getByTestId(issueTestId(issueId)).click();
  const status = page.getByTestId(testIds.issueStatus);
  const current = await status.inputValue();
  const next = nextStatus(current);
  await status.selectOption(next);
  await page
    .getByTestId(columnTestId[next])
    .getByTestId(issueTestId(issueId))
    .waitFor({ state: "visible" });
  bracket.elapsedMs();

  helpers.logIntendedWrite({
    entity_id: issueId,
    field: "status",
    value_written: next,
  });
};
