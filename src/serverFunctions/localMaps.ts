import { env } from "cloudflare:workers";
import { AppError } from "@/server/lib/errors";
import { MapsScanService } from "@/server/features/local-maps/services/MapsScanService";
import { MapsCollectionService } from "@/server/features/local-maps/services/MapsCollectionService";
import { MapsPublicationService } from "@/server/features/local-maps/services/MapsPublicationService";
import { MapsRepository } from "@/server/features/local-maps/repositories/MapsRepository";
import {
  mapsScanInputSchema,
  mapsCostQuoteSchema,
} from "@/shared/maps-collection";
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  MapsService,
  mapsCampaignInputSchema,
  mapsSaveInputSchema,
} from "@/server/features/local-maps/services/MapsService";
const projectInput = z.object({ projectId: z.string().min(1) });
export const listMapsCampaigns = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectInput)
  .handler(({ context }) => MapsService.list(context));
export const createMapsCampaign = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectInput.extend({ campaign: mapsCampaignInputSchema }))
  .handler(({ context, data }) => MapsService.create(context, data.campaign));
export const saveMapsFixture = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectInput.extend({ input: mapsSaveInputSchema }))
  .handler(({ context, data }) => MapsService.save(context, data.input));
export const getMapsHistory = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectInput.extend({ campaignId: z.uuid() }))
  .handler(({ context, data }) =>
    MapsService.history(context, data.campaignId),
  );
export const getMapsRun = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectInput.extend({ runId: z.uuid() }))
  .handler(({ context, data }) => MapsService.read(context, data.runId));

const scanInput = projectInput.extend({ scanId: z.uuid() }).strict();
export const listMapsScans = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectInput.extend({ campaignId: z.uuid() }).strict())
  .handler(async ({ context, data }) => ({
    scans: (await MapsScanService.list(context, data.campaignId)).map(
      (item) => item.scan,
    ),
    languageCode: context.project.languageCode,
    providerConfigured: Boolean(env.DATAFORSEO_API_KEY?.trim()),
  }));
export const prepareMapsScan = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    scanInput.extend({ campaignId: z.uuid(), request: mapsScanInputSchema }),
  )
  .handler(({ context, data }) =>
    MapsScanService.prepare(
      context,
      data.scanId,
      data.campaignId,
      data.request,
    ),
  );
export const getMapsScan = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(scanInput)
  .handler(async ({ context, data }) => {
    const saved = await MapsCollectionService.read(context, data.scanId);
    const published = await MapsRepository.read(context, data.scanId);
    return {
      scan: saved.scan,
      spec: saved.spec,
      organizationId: context.organizationId,
      publishedRunId:
        published?.saved.scanRequestId === data.scanId ? data.scanId : null,
      points: saved.collection.map(({ point, receipt, observation }) => ({
        point,
        receipt,
        observation: observation
          ? {
              taskId: observation.taskId,
              receivedAt: observation.receivedAt,
              providerObservedAt: observation.providerObservedAt,
              itemsCount: observation.itemsCount,
              businessResults: observation.rows.length,
            }
          : null,
      })),
    };
  });
export const getMapsScanPoint = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(scanInput.extend({ ordinal: z.number().int().nonnegative() }))
  .handler(({ context, data }) =>
    MapsCollectionService.point(context, data.scanId, data.ordinal),
  );
export const quoteMapsScan = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(scanInput)
  .handler(({ context, data }) => MapsScanService.quote(context, data.scanId));
export const approveMapsScan = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(scanInput.extend({ approval: mapsCostQuoteSchema }))
  .handler(({ context, data }) =>
    MapsScanService.approve(context, data.scanId, context, data.approval),
  );
export const startNextMapsPoint = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(scanInput)
  .handler(({ context, data }) => {
    if (!env.DATAFORSEO_API_KEY?.trim())
      throw new AppError(
        "VALIDATION_ERROR",
        "Configure the search provider before starting a scan",
      );
    return MapsCollectionService.startNext(context, data.scanId, context);
  });
export const collectMapsPoint = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(scanInput.extend({ ordinal: z.number().int().nonnegative() }))
  .handler(({ context, data }) =>
    MapsCollectionService.collect(context, data.scanId, data.ordinal),
  );
export const publishMapsScan = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(scanInput)
  .handler(({ context, data }) =>
    MapsPublicationService.publish(context, data.scanId),
  );
