import type { ResolvedPersonaAction } from "../contracts/persona.js";

export function pickAction(
  actions: ResolvedPersonaAction[],
  random: () => number = Math.random,
): ResolvedPersonaAction {
  const head = actions[0];
  if (head === undefined) {
    throw new Error("pickAction requires at least one action");
  }

  const total = actions.reduce((sum, action) => sum + action.weight, 0);

  const roll = random() * total;
  let cumulative = 0;
  for (const action of actions) {
    cumulative += action.weight;
    if (roll < cumulative) {
      return action;
    }
  }

  return actions[actions.length - 1] ?? head;
}
