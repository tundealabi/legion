# Target app requirements

If Legion is going to run campaigns against your app, read this first. Campaigns last hours to days: synthetic users on the real UI, plus optional growth and traffic runs. Your stack does not matter. The environment does.

Tiers:

- MUST: we cannot start without it
- SHOULD: we can start, but findings get weaker or ops get painful
- NICE: better measurements if you have it

## Environment

**Dedicated staging you own.** MUST. Legion generates traffic for hours or days. Do not point it at production. Do not point it at shared staging other teams depend on.

**A database reset the operator can run.** MUST. Collision campaigns wipe between runs. Growth campaigns start from a known snapshot. Migration plus seed, SQL dump, snapshot rollback: any of those work. The person running the campaign has to fire it without waiting on you.

**Staging sized like production, or write down the specs.** SHOULD. If staging is a tiny box, a latency spike might just be the box. Record vCPU, RAM, and DB tier so people can read results against known capacity.

**Same region and provider as the bot machine.** SHOULD. Cross-region hops add egress bills and latency noise.

## Accounts and auth

**Seedable test accounts.** MUST. One account per bot. Browser campaigns usually want 10 to 30. HTTP traffic campaigns can want hundreds or thousands. Provide a script or API that creates N accounts and assigns roles if you have them. Admin, member, and viewer mixes make personas less fake.

**A login the bots can finish.** MUST. Bots use your real UI. CAPTCHA, email verification loops, or mandatory 2FA on staging will stop the run. Turn those off on staging, or exempt the seeded accounts.

**Sessions that last.** SHOULD. Bots stay logged in for hours or days, so token refresh gets a real workout. Refresh bugs show up as campaign findings. That is the point.

## UI

`data-testid` **on the interactive bits of the flows we simulate.** SHOULD. Buttons, inputs, list items, drag handles. Testids are the least brittle way to click things. Without them, every finding is half "did the bot break or did the app break?"

**Accessible names if you skip testids.** MUST as fallback. Bots can find `button "Create issue"` by ARIA role and accessible name. No testid and no name means we cannot automate that control. Users with assistive tech probably cannot use it either.

**A visible result when a mutation finishes.** SHOULD. Each action measures click-to-visible-result latency. Toast, list update, or state change. If the UI does nothing when save completes, we cannot measure latency or confirm the action worked.

## Backend and API

**Tolerate** `X-Legion-User: <bot_id>` **on every request.** MUST. Bots stamp this so you can keep synthetic traffic out of product metrics, or in, your choice. CORS, WAF, and proxies must not strip or reject it. Logging it is SHOULD. Letting it through is MUST.

**Exempt staging from rate limits and bot detection.** MUST. Sustained bot traffic will trip Cloudflare challenges, IP throttles, and production-style rate limits. Exempt the bot machine's IP or relax staging. Otherwise the campaign measures your rate limiter.

**A read API for the entities we collide on.** SHOULD. The collision oracle checks final state through your public API, for example `GET /issues/:id`. If core entities are only visible in the UI, oracle coverage shrinks to whatever the screen shows.

**Trace IDs the client can see.** SHOULD. A `traceparent` response header, or a trace ID in the body. Then a failed click or a data violation can join to the backend trace that caused it. That join is where the useful bugs live.

**Server clocks on UTC via NTP.** NICE. Bot logs are UTC. If clocks drift, timelines lie.

## Data

**Know who created what.** SHOULD. Per-bot accounts already give you creator = bot. Entities with no creator field make cleanup and filtered analysis harder. Note those cases.

**Bulk seed for growth campaigns.** NICE. An API or script that loads six months of usage so we are not growing from an empty database.

## What you get after a run

JSONL of every simulated action: click-to-visible-result latency, success or typed failure, console errors, failed network requests. Each line has a bot ID and timestamps. Filter your backend with `X-Legion-User`.

Aggregates: actions per second, error rate by type, p95 latency per action.

Collision campaigns: oracle verdicts on whether concurrent edits lost data, plus the bot IDs, timestamps, and trace IDs to reproduce.

Growth and traffic campaigns: latency and error rate plotted against data volume or concurrent users.

## Pre-campaign checklist

| #   | Item                                                      | Tier   | Ready? |
| --- | --------------------------------------------------------- | ------ | ------ |
| 1   | Dedicated staging environment, owner sign-off             | MUST   | ☐      |
| 2   | DB reset/restore mechanism, runnable by operator          | MUST   | ☐      |
| 3   | Account seeding script/API (N accounts, roles)            | MUST   | ☐      |
| 4   | Login flow automatable (no CAPTCHA/2FA on staging)        | MUST   | ☐      |
| 5   | `X-Legion-User` header tolerated end-to-end               | MUST   | ☐      |
| 6   | Rate limits / bot detection exempted on staging           | MUST   | ☐      |
| 7   | `data-testid` on core flow elements (or accessible names) | SHOULD | ☐      |
| 8   | Entity read API for oracle verification                   | SHOULD | ☐      |
| 9   | Trace IDs exposed to the client                           | SHOULD | ☐      |
| 10  | Staging specs documented (vCPU/RAM/DB tier)               | SHOULD | ☐      |
| 11  | Bulk data seeding path for growth campaigns               | NICE   | ☐      |
