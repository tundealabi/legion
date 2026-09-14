import type { PersonaAction } from "../../contracts/persona.js";
import { createIssueOnBoard, openBoard } from "./board.js";

export const createIssue: PersonaAction = async (page, _ctx, helpers) => {
  await openBoard(page);
  const bracket = helpers.latency();
  bracket.start();
  await createIssueOnBoard(page, helpers);
  bracket.elapsedMs();
};
