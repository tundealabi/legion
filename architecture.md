# Legion

Continuous multi-user simulation. Real browsers, long runs, structured logs you can join to backend traces.

## 1. Summary

Legion drives real browser sessions against a web app. Each session is a bot. Bots act like concurrent users for hours or days.

This is not k6 or JMeter. Those hit APIs. This is not Playwright Test or Cypress. Those run short scripted flows and stop. Legion runs as synthetic traffic. It can force collisions on shared records. It writes structured logs. Catching bugs is useful. The job is observability you can correlate.

First target is a small issue tracker, Jira/Linear style. The engine stays generic. Point it at another app with config, not engine patches.

Runs are campaigns, not always-on. A campaign provisions infra, seeds accounts and data, runs for a bounded window (3 days is a typical example), analyzes, then tears down and resets. That gives before/after boundaries and caps cost and data growth. Each campaign tests one property: concurrency safety, degradation under data growth, or degradation under traffic scale (§10). Same engine, different data policy and analysis.

## 2. Positioning

This space is not empty. If this is ever open-sourced, the framing has to stay honest.

Artillery's Playwright engine and k6's browser module already do browser-based load testing: N browsers, a scripted flow, a bounded window, throughput, latency, Web Vitals. Do not compete there.

Checkly, Grafana Synthetic Monitoring, and Datadog Synthetics already do scheduled synthetic checks.

LLM persona agents (Crawlix, cbrowser) already do autonomous exploratory testing. This document defers that.

RaceGuard finds API-level races with concurrent request bursts and invariant checks. Useful reference for the collision oracle. No browser, no long run.

ReplicaFuzz is the nearest cousin: multi-client Playwright convergence fuzzing. It targets collaborative and local-first apps in short falsification runs.

What Legion actually does: bots that keep coherent memory for days, weighted-random behavior, orchestrated collisions on shared resources, and client-side logs joined to backend traces. Call it sustained multi-user simulation for concurrency, data growth, and traffic-scale behavior. Not load testing.

The collision oracle is the thing people will quote. Concurrency is still only one campaign type (§10). The engine is a general synthetic-traffic loop. The campaign chooses the property under test.

## 3. Problem

API load testing (k6, JMeter, Artillery HTTP mode) measures server throughput and latency. It sees nothing about the UI.

Manual QA and scripted E2E tests check fixed flows. They run briefly, in isolation. They do not keep several real users on the same records for hours.

Nothing currently in use here does all of this together: sustained concurrent semi-randomized real-browser usage, built-in contention on shared records, and structured client logs joined to backend traces.

## 4. Goals

- Persistent users via real browser sessions. Target by `data-testid` or role plus accessible name. Prefer testids. See §6 decision 2.
- Long runs. Start anytime, run hours to days, stop cleanly on demand.
- Weighted random action selection per persona, not a fixed script, so traffic is not synchronized.
- Deliberate collisions: several bots on the same issue or board, to surface races, lost updates, stale UI. Detect them with an invariant-checking oracle, not only induce them. See §7.
- Client signals backends miss: console errors, failed network requests, click-to-visible-result latency, time-to-interactive, UI state failures.
- Structured, timestamped, joinable logs (bot id, action, target entity, latency, success/failure, trace/request id, intended writes) to a pluggable sink.
- Reusable across projects. Personas and target config live outside the engine.
- Start/stop and live-adjustable bot count without a redeploy.

## 5. Non-goals (v1)

Not a replacement for API throughput benchmarks. k6 and JMeter stay the tools for RPS ceilings. High-volume traffic is in scope later, via HTTP-mode bots: same engine loop, no browser, §14 Phase 5. Never via hundreds of browsers. Browser bots measure experienced UX. HTTP bots generate volume.

Not a scripted E2E regression suite.

Not, in v1, an LLM that improvises from screenshots. Action selection is weighted-random over persona-defined actions. Crawlix already exists. Integrate it later if anyone wants that. Do not build it.

No requirement to hit production. Target is staging the operator owns. Never point this at infrastructure you do not own or have permission to test. That warning ships in the README.

## 6. Key design decisions (settled)

| #   | Decision             | Choice                                                                                                                                                                                                                 | Rationale                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Persona format       | TypeScript functions receiving a Playwright `page` plus a helper API. YAML for orchestration only: bot count, persona weights, think-time ranges, target URL, campaign duration.                                       | Generic YAML step-DSLs grow into a bad programming language. Artillery independently landed on the same code plus YAML split. Audience is developers anyway.                                                                                                                                                                                                                                                     |
| 2   | Element targeting    | Both `data-testid` and role plus accessible name (`getByTestId` / `getByRole`). Prefer testids where they exist. Adding testids on the target app's core interactive elements is Phase 0 work.                         | Personas are TS functions with the full Playwright API, so supporting both costs the engine nothing. Testids are the most stable ("bot broke vs app broke"). `getByRole` needs zero app changes, so other apps can start without a patch. A `getByRole` failure on a well-labeled element can be an accessibility finding. CSS/XPath structural selectors are disallowed. They are the classic flakiness source. |
| 3   | Auth                 | Per-bot seeded accounts. Target app auth: short-lived access token in the response body, refresh token as a cookie. Bots log in through the real UI. Playwright contexts hold cookies. Long sessions exercise refresh. | Shared accounts would undermine collisions (permissions, attribution, presence). Token refresh over hours is itself useful coverage.                                                                                                                                                                                                                                                                             |
| 4   | Process architecture | Grouped contexts: about 5 browser contexts (bots) per browser process. Group size is configurable.                                                                                                                     | Contexts share the ~150MB engine baseline (memory about 1/3 lower than process-per-bot). One crash costs 5 bots, not all. Middle ground between isolation and cost.                                                                                                                                                                                                                                              |
| 5   | Data lifecycle       | Reset staging DB between campaigns. Bot-created entities are tagged/attributable. Per-bot accounts give that for free.                                                                                                 | Unbounded growth over multi-day runs slows the app because of accumulated data, which pollutes the concurrency signal. The operator owns the environment, so reset is viable.                                                                                                                                                                                                                                    |
| 6   | Kill switch          | Flag file watched by the supervisor, plus a tiny CLI (`legion stop`, `legion scale <n>`).                                                                                                                              | Simplest thing that works. No API server or Redis for control.                                                                                                                                                                                                                                                                                                                                                   |
| 7   | Build vs reuse       | Own thin worker loop. Not built on Artillery.                                                                                                                                                                          | Artillery's virtual-user lifecycle (spawn, run scenario, die) fights long-lived stateful bots, which is the whole point. The Phase 1 loop is a few hundred lines.                                                                                                                                                                                                                                                |
| 8   | Infra model          | BYO-infra, self-hosted. Reference target: Hetzner Cloud, campaign-style hourly billing.                                                                                                                                | See §12. Tool ships docker-compose plus cloud-init. No hosted service.                                                                                                                                                                                                                                                                                                                                           |

## 7. Collision-detection oracle

Inducing collisions is not enough. Lost updates have to be detected. A browser-side "no visible error" is not proof of correctness.

1. **Intended-write logging, from Phase 1, day one.** Every mutating action logs an `intended_write` record: `{bot_id, entity_id, field, value_written, timestamp, action_id}`. Values embed a unique verifiable token where possible, for example titles and comments include a nonce like `[b7-a3f9]`. Even before collisions exist, this is the data the oracle needs.

2. **Read-back verification, in-bot, cheap.** After a mutating action, the bot re-reads the entity later in its loop, not immediately, and logs whether its write is still present. That distinguishes "overwritten by another user" (expected under contention) from "silently lost" (no other write occurred, yet the value vanished).

3. **Checker process.** A separate process replays the intended-write log against final state and applies invariants.

   **Read path is the app's public API.** That keeps the oracle app-agnostic and tests what users actually see. The state-reader function is per-app config anyway. An operator who wants direct DB reads writes their reader that way. The mechanism stays generic.

   **Timing is campaign end against final state,** plus optional quiescence checks mid-campaign. Supervisor pauses bots about 30s, lets in-flight requests settle, snapshot-checks, resumes. Checking continuously against a moving target produces false positives from in-flight writes.

4. **Invariant format: small TypeScript functions,** same idea as personas. They receive the parsed, ordered intended-write log plus a state reader, and return violations. Three generic invariants ship with the engine:
   - **Last-writer-wins consistency.** For any field, final state must equal the latest timestamped intended write, within a clock-skew tolerance. Writes closer together than the window are ordered "indeterminate", not violated.
   - **No orphaned values.** Final state must be some bot's written value or seeded data. A value nobody wrote means corruption or an interleaving bug.
   - **Conservation counts.** Entities created minus deleted equals entities present. Catches duplicate writes and silent drops.

   App-specific invariants (issue status must follow legal workflow transitions) are extra TS functions in `oracle/`.

5. **Four verdicts, not two.** That is what keeps the oracle useful instead of noisy.
   - `consistent`. Write present as expected.
   - `superseded`. Overwritten by a later write from another bot. Expected under contention. Logged, not alarmed. Majority verdict during collision campaigns.
   - `indeterminate`. Concurrent writes too close to order confidently. Tracked for volume. A spike marks a contention window worth a targeted rerun.
   - `violation`. Write lost with no superseding write, orphaned value, or count mismatch. The alarm. Carries bot IDs, timestamps, and trace IDs for joining to backend traces.

6. **Verdicts feed the log stream** as first-class events. A `violation` correlates by timestamp and trace-id with the bot actions and backend traces that produced it.

The two verification layers are complementary. The checker (API-reading) proves data correctness. The in-bot read-back catches UI-level lies: server has the write, UI shows stale state. The checker cannot see that.

## 8. Architecture

```
Supervisor (spawns/monitors worker processes; reads YAML orchestration config; watches stop-flag file)
├── Worker process 1 (one browser process, ~5 bot contexts, each running its action loop)
├── Worker process 2 (...)
└── Worker process M
↓ structured JSON logs (action, latency, target entity, intended writes, success/fail, trace id)
Log sink (JSONL files → pluggable: Loki/Grafana or Postgres later)
├── Stats script (actions/sec, error rate, p95 latency per action). v1 analysis tool.
└── Checker process (collision oracle, §7)
↓ (correlation)
Backend observability stack (existing OTel traces/logs, joined via X-Legion-User header + trace ids)
```

### Components

**Bot.** One persistent Playwright browser context is one simulated user, logged in as its own seeded account. Loop: pick a weighted-random action from the persona, wait a randomized think-time, run the persona's TypeScript action, log the result plus intended writes, repeat. Lightweight per-bot state (entities it created or is working on) keeps behavior coherent across a long session. Context restarts on a configurable interval or action count so memory does not creep over multi-day runs. Per-bot state survives restarts.

**Worker process.** Hosts one browser process with a configurable group of bot contexts (default about 5). Crash blast radius is that group. Supervisor restarts the whole worker.

**Supervisor.** Spawns and monitors workers from orchestration config (bot count, target URL, persona weight overrides). Restarts crashed workers. On graceful stop, workers finish the current action, close contexts, exit. Control surface is a flag file. The CLI writes it (`legion stop`, `legion scale <n>`). Supervisor events (worker started/stopped/crashed/restarted) log separately from bot actions.

**Personas (TypeScript).** A persona is a named set of actions. Each action is a TS async function `(page, botContext, helpers) => …` using Playwright APIs. Prefer `getByTestId`, use `getByRole` where appropriate, no CSS/XPath structural selectors. `helpers` provides templated random data, intended-write logging, hot-pool access (Phase 2), and latency measurement brackets. Weights, think-time ranges, and which personas run live in YAML. Adding or reweighting behavior needs no engine change. Adding a new action is writing one small TS function.

**Shared state / collision coordination (Phase 2).** Redis holds a pool of hot resource identifiers (issue IDs) that multiple bots preferentially target. Bots periodically pull and refresh from this pool rather than only acting on privately created resources.

**Logging.** Every bot action emits a structured JSON line. Minimum fields: `timestamp` (UTC), `bot_id`, `action_name`, `target_entity_id`, `latency_ms` (click-to-visible-result, measured to the action's final wait/assert step), `success` / `error` (typed per §16), `trace_id`/`request_id`, `intended_writes[]`. Per bot session: browser console errors (`page.on('console')`, error level), failed network requests (`page.on('requestfailed')`). v1 sink is JSONL files. The sink is a pluggable interface, upgradeable to Loki+Grafana or Postgres/Timescale without changing emission format. v1 analysis is documented `jq` recipes plus a small stats script (actions/sec, error rate by type, p95 latency per action, per bot and aggregate).

## 9. Correlation with backend observability

These logs are a separate layer: client and UX perspective. They do not replace backend logs, APM, or tracing.

Every bot-originated HTTP request carries `X-Legion-User: <bot_id>` so backend logs and metrics can filter bot traffic in or out.

The target app's backend has distributed tracing. The bot side captures and propagates trace IDs so a failed bot action or oracle violation joins to the corresponding backend trace (Phase 3).

Clocks must be UTC and time-synced across bot logs and backend logs, so timelines still line up even without shared trace IDs.

## 10. Campaign types and data lifecycle

The engine is a general sustained synthetic-traffic loop. What a run tests for is a property of the campaign, not the engine. Data-lifecycle policy is set per campaign type. Data growth is contamination in one campaign and the measurement itself in another.

| Campaign type | What it answers                                                           | Data policy                                                                                                   | Primary deliverable                                                                                                |
| ------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Collision     | Does concurrent editing of shared resources corrupt data or break the UI? | Reset DB between runs. Accumulated data would contaminate the concurrency signal.                             | Oracle verdicts (§7) plus joined backend traces                                                                    |
| Growth / soak | How does the app degrade as data accumulates?                             | No reset mid-campaign. Optionally pre-seed a large dataset to start from six months of usage instead of zero. | Trend lines: p95 action latency and error rates vs. entity count over time                                         |
| Traffic scale | How does experienced UX degrade as active-user count climbs?              | Reset or pre-seed as appropriate. The variable is user count, so hold data volume constant.                   | Experienced-latency curves vs. concurrent users (browser bots as sensors inside HTTP-bot volume. See §14 Phase 5.) |

Common mechanics:

- Campaigns run against staging the operator owns and can reset.
- Bot-created entities are attributable (per-bot accounts plus nonce-tagged content), so targeted cleanup or filtered analysis is possible when a full reset is undesirable.
- Vary one dimension per campaign: contention, data volume, or traffic volume. A run that varies several at once produces findings you cannot attribute.

## 11. Tech stack

| Concern                   | Choice                                                                                    | Notes                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Language                  | TypeScript (Node.js)                                                                      | Best Playwright ergonomics. Personas are TS functions.                  |
| Browser automation        | Playwright (headless Chromium shell)                                                      | Grouped contexts per process. `getByTestId`. Console/network hooks.     |
| Worker/process mgmt       | Supervisor process (Node) under `pm2` or systemd. Docker Compose for one-command bring-up | Kubernetes is not needed at this scale.                                 |
| Shared state/collisions   | Redis (Phase 2)                                                                           | Hot-resource pooling. Not needed for control plane.                     |
| Orchestration config      | YAML + Zod validation                                                                     | Weights, bot count, think-time, target URL, campaign duration.          |
| Logging (v1)              | JSONL files + stats script + jq recipes                                                   | Simplest sink. Pluggable interface.                                     |
| Logging (later)           | Loki + Grafana, or Postgres/Timescale                                                     | Upgrade once signal is validated.                                       |
| Metrics (optional, later) | Prometheus + Grafana                                                                      | Aggregate view: actions/sec, error rate, p95 latency.                   |
| Provisioning              | cloud-init file / small provisioning script (Hetzner reference)                           | Fresh server to running Legion in one step. Doubles as docs-by-example. |

## 12. Infra sizing and cost

Workload shape: bots idle in think-time most of the time. CPU is bursty (oversubscribe about 4–6 bots/vCPU). Memory is the binding constraint (~300–400MB per bot context; grouped contexts share ~150MB engine baseline per process).

Rule of thumb: about 3GB RAM plus 0.25 vCPU per bot, memory-bound. Context-restart-on-interval keeps memory from creeping over multi-day runs.

Reference costs (campaign model, Hetzner Cloud hourly billing):

| Scale       | Machine              | 3-day campaign | Full month |
| ----------- | -------------------- | -------------- | ---------- |
| ~10 bots    | CPX31 (4 vCPU / 8GB) | ~€2            | ~€16       |
| ~25–30 bots | 8 vCPU / 16–32GB     | ~€5            | ~€35–60    |

Redis, logs, and supervisor overhead round to zero (log volume about 6MB/day/bot). Two costs not to forget. Staging itself must run for the campaign duration and absorb the traffic. Co-locate bots with staging, same region, separate machines, to avoid egress and latency noise. DB storage also grows during a campaign, managed per campaign type (§10).

Staging sizing is part of the methodology, not just a cost line. Findings have to attribute degradation to the app, not to an undersized box. Either size staging like the production baseline being modeled, or record staging specs (vCPU, RAM, DB tier) in every campaign report so results are read against known capacity. This matters most for traffic-scale campaigns (§14 Phase 5), where thousands of HTTP bots can saturate a small VM and produce a meaningless "the app degrades at N users" claim.

Distribution model is BYO-infra. The repo ships `docker-compose.yml`, this sizing table, and the cloud-init provisioning example. No hosted offering.

## 13. Repository structure (proposed)

```
legion/                     (separate repo from the target app)
├── engine/                 # bot loop, grouped-context worker, Playwright driver, per-bot state
├── supervisor/             # spawns/monitors workers, flag-file watcher, CLI (legion stop/scale)
├── personas/               # TS persona/action functions per target app
│   └── issue-tracker/
├── config/
│   └── campaign.yaml       # bot count, weights, think-time, target URL, duration, group size
├── oracle/                 # intended-write checker, invariant definitions (per-app config)
├── logging/                # pluggable sink interface (JSONL now), stats script, jq recipes
├── shared-state/           # Redis client / hot-pool management (Phase 2)
├── provision/              # cloud-init + provisioning script (Hetzner reference)
└── docker-compose.yml
```

## 14. Phased roadmap

**Phase 0. Prerequisite (target app)**

Work through [`docs/target-app-requirements.md`](docs/target-app-requirements.md). For the first target app that chiefly means:

- Audit and add `data-testid` attributes on interactive elements.
- Build an account seeding script (per-bot accounts via API or DB seed).
- Verify staging exempts rate limiting and bot detection, and tolerates the `X-Legion-User` header.

**Phase 1. Minimal working version**

- Engine loop: grouped contexts, weighted random action picker, think-time, JSONL logging including intended-write records (oracle groundwork from day one).
- 2–3 personas as TS functions for the issue tracker (create issue, comment, move card).
- Supervisor with flag-file kill switch plus `legion` CLI.
- Stats script (actions/sec, error rates, p95 latency per action).
- No Redis yet. Bots act on their own created resources only.
- Goal: real signal flowing within days, not the full generic system first.

**Phase 2. Collisions plus oracle**

- Redis-backed hot-resource pool. Bots preferentially act on shared entries.
- In-bot read-back verification plus checker process with first invariants (§7).
- Browser-context restart-on-interval.

**Phase 3. Correlation plus better observability**

- `X-Legion-User` header propagation.
- Trace-ID capture (backend tracing confirmed available).
- Evaluate upgrading the log sink to Loki+Grafana based on volume and usage.

**Phase 4. Generalization plus open-source packaging**

- Prove genericity on a second target app (new personas folder plus campaign.yaml only, no engine changes).
- Provisioning script/cloud-init polish. Five-minute-quickstart docker-compose.
- License (MIT or Apache-2.0), README with sizing table and "only test what you own" warning, persona-authoring guide.

**Phase 5. HTTP-mode bots (traffic-scale campaigns), explicitly not v1**

- Same engine loop (weighted action selection, think-time, per-bot state, intended-write logging, JSONL emission), but the persona action function receives an authenticated HTTP client instead of a Playwright `page`.
- Cost per HTTP bot: about 1–5MB memory vs about 350MB for a browser bot. The same 8GB box that runs about 20 browser bots runs thousands of HTTP bots.
- Traffic-scale campaign shape: HTTP bots generate the volume ramp. A small fixed set of browser bots (10–20) rides inside that traffic as sensors, measuring how experienced UX degrades as concurrent-user count climbs.
- Built in-engine rather than pairing with k6/Artillery. Reuses the same persona idea, logging format, oracle, and campaign config. One tool, one config, one log stream.
- Methodology: staging must be sized realistically, or its specs recorded in the campaign report, so findings attribute degradation to the app, not to an undersized box (see §12).

**Explicitly deferred:** LLM/agentic action selection. Third-party tools (Crawlix, cbrowser) already occupy this. Integrate rather than build if ever wanted.

## 15. Success signals

Strong signals (real, novel value):

- Finds a UI-only bug invisible to API load testing, for example the UI silently fails to update despite a successful API response.
- The oracle reproduces and proves a real concurrency bug (lost update, duplicate write, broken drag-and-drop under contention) with a joinable backend trace.
- Client-side action latency diverges from server-side response latency in a way that matters, which surfaces frontend-only performance issues.
- Console errors or failed requests surface only after sustained or varied usage, not in short manual QA.
- A backend anomaly (query slowdown, lock contention, memory growth) correlates with bot collision activity.
- Long-session auth (token refresh over hours or days) surfaces session-expiry or refresh-race bugs.

Weak signals (necessary but not sufficient, do not over-index):

- Uptime and stability of the legion itself.
- Dashboards showing traffic volume with no findings.
- Zero errors reported. Absence of findings early on is not proof of app correctness. Personas or volume may need tuning.

**Validation checkpoint.** After the first multi-day campaign against staging, ask whether it surfaced something not already known from backend metrics or manual QA. If yes, invest further: more personas, more collision scenarios, tighter backend correlation. If no, extend duration, volume, or persona variety before concluding. Absence of findings at low maturity is not conclusive.

## 16. Conventions (settled)

All previously open items are resolved (oracle detail → §7; element targeting → §6 decision 2). Two cross-cutting conventions:

- **Per-action latency.** `latency_ms` measures from the action's first interaction to the completion of its final wait/assert bracket, the official click-to-visible-result endpoint. Think-time is never included. Every mutating action must end with an explicit wait/assert step. The `helpers` latency bracket enforces this shape.
- **Flakiness/error taxonomy.** Every failure is classified so "bot broke" is distinguishable from "app broke" during analysis. That grind is the cost of every tool in this category. Minimum error types:
  - Bot-side (suspect the legion): `selector_not_found` (likely selector drift), `timeout_waiting` (timing/think-time tuning), `bot_crash` (engine bug).
  - App-side (suspect the target): `assertion_failed` (UI showed wrong state), `network_request_failed`, `console_error_observed`, `oracle_violation`.
  - Ambiguous cases default to bot-side classification with a flag for review. False alarms erode trust in findings faster than missed bugs do.

## 17. Implementation kickoff notes

Context a fresh implementation session needs beyond the sections above.

**Target app facts (operator-confirmed):**

- The target app does not yet have `data-testid` attributes. Phase 0's audit and addition pass is real work, not a formality. `getByRole` can bridge gaps for well-labeled elements in the meantime.
- Auth: short-lived access token in the response body, refresh token set as a cookie. Bots log in through the real UI. Long sessions exercising refresh is intentional coverage (see §15).
- Account seeding is possible (API or DB seed). Per-bot accounts with distinct roles enable mixed persona populations (admins vs members vs viewers) via campaign config alone.
- The backend has distributed tracing. Phase 3 correlation is viable, not speculative.
- The operator owns staging fully. DB resets, pre-seeding, and co-located deployment are all available.

**Build order within Phase 1: types first.** The three public contracts are TypeScript types, written before any logic, because everything else consumes them:

1. **Persona/action contract.** The exact shape of `(page, botContext, helpers) => …`: what `botContext` holds (bot id, account, per-bot entity memory), what `helpers` provides (random data templating, intended-write logging, latency bracket, hot-pool access stubbed until Phase 2).
2. **`campaign.yaml` schema as a Zod schema.** Validation and documentation from one source. Keep a commented example YAML in `config/`.
3. **JSONL log record schema as a Zod/TS type.** The artifact that hurts most to change. The stats script, oracle checker, and any future Loki dashboards all consume it. Include the §16 error taxonomy as an enum and `intended_writes[]` (§7) from the first version.

These types are the interface documentation. No separate design doc is maintained. If the types and this file disagree, update whichever is wrong in the same change.

**Naming (settled):** repo `legion/`, CLI `legion` (`legion start`, `legion stop`, `legion scale <n>`), HTTP header `X-Legion-User`.

**Scope for the first session:** scaffold plus Phase 1 only (engine loop, grouped contexts, weighted picker, think-time, JSONL sink with intended writes, supervisor with flag-file kill switch, `legion` CLI, stats script, 2–3 issue-tracker personas). No Redis, no oracle checker, no HTTP-mode bots. Those are Phases 2 and 5 by design.
