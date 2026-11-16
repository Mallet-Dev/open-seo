import { afterEach, expect, it, vi } from "vitest";
import { pollBusinessTask } from "./pollBusinessTask";

const fetchResult = vi.hoisted(() => vi.fn());
vi.mock("@/server/lib/dataforseo", () => ({
  fetchBusinessDataTaskResult: fetchResult,
}));
afterEach(() => vi.useRealTimers());

it("collects a pending business update at the existing cadence without changing its task", async () => {
  vi.useFakeTimers();
  const completed = { status: "completed", result: { items: [] } };
  fetchResult.mockResolvedValueOnce({ status: "pending", result: null });
  fetchResult.mockResolvedValueOnce(completed);
  const task = { endpoint: "my_business_updates" as const, taskId: "update-1" };
  const result = pollBusinessTask(task, task.taskId);
  expect(fetchResult).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(3999);
  expect(fetchResult).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  await expect(result).resolves.toEqual(completed);
  expect(fetchResult.mock.calls).toEqual([[task], [task]]);
});
