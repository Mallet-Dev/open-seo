import type { FixtureInvocation } from "./contracts";
import { AsyncLocalStorage } from "node:async_hooks";
import config from "virtual:maps-fixture-config";
const context = new AsyncLocalStorage<FixtureInvocation>();
let installed = false;
let unattributed = 0;
let fixtureFetch: typeof globalThis.fetch;
export function count(method: string, _sql = "", statements = 1) {
  const current = context.getStore();
  if (!current) {
    unattributed++;
    return;
  }
  current.apiCalls++;
  current.methods[method] = (current.methods[method] ?? 0) + 1;
  current.batchStatements += method === "batch" ? statements : 0;
}
function guard() {
  if (installed) return;
  installed = true;
  fixtureFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    if (
      url.origin !== config.providerUrl ||
      !["/post", "/get", "/invocation"].includes(url.pathname)
    ) {
      const current = context.getStore();
      current?.unexpectedOutbound.push(url.origin + url.pathname);
      throw Error(
        "Unexpected outbound request blocked by isolated test fixture",
      );
    }
    return fixtureFetch(input, init);
  };
}
export async function traced(
  request: Request,
  ctx: ExecutionContext,
  run: (ctx: ExecutionContext) => Promise<Response>,
) {
  guard();
  const item: FixtureInvocation = {
    path: new URL(request.url).pathname,
    apiCalls: 0,
    methods: {},
    batchStatements: 0,
    unexpectedOutbound: [],
    deferredFailures: [],
    startedAt: new Date().toISOString(),
    finishedAt: "",
    deferredSettled: false,
    unattributed: 0,
  };
  const pending: Promise<unknown>[] = [];
  const wrapped = new Proxy(ctx, {
    get(target, key) {
      if (key === "waitUntil")
        return (promise: Promise<unknown>) => {
          pending.push(Promise.resolve(promise));
          target.waitUntil(promise);
        };
      const value: unknown = Reflect.get(target, key, target);
      const bound: unknown =
        typeof value === "function" ? value.bind(target) : value;
      return bound;
    },
  });
  return context.run(item, async () => {
    try {
      const result = await run(wrapped);
      item.status = result.status;
      return result;
    } catch (error) {
      item.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      let index = 0;
      while (index < pending.length) {
        const part = pending.slice(index);
        index = pending.length;
        const results = await Promise.allSettled(part);
        for (const result of results)
          if (result.status === "rejected")
            item.deferredFailures.push(String(result.reason));
      }
      item.deferredSettled = true;
      item.unattributed = unattributed;
      item.finishedAt = new Date().toISOString();
      await fixtureFetch(config.providerUrl + "/invocation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
    }
  });
}
