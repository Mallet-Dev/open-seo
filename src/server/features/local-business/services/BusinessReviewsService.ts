import {
  createDataforseoClient,
  type BusinessTaskEndpoint,
} from "@/server/lib/dataforseo";
import type { postGoogleReviewsTask } from "@/server/lib/dataforseo/business";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { AppError } from "@/server/lib/errors";
import { pollBusinessTask } from "./pollBusinessTask";

type ReviewTaskInput =
  | { mode: "resume"; taskId: string }
  | { mode: "start"; request: Parameters<typeof postGoogleReviewsTask>[0] };

const REVIEWS_TASK_ID_PATTERN = /^(google|extended):(.+)$/;

function encodeReviewsTaskId(includeOtherSources: boolean, id: string): string {
  return `${includeOtherSources ? "extended" : "google"}:${id}`;
}

function parseReviewsTaskId(taskId: string): {
  endpoint: BusinessTaskEndpoint;
  taskId: string;
} {
  const match = REVIEWS_TASK_ID_PATTERN.exec(taskId);
  if (!match) {
    throw new AppError(
      "VALIDATION_ERROR",
      'taskId must be the value this tool returned, formatted as "google:<id>" or "extended:<id>".',
    );
  }
  return {
    endpoint: match[1] === "extended" ? "extended_reviews" : "reviews",
    taskId: match[2] ?? "",
  };
}

// The caller owns project authorization and admission of any resumable task.
async function collect(
  input: ReviewTaskInput,
  billing: BillingCustomerContext,
) {
  let task: { endpoint: BusinessTaskEndpoint; taskId: string };
  let publicTaskId: string;
  if (input.mode === "resume") {
    task = parseReviewsTaskId(input.taskId);
    publicTaskId = input.taskId;
  } else {
    publicTaskId = await submit(input.request, billing);
    task = parseReviewsTaskId(publicTaskId);
  }
  const outcome = await pollBusinessTask(task, publicTaskId);
  return { taskId: publicTaskId, outcome };
}

async function submit(
  request: Parameters<typeof postGoogleReviewsTask>[0],
  billing: BillingCustomerContext,
) {
  const client = createDataforseoClient(billing);
  const id = await client.business.reviewsTaskPost(request);
  return encodeReviewsTaskId(request.includeOtherSources, id);
}
export const BusinessReviewsService = { collect, submit };
