import { createRequire } from "node:module";
import { fixtureMarkerSchema, fixtureReadySchema } from "./contracts";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  copyFile,
} from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import {
  spawn,
  fork,
  execFileSync,
  type ChildProcess,
} from "node:child_process";
import { once } from "node:events";
import { createProvider } from "./server.ts";

const directory = fileURLToPath(new URL(".", import.meta.url));
const root = resolvePath(directory, "../..");
const serveOnly = process.argv.length === 3 && process.argv[2] === "--serve";
if (process.argv.length > 2 && !serveOnly)
  throw Error("Use --serve or no arguments");
const state = await mkdtemp(join(tmpdir(), "openseo-maps-e2e-"));
const runId = randomUUID();
const evidence = join(root, "test-results/maps-fixture", runId);
const children = new Set<ChildProcess>();
let provider: Awaited<ReturnType<typeof createProvider>> | undefined;
let app: ChildProcess | undefined;
let appReady = false,
  interrupted = false;
let failure: unknown;
let stopServing: () => void = () => {};
const stopped = new Promise<void>((done) => {
  stopServing = done;
});
const childEnv: NodeJS.ProcessEnv = {
  DATAFORSEO_API_KEY: "fixture-only-not-a-real-provider-key",
  PORT: "0",
};
for (const key of [
  "PATH",
  "TMPDIR",
  "SystemRoot",
  "WINDIR",
  "PLAYWRIGHT_CHANNEL",
  "PLAYWRIGHT_BROWSERS_PATH",
])
  if (process.env[key] !== undefined) childEnv[key] = process.env[key];
Object.assign(childEnv, {
  XDG_CONFIG_HOME: join(state, "config"),
  TSX_TSCONFIG_PATH: join(root, "tsconfig.json"),
  XDG_CACHE_HOME: join(state, "cache-home"),
  DOTENV_CONFIG_PATH: join(state, "empty.env"),
  WRANGLER_SEND_METRICS: "false",
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
  OPENSEO_MAPS_FIXTURE_STATE: state,
});
function remember(child: ChildProcess) {
  children.add(child);
  child.once("exit", () => children.delete(child));
  child.once("error", () => children.delete(child));
  return child;
}
function command(
  file: string,
  args: string[],
  logName: string,
  env = childEnv,
) {
  const fd = openSync(join(state, logName), "a");
  const child = remember(
    spawn(process.execPath, [file, ...args], {
      cwd: state,
      env,
      stdio: ["ignore", fd, fd],
    }),
  );
  closeSync(fd);
  return child;
}
async function exited(child: ChildProcess) {
  if (child.exitCode === null && child.signalCode === null)
    await once(child, "exit");
  if (child.exitCode !== 0)
    throw Error(
      `Fixture command failed (${child.signalCode ?? child.exitCode})`,
    );
}
function onSignal() {
  interrupted = true;
  stopServing();
  for (const child of children)
    if (child !== app || !appReady) child.kill("SIGTERM");
}
process.on("SIGINT", onSignal);
process.on("SIGTERM", onSignal);
const marker = {
  kind: "openseo-maps-e2e" as const,
  runId,
  source: root,
  realProvider: false,
  billingSimulated: true,
  providerUrl: "",
  appUrl: "",
  mode: serveOnly ? "serve-for-browser-checks" : "playwright",
};
try {
  await writeFile(join(state, "fixture.json"), JSON.stringify(marker));
  await mkdir(join(state, "config"), { recursive: true });
  await writeFile(join(state, "empty.env"), "");
  provider = await createProvider();
  marker.providerUrl = provider.url;
  await writeFile(join(state, "fixture.json"), JSON.stringify(marker));
  const wrangler = {
    name: "openseo-maps-e2e",
    main: join(root, "src/server.ts"),
    compatibility_date: "2025-09-02",
    compatibility_flags: ["nodejs_compat"],
    vars: {
      AUTH_MODE: "local_noauth",
      DATABASE_PROVIDER: "d1",
      DATAFORSEO_API_KEY: "fixture-only-not-a-real-provider-key",
      OPENSEO_TELEMETRY_DISABLED: "true",
    },
    workflows: [
      {
        name: "fixture-audit",
        binding: "SITE_AUDIT_WORKFLOW",
        class_name: "SiteAuditWorkflow",
      },
      {
        name: "fixture-rank",
        binding: "RANK_CHECK_WORKFLOW",
        class_name: "RankCheckWorkflow",
      },
    ],
    durable_objects: {
      bindings: [
        { name: "ONBOARDING_CHAT", class_name: "OnboardingChatAgent" },
        { name: "SAM_CHAT", class_name: "SamChatAgent" },
        { name: "AUDIT_SCRATCHPAD", class_name: "AuditScratchpad" },
      ],
    },
    migrations: [
      {
        tag: "fixture-v1",
        new_sqlite_classes: [
          "OnboardingChatAgent",
          "SamChatAgent",
          "AuditScratchpad",
        ],
      },
    ],
    kv_namespaces: [
      { binding: "KV", id: "fixture-kv" },
      { binding: "OAUTH_KV", id: "fixture-oauth" },
    ],
    d1_databases: [
      {
        binding: "DB",
        database_name: "maps-fixture",
        database_id: "11000000-0000-4000-8000-000000000050",
        migrations_dir: join(root, "drizzle"),
      },
    ],
    r2_buckets: [{ binding: "R2", bucket_name: "fixture-maps" }],
  };
  await writeFile(
    join(state, "wrangler.json"),
    JSON.stringify(wrangler, null, 2),
  );
  await exited(
    command(
      join(root, "node_modules/wrangler/bin/wrangler.js"),
      [
        "d1",
        "migrations",
        "apply",
        "maps-fixture",
        "--local",
        "--config",
        join(state, "wrangler.json"),
        "--persist-to",
        join(state, "state"),
      ],
      "migrations.log",
    ),
  );
  if (interrupted) throw Error("Fixture startup interrupted");
  const fd = openSync(join(state, "app.log"), "a");
  const appProcess = fork(join(directory, "serve.ts"), [], {
    cwd: state,
    env: childEnv,
    stdio: ["ignore", fd, fd, "ipc"],
    execArgv: ["--import", createRequire(import.meta.url).resolve("tsx")],
  });
  app = remember(appProcess);
  closeSync(fd);
  const ready = await new Promise<ReturnType<typeof fixtureReadySchema.parse>>(
    (done, reject) => {
      appProcess.once("message", (message: unknown) => {
        const result = fixtureReadySchema.safeParse(message);
        if (result.success) done(result.data);
        else reject(Error("Unexpected fixture startup message"));
      });
      appProcess.once("error", reject);
      appProcess.once("exit", () =>
        reject(Error("Fixture app exited before readiness")),
      );
    },
  );
  marker.appUrl = ready.url;
  provider.setOrigin(ready.url);
  const response = await fetch(ready.url, { redirect: "manual" });
  if (response.status >= 400)
    throw Error(`Fixture app readiness failed (${response.status})`);
  appReady = true;
  marker.mode = serveOnly ? "serve-for-browser-checks" : "playwright";
  console.log(JSON.stringify({ ...marker, state, evidence }));
  if (serveOnly)
    await Promise.race([
      stopped,
      once(appProcess, "exit").then(() => {
        throw Error("Fixture app exited during browser checks");
      }),
    ]);
  else {
    const testEnv = {
      ...childEnv,
      OPENSEO_MAPS_FIXTURE_URL: ready.url,
      OPENSEO_MAPS_FIXTURE_PROVIDER: provider.url,
    };
    await exited(
      command(
        join(root, "node_modules/@playwright/test/cli.js"),
        ["test", "--config", join(directory, "playwright.config.ts")],
        "playwright.log",
        testEnv,
      ),
    );
  }
} catch (error) {
  failure = error;
  console.error(error instanceof Error ? error.message : String(error));
} finally {
  await cleanup();
}
async function cleanup() {
  process.off("SIGINT", onSignal);
  process.off("SIGTERM", onSignal);
  let appDrained = false;
  try {
    const exits = [...children].map(async (child) => {
      if (child === app && appReady && child.connected) {
        const draining = new Promise<void>((done, reject) => {
          child.once("message", (message: unknown) => {
            if (
              typeof message === "object" &&
              message !== null &&
              "type" in message &&
              message.type === "draining"
            )
              done();
            else reject(Error("Unexpected fixture drain acknowledgement"));
          });
          child.once("exit", () =>
            reject(Error("Fixture app exited before drain acknowledgement")),
          );
          child.once("error", reject);
        });
        const completed = exited(child);
        child.send("close");
        await Promise.all([
          completed,
          draining.then(() => provider?.release()),
        ]);
        appDrained = true;
      } else {
        const closed = once(child, "exit");
        child.kill("SIGTERM");
        await closed;
      }
    });
    const shutdown = await Promise.allSettled(exits);
    const snapshot = provider?.snapshot();
    if (provider) await provider.close();
    const shutdownFailure = shutdown.find(
      (result) => result.status === "rejected",
    );
    if (shutdownFailure?.status === "rejected")
      failure ??= shutdownFailure.reason;
    await mkdir(evidence, { recursive: true });
    for (const name of [
      "migrations.log",
      "app.log",
      "playwright.log",
      "wrangler.json",
    ])
      try {
        await copyFile(join(state, name), join(evidence, name));
      } catch (error) {
        if (
          !(
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
          )
        )
          throw error;
      }
    const fixtureHashes: Record<string, string> = {};
    for (const name of await readdir(directory))
      fixtureHashes[name] = createHash("sha256")
        .update(await readFile(join(directory, name)))
        .digest("hex");
    const sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    const sourceDirty =
      execFileSync("git", ["status", "--porcelain"], {
        cwd: root,
        encoding: "utf8",
      }).trim() !== "";
    const receipt = {
      ...marker,
      sourceRevision,
      sourceDirty,
      fixtureHashes,
      snapshot,
      appDrained,
      evidenceComplete: appDrained,
      interrupted,
      result: failure ? "failed" : serveOnly ? "served-only" : "passed",
      error:
        failure instanceof Error
          ? failure.message
          : failure
            ? "Non-Error fixture failure"
            : undefined,
      cleaned: false,
    };
    const receiptPath = join(evidence, "receipt.json");
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2));
    if (shutdownFailure?.status === "rejected") throw shutdownFailure.reason;
    const stored = fixtureMarkerSchema.parse(
      JSON.parse(await readFile(join(state, "fixture.json"), "utf8")),
    );
    if (
      stored.kind !== marker.kind ||
      stored.runId !== runId ||
      stored.source !== root
    )
      throw Error("Refusing cleanup: fixture marker changed");
    await rm(state, { recursive: true });
    receipt.cleaned = true;
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2));
    console.log(
      JSON.stringify({
        evidence,
        cleaned: true,
        result: failure ? "failed" : serveOnly ? "served-only" : "passed",
      }),
    );
  } catch (error) {
    failure ??= error;
    console.error(
      `Fixture cleanup failed: ${error instanceof Error ? error.message : String(error)}; retained ${state}`,
    );
    await writeFile(
      join(evidence, "cleanup-error.txt"),
      error instanceof Error ? error.message : String(error),
    );
  }
}
if (failure && !interrupted) process.exitCode = 1;
