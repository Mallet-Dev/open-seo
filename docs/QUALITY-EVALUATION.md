# Quality evaluation

Evaluate completed user jobs and the truth of the resulting evidence. A clickable button, green unit suite or attractive screenshot alone does not prove a usable workflow.

## Existing foundation

Reuse Vitest, the paired database schema checks, the SQLite and PostgreSQL repositories, and the existing Playwright E2E suite. Add no second test framework, recurring model judge or duplicate controller. Tests use invented data and deterministic provider responses. Real provider qualification is a separate explicitly authorised check.

The existing `playwright.config.ts` starts the full application and uses a local database. Run it only in an isolated test checkout with a fresh disposable local database, required migrations and non-secret test configuration. Do not point the suite at production or a retained personal workspace. The saved-example tests create invented campaign/history rows. This suite does not clean an arbitrary database or fetch paid search data.

## Quick feedback

| Layer                   | What it establishes                                                                               | When to run                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Focused contract tests  | Parsing, formulas, missingness, scope, money and state transitions                                | On changes to those contracts or their consumers                |
| Workbench browser tasks | Pointer/keyboard selection, linked evidence, history, source labels and narrow-screen usability   | On affected route, interaction, style or integration changes    |
| Provider integration    | Request/response identity, prices and uncertainty handling using saved or controlled responses    | On adapter or provider-contract changes                         |
| Database qualification  | Atomic writes, concurrent winners, isolation, restart and recovery using actual supported engines | On affected storage/query/transaction changes                   |
| Visual and human review | Hierarchy, readability, discoverability, comprehension and enjoyment                              | On material design changes and before a public experience claim |
| Comparative user tasks  | Performance against a named competitor on the same job                                            | Before making that particular comparative claim                 |

Start with affected tests rather than the whole suite. Run related independent files together when they do not share mutable state. The existing E2E configuration keeps one worker because it shares the application's local store; do not turn on parallel workers until each has its own store. Do not silently retry failures. Record source revision, fixture version, selected cases, duration, result and failure artifacts. A CI run may use Playwright's retained trace/screenshot/video on failure. Do not retain credentials or real customer payloads in artifacts.

## Browser outcome cases

The executable `e2e/search-workbench.spec.ts` covers the current Maps example. It uses accessible controls and checks outcomes, not private component names. Run:

```sh
pnpm exec playwright test e2e/search-workbench.spec.ts
```

A narrower discovery/compile check that launches no browser:

```sh
pnpm exec playwright test e2e/search-workbench.spec.ts --list
```

Discovery is not an E2E pass. Record whether a browser check used the complete app or a component fixture with simulated server functions. A fresh installation may show the missing-provider setup dialog; dismiss that notice when testing the invented example. Do not add provider credentials to make example tests pass.

| Case                       | Input and action                                             | Required result                                                                                                     |
| -------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Explore a point            | Select a known point with pointer, then navigate with arrows | Same selected point, coordinates and evidence; one point in the normal Tab order                                    |
| Understand incomplete data | Open failed, excluded and unobserved points                  | Distinct truthful states, no invented zero rank or false business absence                                           |
| Compare business and date  | Change business, then saved run date                         | Effective selection remains explicit; missing competitor results stay unknown; previous evidence remains available  |
| Reopen                     | Reload saved example                                         | Campaign/history persist and no search-provider request runs                                                        |
| Narrow screen              | Repeat exploration at a narrow viewport                      | Main page stays contained; necessary table scrolling remains inside its region; selected evidence remains available |
| External map privacy       | Explore the default grid                                     | No street-tile request before explicit street-map activation                                                        |

## Maps collection checks

The dedicated controlled suite is `e2e/maps-collection.spec.ts`. It is skipped by the normal configuration unless the isolated fixture is active. Use the existing TypeScript runtime to create a fresh local database and simulated provider, then run its dedicated configuration:

```sh
pnpm exec tsx e2e/maps-fixture/run.ts
```

For manual browser checks, append `--serve` and open the readiness line's `appUrl`. See [the fixture instructions](../e2e/maps-fixture/README.md) for fault controls, cleanup and retained evidence. Discovery and serve-only receipts remain separate from actual browser execution. Four controlled specs cover approval retry/publication, receipt recovery, navigation interruption and uncertain simulated billing. A discovery listing confirms that the cases compile. Use the browser runner result for the revision under test to establish execution.

The collection UI is implemented. Controlled full-application browser checks have exercised explicit approval, ordered submission, pending retrieval, completed publication, keyboard selection, deep-link reloads, blocked approval retry, unknown source times and narrow-screen controls. A receipt-write failure after simulated provider acceptance preserves a recovery download even when browser storage is blocked and a later status refresh fails. Navigating away during one held submission prevents later submissions. A known receipt with simulated billing uncertainty blocks further submissions while allowing retrieval.

These checks use simulated provider and billing responses with disposable local D1 data. They do not qualify hosted billing or real-provider execution. An approval-request failure is distinct from an actual price change. Database and admission tests cover stale-price rejection; the changed-price browser scenario remains unexercised. Whole-request query measurements include the app entry, middleware and settled background work in the local authentication profile, not a production capacity claim.

The cross-feature spec `e2e/project-investigation.spec.ts` checks that a project retains its keyword research URL when returning from an AI prompt draft. The test intercepts the draft's server request, verifies that it waits for explicit submission and keeps the provider offline. Run this case with the normal E2E configuration.

A CI result for the selected commit establishes whether an automated browser case passed. Additional journeys that need separate evidence include:

- Change project or organisation. No report, task, cache or draft leaks into the other scope.
- Save keywords with keyboard focus, pending protection, failure, retry and return focus, while retaining the exact save payload.
- Filter a first-party report and export CSV/JSON. Preserve the disclosed loaded-row scope, formula-safe text, missing values and original JSON precision.
- Follow a page/date link from GSC into Analytics and return. Preserve context and drafts; do not refetch a paid AI report merely to reopen it.

## Source-built Docker recovery

On a Docker host with the locked project dependencies, Playwright browser and Node installed, run `sh scripts/test-selfhost-docker.sh` from a committed checkout with port 3001 free. The script builds an archive of that commit in a temporary directory. It starts a loopback container, checks health and private-file exclusions, and opens the fork's Maps example in a real browser. It cold-backs up the resulting data into a private archive, restores into a separate Compose volume, refuses a second restore over it and verifies the original campaign ID and name after restarting. It cleans up its own disposable projects. An image build or a fixture run alone does not exercise this recovery path.

## Accuracy oracle

Expected results come from an independently inspectable fixture or source calculation. Keep provider absolute/group rank, original ordering, literal business IDs, returned coverage and source/retrieval times. A fixture must include missing and zero values, sparse and empty results, a failed point, an excluded point, an incompatible comparison and a known successful case where relevant. Do not write an expectation by copying the function under test.

For money and recovery, record the exact number of POSTs and billing calls. GET recovery must remain free of resubmission and second metering. Test storage failures at the boundary, not just rejected promises. A synthetic test proves those exercised boundaries; it does not qualify an authenticated provider or a production deployment.

## Keyboard, visuals and performance

Use native semantics and familiar controls. Apply [WAI-ARIA patterns](https://www.w3.org/WAI/ARIA/apg/patterns/grid/) when implementing a composite grid; do not add `role=grid` without its required keyboard behaviour. Verify visible focus, logical traversal, Escape/return focus, selection announcements, zoom/reflow, contrast and reduced motion in use. Automated accessibility checks do not establish full assistive-technology usability.

Collect task-completion time separately from setup/build time, browser rendering responsiveness and provider latency. Record failures, actions, repeated navigation, incorrect conclusions and people needing help. Use standard browser performance measurements where applicable. Establish a measured baseline and a justified target before claiming a speed improvement; a configured timeout is not a user-experience target.

## Competitive evaluation

Define the job before selecting screens. Match business identity, query, geography, device, language, date/freshness, result depth and source availability. If datasets differ, evaluate the interface and the data separately. Use authorised access to the competitor; public documentation alone cannot prove task speed or accuracy.

Have users attempt the same tasks in balanced order. Record whether they reached the correct conclusion, how much effort it took, the cost and coverage they received, and which experience they preferred and why. Report uncertainty and the population actually tested. Determine the amount of evaluation from the decision and observed variation, not a convenient sample count. A public claim names its task, baseline, date, method and limitation. Do not collapse accuracy, enjoyment, price and data coverage into a single unexplained score.

[Playwright's primary guidance](https://playwright.dev/docs/best-practices) supports testing user-visible behaviour, isolated tests, controlled third-party responses, accessible locators and failure traces. This plan applies those methods to the existing application rather than treating the number of tests as evidence of product superiority.
