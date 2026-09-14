import type { PersonaModule } from "../contracts/persona.js";
import { issueTrackerModule } from "./issue-tracker/index.js";

export {
  issueTrackerModule,
  issueTrackerRegistry,
  loginIssueTracker,
} from "./issue-tracker/index.js";
export { resolveCampaignPersonas } from "./resolve.js";
export { serveIssueTrackerFixture } from "./serve-fixture.js";

export const personaRegistries: Readonly<Record<string, PersonaModule>> = {
  "issue-tracker": issueTrackerModule,
};
