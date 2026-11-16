import { createServer, type ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { z } from "zod";
import { mapsPointTaskSchema } from "../../src/shared/maps-collection";
import {
  fixtureInvocationSchema,
  type FixtureInvocation,
  type fixturePostedSchema,
} from "./contracts";
export async function createProvider() {
  let origin: string | undefined;
  const flags = {
    holdNext: false,
    pending: false,
    billingFailure: false,
    writeFailure: false,
    noSourceTime: false,
  };
  const events: {
    kind: "post" | "get";
    tag: string;
    taskId: string;
    at: string;
  }[] = [];
  const invocations: FixtureInvocation[] = [];
  const held: {
    res: ServerResponse;
    response: z.infer<typeof fixturePostedSchema>;
  }[] = [];
  function taskId(tag: string) {
    const hash = createHash("sha256").update(tag).digest("hex").slice(0, 32);
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
  }
  function send(res: ServerResponse, data: unknown, status = 200) {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin ?? "null",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    });
    res.end(JSON.stringify(data));
  }
  function release() {
    for (const item of held.splice(0)) send(item.res, item.response);
  }
  const commands = {
    normal: () =>
      Object.assign(flags, {
        holdNext: false,
        pending: false,
        billingFailure: false,
        writeFailure: false,
        noSourceTime: false,
      }),
    hold: () => {
      flags.holdNext = true;
    },
    release,
    pending: () => {
      flags.pending = true;
    },
    complete: () => {
      flags.pending = false;
    },
    "billing-fail": () => {
      flags.billingFailure = true;
    },
    "receipt-fail": () => {
      flags.writeFailure = true;
    },
    "unknown-time": () => {
      flags.noSourceTime = true;
    },
    "reset-counters": () => {
      events.splice(0);
      invocations.splice(0);
    },
  };
  const controlSchema = z.object({
    command: z.enum([
      "normal",
      "hold",
      "release",
      "pending",
      "complete",
      "billing-fail",
      "receipt-fail",
      "unknown-time",
      "reset-counters",
    ]),
  });
  const server = createServer(async (req, res) => {
    try {
      if (req.headers.origin && req.headers.origin !== origin)
        return send(res, { error: "Wrong fixture origin" }, 403);
      if (req.method === "OPTIONS") return send(res, {});
      const path = new URL(req.url ?? "/", "http://fixture").pathname;
      if (path === "/stats" && req.method === "GET")
        return send(res, {
          flags,
          posts: events.filter((e) => e.kind === "post").length,
          gets: events.filter((e) => e.kind === "get").length,
          held: held.length,
          events,
          invocations,
        });
      const chunks: Buffer[] = [];
      for await (const chunk of req)
        chunks.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)),
        );
      const text = Buffer.concat(chunks).toString();
      const data: unknown = text ? JSON.parse(text) : {};
      if (path === "/invocation" && req.method === "POST") {
        invocations.push(fixtureInvocationSchema.parse(data));
        return send(res, { saved: true });
      }
      if (path === "/control" && req.method === "POST") {
        commands[controlSchema.parse(data).command]();
        return send(res, { flags, held: held.length });
      }
      if (path === "/post" && req.method === "POST") {
        const request = mapsPointTaskSchema.parse(data);
        const id = taskId(request.tag);
        events.push({
          kind: "post",
          tag: request.tag,
          taskId: id,
          at: new Date().toISOString(),
        });
        const response = {
          taskId: id,
          tag: request.tag,
          providerCostUsd: Math.ceil(request.depth / 100) * 0.0006,
          billingFailure: flags.billingFailure,
          writeFailure: flags.writeFailure,
        };
        if (flags.holdNext) {
          flags.holdNext = false;
          held.push({ res, response });
          return;
        }
        return send(res, response);
      }
      if (path === "/get" && req.method === "POST") {
        const input = z
          .object({ taskId: z.string(), request: mapsPointTaskSchema })
          .parse(data);
        if (input.taskId !== taskId(input.request.tag))
          return send(res, { error: "Wrong saved task identity" }, 409);
        events.push({
          kind: "get",
          tag: input.request.tag,
          taskId: input.taskId,
          at: new Date().toISOString(),
        });
        const base = {
          taskId: input.taskId,
          receivedAt: new Date().toISOString(),
        };
        if (flags.pending) return send(res, { ...base, status: "pending" });
        const absolute = input.request.rankBasis === "absolute";
        return send(res, {
          ...base,
          status: "completed",
          providerObservedAt: flags.noSourceTime
            ? null
            : "2026-11-15 12:00:00 +00:00",
          resultKind: "sample",
          itemsCount: 4,
          nonBusinessItemsCount: 1,
          itemTypes: ["maps_search", "maps_paid"],
          rows: [
            {
              ordinal: 0,
              title: "Northline sample",
              cid: "12345678901234567890",
              placeId: null,
              rank: absolute ? 4 : 1,
              rankAbsolute: 4,
              rankGroup: 1,
            },
            {
              ordinal: 2,
              title: null,
              cid: "888888888",
              placeId: null,
              rank: 2,
              rankAbsolute: 2,
              rankGroup: 2,
            },
            {
              ordinal: 3,
              title: "Northline repeated source row",
              cid: "12345678901234567890",
              placeId: null,
              rank: absolute ? 2 : 3,
              rankAbsolute: 2,
              rankGroup: 3,
            },
          ],
        });
      }
      return send(res, { error: "Unsupported fixture endpoint" }, 404);
    } catch (error) {
      send(
        res,
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  });
  await new Promise<void>((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("Fixture failed to bind loopback");
  return {
    url: `http://127.0.0.1:${address.port}`,
    setOrigin(value: string) {
      origin = value;
    },
    snapshot() {
      return { flags, events, invocations, held: held.length };
    },
    release,
    close() {
      for (const item of held.splice(0))
        send(item.res, { error: "Fixture stopped" }, 503);
      return new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
    },
  };
}
