import { z } from "zod";

export const dashboardProjectInputSchema = z.object({
  projectId: z.string().min(1),
});

export const dashboardBacklinkRefreshSchema =
  dashboardProjectInputSchema.extend({
    confirmedDomain: z.string().min(1),
    estimatedChargeUsd: z.number().finite().nonnegative(),
    estimatedCredits: z.number().int().nonnegative().nullable(),
  });
export type DashboardBacklinkRefreshInput = z.infer<
  typeof dashboardBacklinkRefreshSchema
>;
