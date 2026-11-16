import { z } from "zod";
export const fixturePostedSchema = z.object({
  taskId: z.string(),
  tag: z.string(),
  providerCostUsd: z.number().nonnegative(),
  billingFailure: z.boolean(),
  writeFailure: z.boolean(),
});
export const fixtureInvocationSchema = z.object({
  path: z.string(),
  apiCalls: z.number().int().nonnegative(),
  methods: z.record(z.string(), z.number().int().nonnegative()),
  batchStatements: z.number().int().nonnegative(),
  unexpectedOutbound: z.array(z.string()),
  deferredFailures: z.array(z.string()),
  startedAt: z.string(),
  finishedAt: z.string(),
  deferredSettled: z.boolean(),
  unattributed: z.number().int().nonnegative(),
  status: z.number().optional(),
  error: z.string().optional(),
});
export type FixtureInvocation = z.infer<typeof fixtureInvocationSchema>;
export const fixtureCountersSchema = z.object({
  posts: z.number().int().nonnegative(),
  gets: z.number().int().nonnegative(),
  held: z.number().int().nonnegative(),
});
export const fixtureMarkerSchema = z.object({
  kind: z.literal("openseo-maps-e2e"),
  runId: z.uuid(),
  source: z.string(),
  providerUrl: z.url().optional(),
});
export const fixtureReadySchema = z.object({
  type: z.literal("ready"),
  url: z.url(),
});
