import { z } from "zod";
import { Ga4ReportingService } from "@/server/features/ga4/services/Ga4ReportingService";
import { SearchOpportunityService } from "@/server/features/ga4/services/SearchOpportunityService";
import { Ga4ReportError } from "@/server/lib/ga4Errors";
import { GscNotConnectedError } from "@/server/lib/gscErrors";

export const searchAnalysisInputSchema = z
  .object({
    projectId: z.string().min(1),
    kind: z.enum([
      "opportunities",
      "landing_pages",
      "page_performance",
      "key_events",
      "traffic_acquisition",
      "ecommerce_performance",
      "site_search",
      "audience_breakdown",
    ]),
    startDate: z.iso.date().optional(),
    endDate: z.iso.date().optional(),
    channel: z.enum(["organic_search", "all"]).default("organic_search"),
    offset: z.number().int().nonnegative().default(0),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      Boolean(input.startDate) !== Boolean(input.endDate) ||
      (input.startDate && input.endDate && input.startDate > input.endDate)
    )
      context.addIssue({
        code: "custom",
        message: "Provide a valid start and end date together",
      });
    if (
      input.kind === "opportunities" &&
      (input.channel !== "organic_search" || input.offset !== 0)
    )
      context.addIssue({
        code: "custom",
        message:
          "Search opportunities use the organic search cohort without an offset",
      });
  });
export type SearchAnalysisInput = z.infer<typeof searchAnalysisInputSchema>;
async function report(projectId: string, raw: SearchAnalysisInput) {
  const input = searchAnalysisInputSchema.parse(raw);
  if (projectId !== input.projectId) throw new Error("FORBIDDEN");
  try {
    if (input.kind === "opportunities")
      return {
        status: "ready" as const,
        kind: "opportunities" as const,
        report: await SearchOpportunityService.getOpportunities({
          projectId,
          startDate: input.startDate,
          endDate: input.endDate,
        }),
      };
    const analytics = await Ga4ReportingService.runReport({
      ...input,
      kind: input.kind,
    });
    return {
      status: "ready" as const,
      kind: "analytics" as const,
      report: {
        ...analytics,
        diagnostics: z.array(z.json()).parse(analytics.diagnostics),
      },
    };
  } catch (error) {
    if (error instanceof GscNotConnectedError)
      return {
        status: "unavailable" as const,
        code: "gsc_not_connected" as const,
      };
    if (error instanceof Ga4ReportError)
      return { status: "unavailable" as const, code: error.code };
    throw error;
  }
}
export const SearchIntelligenceService = { report };
export type SearchAnalysisResult = Awaited<ReturnType<typeof report>>;
