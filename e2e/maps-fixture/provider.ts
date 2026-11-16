import { z } from "zod";
import { fixturePostedSchema } from "./contracts";
import {
  mapsPointTaskSchema,
  mapsPointObservationSchema,
} from "@/shared/maps-collection";
import { MapsTaskSubmissionError } from "../../src/server/lib/dataforseo/client.ts";
import config from "virtual:maps-fixture-config";
export * from "../../src/server/lib/dataforseo/index.ts";
export const faults = { receiptWrite: false };
async function call(path: string, input: unknown): Promise<unknown> {
  const response = await fetch(config.providerUrl + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw Error(`Fixture request failed (${response.status})`);
  const data: unknown = await response.json();
  return data;
}
const blocked = async () => {
  throw Error("This fixture permits Maps calls only");
};
export const fetchKeywordMetricsForList = blocked;
export const fetchRankCheckTaskResult = blocked;
export const fetchBusinessDataTaskResult = blocked;
export const fetchBusinessListingsCategories = blocked;
export function createDataforseoClient() {
  return {
    serp: {
      mapsTaskPost: async (raw: unknown) => {
        const request = mapsPointTaskSchema.parse(raw);
        const result = fixturePostedSchema.parse(await call("/post", request));
        faults.receiptWrite = result.writeFailure;
        if (result.billingFailure)
          throw new MapsTaskSubmissionError(
            {
              taskId: result.taskId,
              requestTag: request.tag,
              providerTag: result.tag,
              providerStatus: 20100,
              providerCostUsd: result.providerCostUsd,
              identityVerified: true,
              returnedTaskCount: 1,
              returnedTaskIds: [result.taskId],
            },
            Error("Injected simulated billing uncertainty"),
          );
        return {
          taskId: result.taskId,
          tag: result.tag,
          providerCostUsd: result.providerCostUsd,
        };
      },
    },
  };
}
export async function fetchMapsTaskResult(raw: unknown) {
  const input = z
    .object({ taskId: z.string(), request: mapsPointTaskSchema })
    .parse(raw);
  return z
    .union([
      mapsPointObservationSchema,
      z.object({
        status: z.literal("pending"),
        taskId: z.string(),
        receivedAt: z.string(),
      }),
    ])
    .parse(await call("/get", input));
}
