import type {
  PersonaActionRegistry,
  PersonaModule,
} from "../../contracts/persona.js";
import { addComment } from "./add-comment.js";
import { createIssue } from "./create-issue.js";
import { loginIssueTracker } from "./login.js";
import { moveCard } from "./move-card.js";

export { loginIssueTracker } from "./login.js";

export const issueTrackerRegistry: PersonaActionRegistry = {
  create_issue: createIssue,
  add_comment: addComment,
  move_card: moveCard,
};

export const issueTrackerModule: PersonaModule = {
  login: loginIssueTracker,
  actions: issueTrackerRegistry,
};
