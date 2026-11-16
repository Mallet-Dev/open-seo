import { fixtureMarkerSchema } from "./contracts";
import { z } from "zod";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { leanWorkerBundle } from "../../vite-plugin-lean-worker-bundle.ts";
const directory = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(directory, "../..");
const state = process.env.OPENSEO_MAPS_FIXTURE_STATE;
if (!state)
  throw Error("Start this configuration with the Maps fixture runner");
const marker = fixtureMarkerSchema
  .extend({ providerUrl: z.url() })
  .parse(JSON.parse(readFileSync(join(state, "fixture.json"), "utf8")));
if (
  new URL(marker.providerUrl).hostname !== "127.0.0.1" ||
  new URL(marker.providerUrl).protocol !== "http:"
)
  throw Error("Fixture provider must be loopback");
if (marker.kind !== "openseo-maps-e2e" || marker.source !== root)
  throw Error("Fixture source marker does not match");
const fixture = (name: string) => join(directory, name);
export default defineConfig({
  root,
  envDir: false,
  envPrefix: ["VITE_", "AUTH_MODE"],
  cacheDir: join(state, "cache"),
  resolve: {
    alias: [
      {
        find: /^@\/server\/lib\/dataforseo$/,
        replacement: fixture("provider.ts"),
      },
      { find: "@/client/layout/AppShell", replacement: fixture("Shell.tsx") },
      {
        find: /^(?:@\/db\/d1\/client|\.\/d1\/client)$/,
        replacement: fixture("d1.ts"),
      },
      {
        find: /^(?:@\/server\/features\/local-maps\/repositories\/MapsCollectionRepository|\.\.\/repositories\/MapsCollectionRepository)$/,
        replacement: fixture("repository.ts"),
      },
      { find: "@", replacement: join(root, "src") },
    ],
  },
  plugins: [
    {
      name: "maps-fixture",
      enforce: "pre",
      configureServer(server) {
        let draining = false;
        const hold = (message: unknown) => {
          if (message === "close") draining = true;
        };
        process.on("message", hold);
        server.httpServer?.once("close", () => process.off("message", hold));
        server.middlewares.use((_request, response, next) => {
          if (!draining) {
            next();
            return;
          }
          response.writeHead(503, { "Content-Type": "text/plain" });
          response.end("Fixture is shutting down");
        });
      },
      resolveId(id) {
        if (id === "virtual:maps-fixture-config")
          return "\0maps-fixture-config";
      },
      load(id) {
        if (id === "\0maps-fixture-config")
          return `export default ${JSON.stringify({ providerUrl: marker.providerUrl })}`;
      },
      transform(code, id) {
        if (id.split("?")[0] !== join(root, "src/server.ts")) return;
        const needle = "export default {\n  fetch,";
        if (!code.includes(needle))
          throw Error("Application entry changed; update the fixture binding");
        return {
          code:
            `import {traced as fixtureTraced} from ${JSON.stringify(fixture("trace.ts"))};\n` +
            code.replace(
              needle,
              "export default {\n  fetch(request,env,ctx){return fixtureTraced(request,ctx,wrapped=>fetch(request,env,wrapped));},",
            ),
          map: null,
        };
      },
    },
    leanWorkerBundle(),
    cloudflare({
      configPath: join(state, "wrangler.json"),
      persistState: { path: join(state, "state") },
      inspectorPort: false,
      remoteBindings: false,
      viteEnvironment: { name: "ssr" },
    }),
    tanstackStart(),
    react(),
    tailwind(),
  ],
  server: {
    host: "127.0.0.1",
    port: 0,
    fs: { allow: [root, realpathSync(join(root, "node_modules"))] },
  },
});
