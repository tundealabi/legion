import type { ThinkTimeMs } from "../contracts/campaign.js";

export function thinkTimeMs(
  range: ThinkTimeMs,
  random: () => number = Math.random,
): number {
  // Constant range must not consume `random`; the loop shares one RNG with pickAction.
  if (range.min_ms === range.max_ms) {
    return range.min_ms;
  }
  const span = range.max_ms - range.min_ms + 1;
  return range.min_ms + Math.floor(random() * span);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
