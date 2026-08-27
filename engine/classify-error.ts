import type { LegionError } from "../contracts/log.js";

export function classifyError(error: unknown): LegionError {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);

  if (name === "TimeoutError" || message.includes("Timeout")) {
    return { type: "timeout_waiting", message };
  }

  if (
    message.includes("strict mode violation") ||
    message.includes("locator resolved to") ||
    message.includes("selector not found")
  ) {
    return { type: "selector_not_found", message };
  }

  if (
    name === "AssertionError" ||
    message.includes("assertion") ||
    message.includes("expect")
  ) {
    return { type: "assertion_failed", message };
  }

  return { type: "bot_crash", message };
}
