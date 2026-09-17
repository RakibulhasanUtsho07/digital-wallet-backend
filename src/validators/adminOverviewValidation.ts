import { z } from "zod";

export const adminOverviewQuerySchema = z.object({
  range: z.enum(["7d", "30d", "90d", "1y"]).default("30d"),
}).strict();

export type AdminOverviewQuery = z.infer<typeof adminOverviewQuerySchema>;

