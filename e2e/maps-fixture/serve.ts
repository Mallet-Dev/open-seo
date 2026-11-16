import { createServer } from "vite";
import { fileURLToPath } from "node:url";
const server = await createServer({
  configFile: fileURLToPath(new URL("vite.config.ts", import.meta.url)),
});
await server.listen();
const address = server.httpServer?.address();
if (typeof address !== "object" || !address)
  throw Error("Fixture did not bind a loopback port");
if (!process.send) throw Error("Start the fixture through its runner");
process.send({ type: "ready", url: `http://127.0.0.1:${address.port}` });
process.on("message", async (message: unknown) => {
  if (message === "close") {
    const drained = new Promise<void>((done, reject) => {
      if (!server.httpServer) {
        reject(Error("Fixture HTTP server is missing"));
        return;
      }
      server.httpServer.close((error) => (error ? reject(error) : done()));
      process.send?.({ type: "draining" });
    });
    await server.ws.close();
    await drained;
    await server.close();
    process.exit(0);
  }
});
