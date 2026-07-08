import { z } from "zod";

export const cancellationTierSchema = z.object({
  days_before: z.number().int().min(0).max(365),
  forfeit_percent: z.number().min(0).max(100),
});

export const cancellationRuleSchema = z.object({
  mode: z.enum(["standard", "dynamic"]).optional(),
  non_refundable: z.boolean().optional(),
  tiers: z.array(cancellationTierSchema).optional(),
  date_ranges: z
    .array(
      z.object({
        start: z.string(),
        end: z.string(),
        days_before: z.number().optional(),
        forfeit_percent: z.number().optional(),
      }),
    )
    .optional(),
  dynamic_factors: z.array(z.string()).optional(),
  ai_prompt_override: z.string().nullable().optional(),
  // Manual-entry extras (Nightsbridge-style panel)
  deposit_percent: z.number().min(0).max(100).optional(),
  one_night_refundable: z.boolean().optional(),
  full_payment_within_days: z.number().int().min(0).max(365).optional(),
  additional_terms: z.string().optional(),
  manual_override: z.boolean().optional(),
});

export type CancellationRuleShape = z.infer<typeof cancellationRuleSchema>;
