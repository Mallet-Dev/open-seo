import { z } from "zod";
export const mapsSelectionSchema = z.object({
  campaignId: z.uuid().optional().catch(undefined),
  runId: z.uuid().optional().catch(undefined),
  scanId: z.uuid().optional().catch(undefined),
  mapsView: z.enum(["map", "scan"]).optional().catch(undefined),
});
export type MapsSelection = z.infer<typeof mapsSelectionSchema>;
