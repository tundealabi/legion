import { z } from "zod";

const thinkTimeMsSchema = z
  .object({
    min_ms: z.number().int().nonnegative(),
    max_ms: z.number().int().nonnegative(),
  })
  .refine((value) => value.max_ms >= value.min_ms, {
    message: "think_time_ms.max_ms must be >= min_ms",
  });

export const personaConfigSchema = z.object({
  /** Maps to personas/<name>/ module */
  name: z.string().min(1),
  /** Relative weight vs other personas in this campaign */
  weight: z.number().positive(),
  think_time_ms: thinkTimeMsSchema.optional(),
  /** action name -> weight within this persona */
  actions: z.record(z.string().min(1), z.number().positive()),
});

export const botAccountSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  role: z.string().min(1).optional(),
});

export const campaignConfigSchema = z.object({
  target_url: z.string().url(),
  bot_count: z.number().int().positive(),
  group_size: z.number().int().positive().default(5),
  /** Omit for run-until-stopped campaigns */
  duration_ms: z.number().int().positive().optional(),
  think_time_ms: thinkTimeMsSchema,
  campaign_type: z
    .enum(["collision", "growth", "traffic_scale"])
    .default("collision"),
  personas: z.array(personaConfigSchema).min(1),
  accounts: z.object({
    /** JSON file: array of { username, password, role? } */
    seed_file: z.string().min(1),
  }),
  log: z.object({
    sink: z.literal("jsonl"),
    directory: z.string().min(1),
  }),
  control: z
    .object({
      flag_file: z.string().min(1).default(".legion/stop"),
    })
    .default({ flag_file: ".legion/stop" }),
});

export type ThinkTimeMs = z.infer<typeof thinkTimeMsSchema>;
export type PersonaConfig = z.infer<typeof personaConfigSchema>;
export type BotAccountSeed = z.infer<typeof botAccountSchema>;
export type CampaignConfig = z.infer<typeof campaignConfigSchema>;

export type CampaignConfigInput = z.input<typeof campaignConfigSchema>;
