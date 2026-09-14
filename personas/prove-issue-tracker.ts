import { chromium } from "playwright";

import { actionId, botId } from "../contracts/brands.js";
import type { PersonaConfig } from "../contracts/campaign.js";
import type { BotEntityMemory } from "../contracts/persona.js";
import { createActionHelpers } from "../engine/helpers.js";
import { addComment } from "./issue-tracker/add-comment.js";
import { createIssue } from "./issue-tracker/create-issue.js";
import { issueTrackerModule } from "./issue-tracker/index.js";
import {
  columnTestId,
  issueTestId,
  testIds,
} from "./issue-tracker/locators.js";
import { loginIssueTracker } from "./issue-tracker/login.js";
import { moveCard } from "./issue-tracker/move-card.js";
import { resolveCampaignPersonas } from "./resolve.js";
import { serveIssueTrackerFixture } from "./serve-fixture.js";

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function proveResolve(): void {
  const personas: PersonaConfig[] = [
    {
      name: "issue-tracker",
      weight: 2,
      actions: {
        create_issue: 3,
        add_comment: 2,
        move_card: 1,
      },
    },
  ];
  const resolved = resolveCampaignPersonas(personas, {
    "issue-tracker": issueTrackerModule,
  });
  assertEqual(resolved.login, issueTrackerModule.login, "resolved.login");
  assertEqual(resolved.actions.length, 3, "resolved.length");
  assertEqual(resolved.actions[0]?.name, "create_issue", "resolved[0].name");
  assertEqual(resolved.actions[0]?.weight, 6, "create_issue.weight");
  assertEqual(resolved.actions[1]?.weight, 4, "add_comment.weight");
  assertEqual(resolved.actions[2]?.weight, 2, "move_card.weight");

  try {
    resolveCampaignPersonas(
      [{ name: "nope", weight: 1, actions: { ping: 1 } }],
      {
        "issue-tracker": issueTrackerModule,
      },
    );
    throw new Error("expected unknown persona to throw");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("unknown persona module: nope")) {
      throw error;
    }
  }

  try {
    resolveCampaignPersonas(
      [
        {
          name: "issue-tracker",
          weight: 1,
          actions: { create_issue: 1 },
        },
        {
          name: "other",
          weight: 1,
          actions: { create_issue: 1 },
        },
      ],
      {
        "issue-tracker": issueTrackerModule,
        other: {
          login: () => Promise.resolve(),
          actions: issueTrackerModule.actions,
        },
      },
    );
    throw new Error("expected mixed logins to throw");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("share one login")) {
      throw error;
    }
  }
}

async function main(): Promise<void> {
  proveResolve();

  const fixture = await serveIssueTrackerFixture();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await loginIssueTracker(
      page,
      { username: "bot-a", password: "prove" },
      fixture.url,
    );
    if (!(await page.getByTestId(testIds.board).isVisible())) {
      throw new Error("login did not reveal the board");
    }

    const memory: BotEntityMemory = { byType: {} };
    const ctx = {
      botId: botId("bot-prove"),
      account: { username: "bot-a", password: "prove" },
      memory,
      actionId: actionId("act-create"),
    };

    const created = createActionHelpers({
      botId: ctx.botId,
      actionId: ctx.actionId,
      memory,
    });
    await createIssue(page, ctx, created.helpers);
    const createdWrites = created.drainIntendedWrites();
    const titleWrite = createdWrites[0];
    if (titleWrite === undefined) {
      throw new Error("create_issue logged no intended write");
    }
    assertEqual(titleWrite.field, "title", "create.field");
    if (!titleWrite.value_written.startsWith("Issue [")) {
      throw new Error(`unexpected title ${titleWrite.value_written}`);
    }
    const issueId = titleWrite.entity_id;
    assertEqual(memory.byType["issue"]?.[0], issueId, "remembered issue");
    await page.getByTestId(issueTestId(issueId)).waitFor({ state: "visible" });

    const commented = createActionHelpers({
      botId: ctx.botId,
      actionId: actionId("act-comment"),
      memory,
    });
    await addComment(
      page,
      { ...ctx, actionId: actionId("act-comment") },
      commented.helpers,
    );
    const commentWrite = commented.drainIntendedWrites()[0];
    if (commentWrite === undefined) {
      throw new Error("add_comment logged no intended write");
    }
    assertEqual(commentWrite.entity_id, issueId, "comment.entity_id");
    assertEqual(commentWrite.field, "comment_body", "comment.field");
    await page
      .getByTestId(testIds.commentList)
      .getByText(commentWrite.value_written, { exact: true })
      .waitFor({ state: "visible" });

    const moved = createActionHelpers({
      botId: ctx.botId,
      actionId: actionId("act-move"),
      memory,
    });
    await moveCard(
      page,
      { ...ctx, actionId: actionId("act-move") },
      moved.helpers,
    );
    const statusWrite = moved.drainIntendedWrites()[0];
    if (statusWrite === undefined) {
      throw new Error("move_card logged no intended write");
    }
    assertEqual(statusWrite.field, "status", "move.field");
    assertEqual(statusWrite.value_written, "in_progress", "move.status");
    await page
      .getByTestId(columnTestId.in_progress)
      .getByTestId(issueTestId(issueId))
      .waitFor({ state: "visible" });
  } finally {
    await page.close();
    await browser.close();
    await fixture.close();
  }

  console.log("prove-issue-tracker: ok");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`prove-issue-tracker: failed — ${message}`);
  process.exitCode = 1;
});
