# personas

TypeScript actions for a target app. Campaign YAML picks the module and weights. The engine never learns the UI.

Issue-tracker v1: `create_issue`, `add_comment`, `move_card`. Each bot logs in through the real login page, then acts on issues it created. No Redis. `add_comment` and `move_card` will create an issue first if this bot has none yet.

```typescript
import type { PersonaAction } from "../contracts/persona.js";

export const createIssue: PersonaAction = async (page, _ctx, helpers) => {
  const title = helpers.taggedText("Issue");
  helpers.latency().start();
  await page.getByRole("button", { name: "Create issue" }).click();
  // fill, save, wait for the row, then:
  helpers.logIntendedWrite({
    entity_id: issueId,
    field: "title",
    value_written: title,
  });
  helpers.rememberEntity("issue", issueId);
};
```

Point `target_url` at an app that implements the locators in `issue-tracker/locators.ts` (and `issue-tracker/fixture.html` if you want the contract in one place). Prefer `data-testid`. Role plus accessible name is the fallback. No CSS or XPath.

`worker-main` resolves `campaign.personas` against `personaRegistries`. Each module ships its own `login` plus action map. A second app is another folder and a new key in that map. One campaign still needs a single login, so mixed target apps in one YAML file throw.

Prove with a local fixture, no staging app: `pnpm run build && node dist/personas/prove-issue-tracker.js`.
