import type {
  PersonaAction,
  ResolvedPersonaAction,
} from "../contracts/persona.js";

const ping: PersonaAction = async (page, ctx, helpers) => {
  await page.goto("about:blank");
  helpers.latency().start();
  helpers.logIntendedWrite({
    entity_id: ctx.botId,
    field: "ping",
    value_written: "1",
  });
  helpers.latency().elapsedMs();
};

/** Placeholder until issue-tracker personas land. */
export const stubPingActions: ResolvedPersonaAction[] = [
  { name: "ping", weight: 1, run: ping },
];
