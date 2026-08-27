import { z } from "zod";

export const IntendedWriteSchema = z.object({
  bot_id: z.string().min(1),
  entity_id: z.string().min(1),
  field: z.string().min(1),
  value_written: z.string(),
  timestamp: z.string().datetime(),
  action_id: z.string().min(1),
});

export type IntendedWrite = z.infer<typeof IntendedWriteSchema>;

export type IntendedWriteInput = Pick<
  IntendedWrite,
  "entity_id" | "field" | "value_written"
>;
