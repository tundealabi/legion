import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

export const controlCommandSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("stop") }),
  z.object({
    op: z.literal("scale"),
    bot_count: z.number().int().positive(),
  }),
]);

export type ControlCommand = z.infer<typeof controlCommandSchema>;

export async function writeControlCommand(
  flagFile: string,
  command: ControlCommand,
): Promise<void> {
  const resolved = path.resolve(flagFile);
  await mkdir(path.dirname(resolved), { recursive: true });
  const temp = `${resolved}.${String(process.pid)}.tmp`;
  await writeFile(temp, `${JSON.stringify(command)}\n`, "utf8");
  await rename(temp, resolved);
}

export async function consumeControlCommand(
  flagFile: string,
): Promise<ControlCommand | undefined> {
  const resolved = path.resolve(flagFile);
  let raw: string;
  try {
    raw = await readFile(resolved, "utf8");
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }

  await unlink(resolved);

  const document: unknown = JSON.parse(raw);
  return controlCommandSchema.parse(document);
}
