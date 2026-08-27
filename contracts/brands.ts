export type BotId = string & { readonly __brand: "BotId" };

export type ActionId = string & { readonly __brand: "ActionId" };

export function botId(value: string): BotId {
  if (value.length === 0) {
    throw new Error("bot id must be non-empty");
  }
  return value as BotId;
}

export function actionId(value: string): ActionId {
  if (value.length === 0) {
    throw new Error("action id must be non-empty");
  }
  return value as ActionId;
}
