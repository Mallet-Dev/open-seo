# OpenSEO workbench roadmap

Build an open search workbench that helps people understand evidence, choose useful work and see what changed. Extend the upstream application and working services. Keep the broad scope: keyword research, organic and geographic rank history, competitors, backlinks, technical audits, content, AI visibility, reviews, first-party analytics, reporting and agent access.

This is a development roadmap, not a claim that these capabilities are complete or that the product outperforms another tool.

## Public fork

The upstream [OpenSEO repository](https://github.com/every-app/open-seo) is [MIT-licensed](https://github.com/every-app/open-seo/blob/main/LICENSE). Preserve its copyright, licence, history and applicable dependency notices. Keep the upstream relationship visible. Publish the maintained application and reproducible setup, with invented examples. Private operational records, customer data, local fixture databases, credentials and developer artifacts do not belong in a public release.

A local branch is not a GitHub fork. Select the repository owner and public name before creating the remote. Review the exact public payload, dependency notices and setup from a clean checkout before publishing. Keep independent changes easy to compare with upstream and contribute compatible fixes back where useful.

## How to compete

A useful first comparison is a local business or agency moving from discovery to verified action across search channels. This is a development focus, not a restriction of the broader product.

| Reference                                                                                                                              | Established capability                                                        | Our development target                                                                               | Proof required                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [Ahrefs Opportunities](https://help.ahrefs.com/en/articles/9127446-where-can-i-quickly-find-opportunities-to-improve-my-website-s-seo) | Prioritised content, link and technical opportunities, with report drill-down | Keep evidence, comparison, a chosen action and its later measurement connected                       | Complete matched tasks correctly with less lost context; compare against actual authorised competitor use |
| [Semrush Position Tracking](https://www.semrush.com/kb/548-configuring-position-tracking)                                              | Engine, device and location targeting with campaign configuration             | Make effective settings, source, cost and compatible comparisons clear throughout the workflow       | Exact targeting retained through approval, collection, export and history; no silent setting changes      |
| [Local Falcon](https://www.localfalcon.com/answers/answers/323-what-is-local-ai-visibility)                                            | Geographic visibility, competitor reports and AI answers with sources         | Linked map, table and evidence views; honest coverage and understandable changes across dates        | Same selected business and point across views; no failed point counted as absence or zero                 |
| [Ahrefs data infrastructure](https://ahrefs.com/big-data)                                                                              | Its own large-scale crawl and retained search datasets                        | Choose suitable licensed providers and first-party sources, preserve provenance and measure coverage | Reconcile samples against source evidence; disclose differences in coverage, freshness and methodology    |

Copying an interface does not reproduce a search index or prove a better product. Study observable workflows and reusable licensed code. Reimplement mechanisms where rights to redistribute the original code are not established. Keep a short source, licence, mechanism, improvement and proof record with each material reuse. Use deeper reverse engineering only when normal source or behaviour inspection cannot answer the actual question.

## Interaction principles

Engelbart's [1968 research](https://dougengelbart.org/content/view/140/) describes structured information, direct links, controllable views, pinned context and coordinated input. His [demo outline](https://dougengelbart.org/content/view/333/) shows mouse, keyboard and command feedback working together. The following are our application of those ideas, not claims about his endorsement of this design.

- Select once, inspect in context. A map point, keyword or page keeps its identity across the chart, table and evidence panel.
- Change the view without losing the work. Preserve filters, selection, project, date, drafts and browser history where they remain meaningful. Warn when a comparison becomes incompatible.
- Offer pointer discovery and keyboard fluency. Visible controls work with either input. Arrow keys move within spatial controls; Tab moves between controls; Escape closes temporary views and returns focus. Commands show their result and remain discoverable. Do not hijack text editing or browser shortcuts.
- Make exploration rewarding. Immediate linked highlighting, readable comparisons, useful sorting, undo where supported and optional motion help people see patterns. Avoid rewards, decoration or animation that obscure evidence or imply a business result.
- Show the amount actually known. Missing, pending, excluded, failed and observed zero are different states. Visualisations need units, time, denominator and a usable text or table equivalent. Do not apply a competitor's metric name to a different formula.
- Keep a consistent visual system. Use blue, orange and dark ink, readable contrast, intentional density and responsive layouts. Status must remain understandable without colour or motion.
- Keep humans in control. Read-only exploration is easy; spending, public changes and destructive actions require the appropriate explicit action. Agents use the same scoped services and validation as the interface.

## Current Maps workflow

Campaigns can prepare a geographic request, review its settings and estimate, approve and start remaining points, check queued results, inspect individual evidence and publish a complete saved map. Campaign, scan and run selections have typed links that survive reloads. Pending, unknown submission, uncertain billing and missing source time remain explicit. Recovery references can be downloaded when receipt persistence fails. Saved runs retain the original returned business rows, including repeated identities, tied ranks and unavailable business names.

The full application has been exercised with a simulated provider, simulated billing and a disposable local database. SQLite migration and actual PostgreSQL write/restart checks cover the storage changes. This establishes the exercised local boundaries, not live-provider, hosted-billing or production qualification. Automated browser specs and actual browser execution are recorded separately.

## Delivery sequence

| Stage                     | Deliverable                                                                                                                         | Acceptance                                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Durable Maps workflow     | Campaign setup, effective request preview, current estimate approval, safe Start, collection recovery and immutable run publication | Invented provider integration plus SQLite/Postgres interruption, isolation and restart proof; browser completion through the actual workflow       |
| Connected investigation   | Navigate among existing keyword, ranking, audit, backlink, local, AI and first-party reports while retaining meaningful context     | A user can trace a result to its source and return without losing selection or a draft                                                             |
| Fluent exploration        | Linked views, persistent comparisons and discoverable keyboard commands where repeated tasks justify them                           | Pointer and keyboard produce equivalent decisions; focus, browser history, mobile and reduced motion checks                                        |
| Action and follow-up      | Reuse saved keywords, notes and existing task/agent consumers to connect an accepted finding with a measured follow-up              | Source-linked action, clear owner/state and later evidence; no causal or revenue claim from correlation alone                                      |
| Community release         | Documented fork, clean setup, realistic examples, contribution guidance and tested update path                                      | Fresh-checkout installation, self-hosting and supported database checks, licence notices, public-payload inspection and explicit release authority |
| Competitive qualification | Matched user tasks on our application and the relevant competing tools                                                              | Record correctness, completion, effort, interaction time, data cost, coverage and preference; publish only the comparison actually supported       |

Existing local proofs are retained; changed behaviour gets the smallest affected check. Full workflow acceptance remains open where a stage has only component proof. Do not replace feature completion with a larger navigation menu, a visual score or a synthetic benchmark.

## Evidence and evaluation

Use [the evaluation plan](QUALITY-EVALUATION.md). Quick deterministic tests protect contracts; browser tasks prove interaction; real source qualification proves provider behaviour; people using the product judge clarity, usefulness and enjoyment. None substitutes for the others. Measure actual duration before setting runtime targets. Keep diagnostics on failure and fix a reproduced cause rather than adding retries.

External documentation above was inspected on 15 November 2026. Product descriptions are source claims, not independently measured comparative results. No competitor account, paid request, private dataset or superiority result is implied by this roadmap.
