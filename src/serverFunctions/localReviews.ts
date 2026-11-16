import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { ReviewTaskService } from "@/server/features/local-business/services/ReviewTaskService";
import { ReviewSnapshotService } from "@/server/features/local-business/services/ReviewSnapshotService";
import {
  reviewTaskRequestSchema,
  reviewCostQuoteSchema,
} from "@/shared/local-reviews";
const project = z.object({ projectId: z.string().min(1) }).strict();
const task = project.extend({ requestId: z.uuid() });
export const listReviewRequests = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(project)
  .handler(async ({ context }) => ({
    requests: await ReviewTaskService.list(context),
    market: {
      locationCode: context.project.locationCode,
      languageCode: context.project.languageCode,
    },
  }));
export const prepareReviewRequest = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(task.extend({ request: reviewTaskRequestSchema }))
  .handler(({ context, data }) =>
    ReviewTaskService.prepare(context, data.requestId, data.request),
  );
export const getReviewReport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(task)
  .handler(async ({ context, data }) => ({
    task: await ReviewTaskService.read(context, data.requestId),
    snapshot: await ReviewSnapshotService.read(context, data.requestId),
  }));
export const quoteReviewCollection = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(task)
  .handler(({ context, data }) =>
    ReviewTaskService.quote(context, data.requestId),
  );
export const startReviewCollection = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(task.extend({ approval: reviewCostQuoteSchema }))
  .handler(({ context, data }) =>
    ReviewTaskService.start(
      context,
      data.requestId,
      { ...context, projectId: context.projectId },
      data.approval,
    ),
  );
export const collectReviewReport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(task)
  .handler(({ context, data }) =>
    ReviewTaskService.collect(context, data.requestId, {
      ...context,
      projectId: context.projectId,
    }),
  );
