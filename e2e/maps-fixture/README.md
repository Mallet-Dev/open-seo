# Controlled Maps E2E tests

Run the complete Maps workflow against the actual application with disposable local D1 data and a simulated provider. No real provider account, customer data or billing service is needed. Billing failures in this fixture are simulated, not a qualification of hosted billing.

From the repository root, install the existing dependencies and use:

```sh
pnpm exec tsx e2e/maps-fixture/run.ts
```

The runner creates its own marked temporary store, applies the native migrations locally, starts its own loopback provider and app, then runs the dedicated Playwright configuration. It uses the installed Chrome channel by default. The normal E2E configuration skips these fixture-dependent cases. There is no second Playwright web server.

For manual browser work:

```sh
pnpm exec tsx e2e/maps-fixture/run.ts --serve
```

Wait for the JSON readiness line and open its `appUrl`. A persistent fixture strip identifies the simulated provider and billing. Its controls can hold one accepted submission, return pending results, simulate billing uncertainty or receipt-write failure, remove source time, block recovery storage and fail saved-status refresh. Stop with Ctrl+C when finished.

The fixture configuration alone installs these adapters and fault controls. Normal builds and application routes use the original services. Child processes receive an allowlisted environment, dummy provider configuration and a task-local configuration/cache directory. No project dotenv file is loaded. Outbound requests from the app entry are blocked except for this run's loopback provider and measurement endpoint. This fixture is for local development and must not be deployed.

Tests cover explicit approval and retry, pending retrieval without reposting, complete publication, keyboard selection, deep-link reload, recovery downloads, navigation during a held submission and known-task retrieval during simulated billing uncertainty. Missing source time remains separate from retrieval time. An actual provider price change is a separate scenario and is not established by an approval network failure.

`test-results/maps-fixture/<run-id>/` retains logs, fixture configuration, source revision/dirty state, fixture hashes, execution mode and request/query evidence. Playwright retains browser artifacts separately. D1 executions are counted by native method delegation; a batch counts as one query. The [current D1 platform limits](https://developers.cloudflare.com/d1/platform/limits/) define the asserted Free-plan limit. Local-profile measurements do not establish production capacity.

On exit the runner rejects new app requests, releases held fixture responses while the provider and metrics remain available, drains its owned app, then records the final evidence and closes the provider. It removes only its exact marked temporary store. A cleanup failure is reported and its store is retained for inspection. The receipt distinguishes `appDrained`, `evidenceComplete` and `cleaned`. A `served-only` receipt proves startup and shutdown, not browser completion or automated E2E success. Record actual CUA or Playwright execution separately from test discovery.
