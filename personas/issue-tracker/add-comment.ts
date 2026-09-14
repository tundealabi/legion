import type { PersonaAction } from "../../contracts/persona.js";
import { ensureOwnIssue, openBoard } from "./board.js";
import { issueTestId, roles, testIds } from "./locators.js";

export const addComment: PersonaAction = async (page, _ctx, helpers) => {
  const issueId = await ensureOwnIssue(page, helpers);
  await openBoard(page);
  const body = helpers.taggedText("Comment");

  const bracket = helpers.latency();
  bracket.start();
  await page.getByTestId(issueTestId(issueId)).click();
  await page.getByTestId(testIds.commentBody).fill(body);
  await page.getByRole("button", { name: roles.addComment }).click();
  await page
    .getByTestId(testIds.commentList)
    .getByText(body, { exact: true })
    .waitFor({ state: "visible" });
  bracket.elapsedMs();

  helpers.logIntendedWrite({
    entity_id: issueId,
    field: "comment_body",
    value_written: body,
  });
};
