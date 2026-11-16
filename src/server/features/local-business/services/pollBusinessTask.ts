import {
  fetchBusinessDataTaskResult,
  type BusinessTaskEndpoint,
  type BusinessTaskOutcome,
} from "@/server/lib/dataforseo";
import { AppError } from "@/server/lib/errors";

// DataForSEO queues these tasks; high priority normally settles them inside the
// poll window, and the tool hands back a resumable taskId when it doesn't.
const TASK_POLL_ATTEMPTS = 6;
const TASK_POLL_INTERVAL_MS = 4000;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollBusinessTask(
  input: { endpoint: BusinessTaskEndpoint; taskId: string },
  publicTaskId: string,
): Promise<BusinessTaskOutcome> {
  try {
    for (let attempt = 0; attempt < TASK_POLL_ATTEMPTS; attempt++) {
      if (attempt > 0) await wait(TASK_POLL_INTERVAL_MS);
      const outcome = await fetchBusinessDataTaskResult(input);
      if (outcome.status === "completed") return outcome;
    }
    return { status: "pending", result: null };
  } catch (error) {
    // The task was already paid for at post; don't let a collection failure
    // discard the only handle to it.
    if (error instanceof AppError) {
      throw new AppError(
        error.code,
        `${error.message} The queued task is still collectable — call again with taskId "${publicTaskId}" at no extra cost.`,
      );
    }
    throw error;
  }
}
