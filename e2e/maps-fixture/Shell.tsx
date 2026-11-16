import { z } from "zod";
import { fixtureCountersSchema } from "./contracts";
import { useEffect, useState, type ComponentProps } from "react";
import { AuthenticatedAppLayout as Original } from "../../src/client/layout/AppShell.tsx";
import config from "virtual:maps-fixture-config";
export * from "../../src/client/layout/AppShell.tsx";
function FixtureTools() {
  const [stats, setStats] = useState("");
  const [storage, setStorage] = useState(false);
  const [status, setStatus] = useState(false);
  const [base] = useState(() => ({
    fetch: window.fetch.bind(window),
    // oxlint-disable-next-line typescript/unbound-method -- The native receiver is preserved by explicit call and restoration.
    setItem: Storage.prototype.setItem,
  }));
  useEffect(
    () => () => {
      window.fetch = base.fetch;
      Storage.prototype.setItem = base.setItem;
    },
    [base],
  );
  async function command(value: string) {
    await base.fetch(config.providerUrl + "/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: value }),
    });
    await read();
  }
  async function read() {
    const data = fixtureCountersSchema.parse(
      await (await base.fetch(config.providerUrl + "/stats")).json(),
    );
    setStats(`POSTs ${data.posts}; GETs ${data.gets}; held ${data.held}`);
  }
  function faultsOff() {
    window.fetch = base.fetch;
    Storage.prototype.setItem = base.setItem;
    setStorage(false);
    setStatus(false);
  }
  return (
    <aside
      aria-label="Isolated fixture controls"
      style={{
        position: "fixed",
        zIndex: 9999,
        bottom: 0,
        left: 0,
        right: 0,
        background: "#fff2d9",
        color: "#3d2d10",
        font: "11px system-ui",
        padding: 7,
        display: "flex",
        gap: 7,
        flexWrap: "wrap",
      }}
    >
      <strong>Simulated provider and billing · disposable data</strong>
      {[
        "normal",
        "hold",
        "release",
        "pending",
        "complete",
        "billing-fail",
        "receipt-fail",
        "unknown-time",
        "reset-counters",
      ].map((value) => (
        <button key={value} onClick={() => void command(value)}>
          {value}
        </button>
      ))}
      <button
        aria-pressed={storage}
        onClick={() => {
          Storage.prototype.setItem = function (key, value) {
            if (key.startsWith("maps-recovery:"))
              throw new DOMException(
                "Injected blocked recovery storage",
                "SecurityError",
              );
            return base.setItem.call(this, key, value);
          };
          setStorage(true);
        }}
      >
        Block recovery storage
      </button>
      <button
        aria-pressed={status}
        onClick={() => {
          window.fetch = function (input, init) {
            const url =
              typeof input === "string"
                ? input
                : input instanceof URL
                  ? input.href
                  : input.url;
            if (
              url.includes("/_serverFn/") &&
              z
                .object({ export: z.string() })
                .parse(
                  JSON.parse(
                    atob(
                      new URL(url, location.href).pathname.split("/").pop() ??
                        "",
                    ),
                  ),
                ).export === "getMapsScan_createServerFn_handler"
            )
              return Promise.reject(
                new TypeError("Injected saved status network failure"),
              );
            return base.fetch(input, init);
          };
          setStatus(true);
        }}
      >
        Fail status refresh
      </button>
      <button onClick={faultsOff}>Restore browser faults</button>
      <button onClick={() => void read()}>Fixture counters</button>
      <output>{stats}</output>
    </aside>
  );
}
export function AuthenticatedAppLayout(props: ComponentProps<typeof Original>) {
  return (
    <>
      <Original {...props} />
      <FixtureTools />
    </>
  );
}
