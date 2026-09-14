# Cursor Prompt Playbook — PhotoPrint Admin & API

**How to build this platform with an agentic assistant without losing control of it.**

---

# PART A — THE METHOD

Before the prompts, the operating rules. Most failures on a project this size are not bad prompts; they are good prompts asked at the wrong scale.

## A.1 The scale rule

**1,335 requirements cannot be prompted individually, and must not be prompted in bulk.**

| Scale | Outcome |
|---|---|
| "Build the catalog module" | 4,000 lines you did not read, a plausible-looking tenancy bug, and no way to review it |
| "Add the `products` table and its repository, per `FR-CAT-001`–`004`" | 150 lines you can read in five minutes and reject in one |

**The right unit of work is one that fits in a single review.** If you cannot read the diff carefully, the prompt was too big — regardless of how well the agent performed.

Phases 2 to 5 are largely repetitions of four shapes (new entity, new endpoint, new screen, new job). Those get **templates** (Part D), not bespoke prompts. Writing 200 hand-crafted prompts is wasted effort; writing four good templates used 200 times is not.

## A.2 The loop

Every unit of work, without exception:

```
1. Plan     — ask for a plan, read it, correct it. Do not skip to code.
2. Build    — approve the plan; let the agent implement it.
3. Verify   — run the tests. Read the diff. Ask the adversarial question (Part E).
4. Commit   — at every green state, so the next step has a floor to fall back to.
```

**Step 3 is the one that gets dropped, and it is the one that matters.** An agent that has just written a scoped repository will confidently tell you it is correctly scoped. Run `test/tenancy/` and read the generated SQL instead.

## A.3 Context hygiene

- **Reference the rule explicitly when it matters.** `@.cursor/rules/010-tenancy.mdc` in the prompt, even though it auto-attaches. Explicit reference raises its weight.
- **Reference the requirement.** Paste the requirement text, or `@docs/PHASE-1-BACKLOG.md`. "Per `FR-ORG-007`" means nothing to an agent that cannot see `FR-ORG-007`.
- **Start a new chat per unit of work.** A long session accumulates stale decisions and half-abandoned approaches, and the agent weights them as if they were current.
- **Never let the agent read the whole BRD.** 12,000 lines of specification crowds out the code. Paste the 5–20 lines that govern the task.

## A.4 What to never delegate

| Never delegated | Why |
|---|---|
| The `scoped()` builder in `src/data/scoped.ts` | Every tenancy guarantee rests on it. Write it by hand, review it as a team |
| The `Money` type | Same. A subtly wrong `allocate()` is a tax defect that tests may not catch unless you wrote them adversarially |
| The bootstrap path (`FR-IAM-011`) | The agent will produce a seeded-password shortcut because that is what the training data contains |
| Anything you cannot review | If you would not sign the diff, do not merge it |

Agents are excellent at the 80% of this codebase that is CRUD over a well-specified domain. The 20% that is load-bearing is where a human writes it and the agent reviews it — not the reverse.

## A.5 Reading the agent's confidence

An agent's certainty carries no information about correctness. Three specific tells on this project:

- It says "I've added tenant scoping" — **check the generated SQL**, not the claim.
- It says "this handles the decimal precision correctly" — **grep the diff for `number`**.
- It says "the tests pass" — **check the tests were not weakened to make them pass.** This is common and easy to miss.

---

# PART B — SPRINT 0: THE GUARDS

Eleven prompts, in order. These produce no visible feature and are the only ones that are unrecoverable if skipped. **Do not start Part C until all of these are green.**

---

### B.0 — Open the project

> I'm starting a new codebase. Read `@AGENTS.md`, `@docs/ENGINEERING-STANDARDS.md` and `@docs/REPOSITORY-STRUCTURE.md` in full.
>
> Then summarise back to me, in your own words: (a) the five rules that are never relaxed, (b) why `src/data/` is a hard boundary, and (c) what makes this codebase different from a typical Node API you have seen.
>
> Do not write any code yet.

**Why this first.** It verifies the rules were actually absorbed before anything is at stake, and it surfaces a misreading while the cost of correcting it is a sentence.

---

### B.1 — Scaffold

> Scaffold the repository per `@docs/REPOSITORY-STRUCTURE.md`.
>
> - NestJS with the **Fastify** adapter (not Express), TypeScript `strict`, Node 24, ESM
> - Vitest, ESLint, Prettier
> - The exact folder structure in that document, with `.gitkeep` in empty folders
> - `tsconfig` with `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`
> - A health endpoint at `/health` and nothing else
>
> Do **not** add a database, an ORM, authentication, Docker, or any feature module yet. Scaffold only.
>
> When done, show me `package.json` and `tsconfig.json` and confirm `npm run build`, `npm run lint` and `npm test` all pass.

---

### B.2 — The import boundary

> Add an ESLint rule that makes `src/data/` a hard boundary.
>
> - `no-restricted-imports` blocking `drizzle-orm/*`, `mysql2`, and any path resolving to `src/data/client` — from everywhere **except** files inside `src/data/**`
> - The error message must say: "Database access is only permitted inside src/data/. Use a repository."
> - Add an override permitting the imports inside `src/data/**`
>
> Then prove it: create `src/modules/_probe/probe.service.ts` that imports the Drizzle client, show me that `npm run lint` **fails**, then delete the probe file.
>
> I want to see the failure, not a claim that the rule works.

**"Show me the failure" is the pattern to reuse.** A guard that has never been observed failing is a guard nobody has tested.

---

### B.3 — Schema and the tenant column

> Set up Drizzle for MySQL, plus Testcontainers for integration tests.
>
> - Connection pool configured with `decimalNumbers: false`, `supportBigNumbers: true`, `bigNumberStrings: true` — `DECIMAL` **must** arrive as a string
> - A `TenantOwned` schema helper that adds a non-nullable `oem_id` column and includes it as the leading column of the primary access index
> - One integration test asserting a `DECIMAL(10,2)` column round-trips as a **string**, not a number
>
> The client lives in `src/data/client.ts` and is not exported beyond `src/data/`.
>
> Per `@.cursor/rules/010-tenancy.mdc`.

---

### B.4 — The scoped builder ⚠️ review this one line by line

> Write `src/data/scoped.ts` per `@docs/ENGINEERING-STANDARDS.md` §1.
>
> Requirements:
> - `scoped(ctx: TenantContext)` returns select / insert / update / delete builders
> - Every one applies `oem_id = ctx.oemId` — there is no path that omits it
> - `insert` sets `oem_id` from the context and **ignores** any `oemId` in the supplied values
> - Types are constrained so that passing a non-tenant-owned table is a compile error
> - `TenantContext` is a branded type constructible only from an authenticated principal
>
> Explain your typing approach before writing it. I will review this file by hand — it is the single point on which every tenancy guarantee rests.

---

### B.5 — The runtime assertion

> Add a Drizzle query hook, active in non-production only, that inspects every generated statement.
>
> If a statement targets a `TenantOwned` table and its WHERE clause contains no `oem_id` predicate, **throw** with the offending SQL in the message.
>
> Then demonstrate it: write a test that deliberately constructs an unscoped query through the raw client and assert that it throws. Show me that test passing.

---

### B.6 — The tenancy suite

> Create `test/tenancy/` with a reusable harness per `@.cursor/rules/050-testing.mdc`.
>
> - A fixture creating **two tenants by default** (this is the default for all tests, not just these)
> - A parameterised suite `assertTenantIsolation(entityName, factory)` covering: cross-tenant read by id → 404; update → 404; delete → 404; list → absent; and create-with-forged-oemId → the forged value is ignored
> - Wire it into CI as a separate, required job
>
> There are no entities yet, so write the harness and one placeholder test that is expected to fail. I want the suite to exist before the first entity does.

---

### B.7 — The tenant-parameter check

> Add a build-time check that fails if any HTTP handler accepts a tenant identifier from the request.
>
> Scan controllers for `@Query`, `@Param`, `@Body` and `@Headers` decorators, and for Zod schema keys, whose name matches `/oem|tenant/i`.
>
> Run it in CI as a required job. Per `FR-API-003` — the OEM is derived from the credential and never from the request.
>
> Demonstrate the failure with a probe controller, then delete the probe.

---

### B.8 — The Money type ⚠️ review this one line by line

> Write `src/money/` per `@docs/ENGINEERING-STANDARDS.md` §2 and `@.cursor/rules/020-money.mdc`.
>
> - A branded `Money` type over decimal.js, carrying amount and currency
> - `Money.of(amount: string, currency)` — and **deliberately no `fromNumber`**
> - `add` / `subtract` throw on mismatched currency; the type should make it a compile error where possible
> - `multiply` accepts a quantity (integer or Decimal), never a `Money`
> - `allocate(total, weights)` distributes proportionally, **sums exactly to the total**, and assigns the rounding remainder deterministically to the first line — document the rule in a comment
> - Named `RoundingPolicy` values; no anonymous rounding anywhere
>
> Then write the tests **before** I review the implementation:
> - `allocate` of 10.00 across weights [1,1,1] sums to exactly 10.00
> - `allocate` across lines with different VAT rates, with a remainder
> - `0.1 + 0.2` equals exactly `0.30`
> - `1.005` rounds to `1.01` under half-up
> - Adding EUR to GBP fails

---

### B.9 — Errors and request id

> Add the error model per `@.cursor/rules/030-api.mdc`:
>
> - Every error response is `{ code, message, requestId }`
> - `code` is a stable machine-readable string (SCREAMING_SNAKE), suitable as a translation key
> - A request id is generated per request, attached to logs, and returned in the response and a header
> - A global exception filter maps domain errors to HTTP status
> - **`NotFoundError` is what an out-of-scope access raises — never `ForbiddenError`.** Add a comment explaining why, citing `FR-TEN-003`
> - No stack trace, SQL fragment or driver message ever reaches a response body

---

### B.10 — Telemetry with tenant context

> Set up OpenTelemetry (traces, metrics, logs) exporting via OTLP.
>
> - The OEM id is attached as a **baggage and span attribute** on every request, and appears on every log line
> - Configuration is environment-driven so the backend can change without code change
> - A test asserting that a request made in an OEM context produces a span carrying that OEM id
>
> Per `FR-TEN-009`. This must be right from the first sprint — retrofitting tenant context means rebuilding every dashboard and alert.

---

### B.11 — Sprint 0 gate

> Review the whole repository against `@docs/DEFINITION-OF-DONE.md` and `@docs/PHASE-1-BACKLOG.md` Sprint 0.
>
> For each of the eleven Sprint 0 items, tell me: done, partially done, or not done — with the file that proves it.
>
> Be critical. If something is nominally present but would not actually catch the mistake it is meant to catch, say so. I would rather find that now than in Phase 3.

---

# PART C — SPRINTS 1 TO 3

Now features. Each prompt stays small enough to review.

---

### C.1 — Organization schema

> Implement the organization hierarchy schema per `FR-ORG-001`–`004`, `FR-ORG-006`:
>
> - `oem_groups`, `oems`, `oem_websites`
> - Platform → OEM Group → OEM → OEM Website; every OEM in exactly one group; every OEM exactly one website
> - **No separate Brand entity** — the OEM is the brand
> - OEM code and website domain unique platform-wide
> - Soft-delete/archive columns; no hard delete once referenced (`FR-ORG-011`)
>
> Note: `oem_groups` and `oems` are the tenant *definition*, so think carefully about which of these are `TenantOwned` and which are platform-scoped. Explain your reasoning before writing the migration.

**That last paragraph matters.** The organization tables are the one place where "everything is tenant-owned" breaks down, and an agent will apply the pattern mechanically unless prompted to think.

---

### C.2 — Organization repository and service

> Add the repository and service for organizations.
>
> - Repository in `src/data/repositories/`, every method taking `TenantContext` first where the entity is tenant-owned
> - Service in `src/modules/organizations/` holding the rules: `FR-ORG-005` (create, configure, activate, deactivate, archive), `FR-ORG-008` (no archiving a group with an active OEM), `FR-ORG-009` (deactivation suspends storefront APIs and blocks new orders but does not affect in-flight orders)
> - Rules live in the service, not the controller
>
> Add the tenancy suite cases via `assertTenantIsolation`. Do not add HTTP endpoints yet.

---

### C.3 — The bootstrap ⚠️ do not accept the first answer

> Implement the first-administrator bootstrap for `FR-IAM-011` and `FR-IAM-012`.
>
> Constraints:
> - No seeded password, no hardcoded account, no environment-variable credential, no "dev mode" bypass — `FR-SEC-001` forbids all of these and they survive to production
> - One-time: the path **disables itself** permanently once any platform-administrator grant exists
> - MFA enrolment required before the account can perform any action
> - Every step audited
>
> Propose two different mechanisms with their trade-offs before implementing either. I will choose.

**Expect to reject the first proposal.** The training data is full of seeded admin accounts, and this is the single most likely place for an expedient shortcut to enter the codebase and stay.

---

### C.4 — Authorization

> Implement authorization per `FR-IAM-001`–`004`, `FR-IAM-007`, `FR-IAM-009`:
>
> - A grant associates **user + role + a single OEM**. Permissions are never stored at OEM Group level
> - A user holds different permissions in different OEMs, including within one group
> - Permissions in one OEM never influence a decision in another
> - Default deny; an explicit deny overrides any grant **within the same OEM**
> - A delegated administrator cannot grant a permission they do not themselves hold in that OEM
>
> Provide a `@RequirePermission(action, resourceType)` guard resolving against the request's OEM context.
>
> Add `test/authz/` covering each rule, plus: a user with a grant in OEM A attempting an action in OEM B is denied.

---

### C.5 — Grant revocation

> Implement revocation and deactivation taking effect **within 60 seconds without re-authentication** (`FR-IAM-010`).
>
> Explain your caching strategy for permission resolution and how the 60-second bound is guaranteed — a long-lived JWT with embedded permissions cannot satisfy this, so say what you are doing instead.
>
> Add a test that asserts the bound.

---

### C.6 — Organization endpoints

> Add HTTP endpoints for organization management under `/v1/admin/`.
>
> Per `@.cursor/rules/030-api.mdc`: Zod validation at the boundary; OEM from the credential via `@Tenant()`; `@RequirePermission` on every route; idempotency keys on state-changing routes; standard error model; every mutation audited.
>
> Generate the OpenAPI spec and commit it.
>
> Keep the controllers thin — validation and delegation only. Any rule that appears in a controller is in the wrong file.

---

### C.7 — Audit

> Implement the audit trail per `FR-AUD-*`, `FR-API-010`:
>
> - Append-only. No update path, no delete path — enforce it in the repository, not by convention
> - Records actor, OEM, resource type and id, action, before and after, timestamp, request id
> - Searchable and filterable by OEM, user, resource, action and date
> - Users appearing in audit records are **deactivated, never deleted** (`FR-IAM-013`)
> - Erasure pseudonymises rather than breaking the chain (`FR-SEC-007`)
>
> Write a test proving there is no code path that mutates an existing audit record.

---

### C.8 — Content keys

> Implement editor translation keys per `FR-CNT-010`, `011`, `016`–`021`:
>
> - Keys per OEM per language, scoped to **editor content only** — not website content, which an external CMS owns (`FR-CNT-012`, `013`)
> - Fallback chain: requested language → OEM default → platform default → key identifier (`FR-CNT-017`)
> - A resolved bundle per OEM per language with a version identifier (`FR-CNT-016`)
> - Keys are **additive only** — deprecated, never renamed or deleted (`FR-CNT-020`). Enforce this in the service
> - Completeness reporting (`FR-CNT-018`); changes audited with before and after (`FR-CNT-021`)

---

### C.9 — Currency and FX

> Implement currency configuration and FX per the `PFX` area.
>
> - Per OEM: active currencies and exactly one base currency
> - FX rates as data, with effective dating
> - Conversion helper using `Money` — **applied once, at the end** of a calculation, never per line
> - The rate used is snapshotted where it affects an order
>
> Tests: a price authored in EUR, displayed in GBP, converted once; a rate change that does not alter an existing snapshot.

---

### C.10 — Async foundation

> Implement the async foundation per `FR-ARCH-005`–`008`:
>
> - **BullMQ on Redis** for in-application jobs: retrievable status, retry with exponential backoff, dead-letter on exhaustion, alert on dead-letter
> - **EventBridge → SQS** for domain events, with DLQs
> - A documented idempotency helper for consumers (at-least-once delivery)
>
> Explain in a comment why domain events do **not** use BullMQ — the reasoning is in `@docs/ENGINEERING-STANDARDS.md` §4 and I want it recorded where the next developer will find it.

---

### C.11 — The activation gate

> Implement `FR-ORG-007`. An OEM shall not be activatable without:
>
> 1. A website record
> 2. At least one enabled language, with a default
> 3. At least one active currency, with a base currency
> 4. At least one available product
> 5. Supplier coverage for its delivery countries
>
> Requirements:
> - A single `checkActivationReadiness(ctx, oemId)` returning **every** unmet prerequisite, not just the first
> - Activation blocked unless all pass, with the missing items named in the response
> - Catalog and supplier checks may call **minimal stubs** for now — full catalog is Phase 2, suppliers are Phase 4. Mark the stubs clearly
> - Audited
>
> This is the Phase 1 exit criterion. Write the test as the acceptance criterion: create an OEM, attempt activation, assert the specific missing prerequisites, satisfy them one at a time, then activate successfully.

---

### C.12 — Admin UI shell

> Scaffold `apps/admin-ui`: React 19, Vite, TanStack Router, TanStack Query, Tailwind, shadcn/ui.
>
> Per `@.cursor/rules/040-frontend.mdc`:
> - The API client is **generated from the OpenAPI spec** — no hand-written fetch anywhere
> - Sign-in with MFA
> - App shell with navigation and **persistently visible OEM context**
> - Context selector listing only authorized OEMs (`FR-IAM-008`); switching re-resolves permissions and re-renders navigation (`FR-IAM-006`); single-OEM users see no switcher
> - Keyboard operable; axe wired into the Playwright suite from the first screen
>
> No feature screens yet — shell only.

---

### C.13 — Phase 1 gate

> Run the Phase 1 demonstration from `@docs/PHASE-1-BACKLOG.md` end to end as an automated test:
>
> 1. Sign in as the bootstrapped platform administrator with MFA
> 2. Create an OEM Group and an OEM
> 3. Attempt activation → blocked, missing prerequisites named
> 4. Add website, language + default, currency + base, product availability, supplier coverage
> 5. Activate → succeeds
> 6. Assert the audit trail contains every step
> 7. **As a second OEM's administrator: the first OEM is absent from lists, and a direct request for it returns 404 — not 403**
>
> Step 7 is the one that matters. Assert the status code explicitly.

---

# PART D — TEMPLATES FOR PHASES 2 TO 5

**Phases 2 to 5 are roughly 1,160 requirements.** They are not 1,160 distinct problems — they are four shapes repeated. Use these templates; do not hand-write a prompt per requirement.

Fill the `<angle brackets>`. Keep everything else, including the closing verification line — that line is why the template works.

---

## D.1 — New tenant-owned entity

> Add the `<entity>` entity for requirements `<FR-XXX-001>`–`<FR-XXX-00N>`.
>
> Requirement text:
> ```
> <paste the 5–20 lines from the BRD — not the whole chapter>
> ```
>
> Deliver, in this order:
> 1. Schema in `src/data/schema/` using the `TenantOwned` helper
> 2. Migration
> 3. Repository in `src/data/repositories/`, `TenantContext` first on every method
> 4. Service in `src/modules/<module>/` holding the rules
> 5. `assertTenantIsolation('<entity>', factory)` in `test/tenancy/`
> 6. Unit tests for each business rule, named after the requirement ID
>
> Constraints: no database import outside `src/data/`; no rule in a controller; any monetary field is `Money`; every mutation audited.
>
> Do not add HTTP endpoints — that is a separate step.
>
> When done, show me the generated SQL for a `findById` and confirm the `oem_id` predicate is present.

---

## D.2 — New endpoint

> Add `<METHOD> <path>` for `<FR-XXX-00N>`.
>
> Requirement text:
> ```
> <paste>
> ```
>
> Per `@.cursor/rules/030-api.mdc`:
> - Family: `<admin | storefront>` — **if storefront, this change must be additive only**
> - Zod schema for request and response
> - `@Tenant()` for OEM context; never a request parameter
> - `@RequirePermission(<action>, <resource>)`
> - Idempotency key if state-changing
> - Standard error model; out-of-scope → 404
> - Audited if mutating
> - OpenAPI regenerated and committed
>
> Controller does validation and delegation only.
>
> Confirm afterwards: does this change remove or narrow anything an existing client depends on?

---

## D.3 — New admin screen

> Add the `<screen>` screen for `<FR-UI-00N>` / `<FR-SCR-00N>`.
>
> Per `@.cursor/rules/040-frontend.mdc`:
> - Generated API client only — no hand-written fetch
> - TanStack Query for server state; no duplication into a store
> - Enforces no rule the server does not also enforce; submit and let the server decide
> - Scoped to the active OEM context
> - Keyboard operable; labels and roles on every control; colour never the sole carrier of meaning; contrast passes light and dark
> - Money formatted from a string, never parsed to a number
> - Playwright test including an axe assertion
>
> Use existing components from `src/components/` before adding new ones. If you modify a copied shadcn/ui component, tell me explicitly — those changes can break Radix's focus and ARIA behaviour.

---

## D.4 — New background job

> Add the `<job>` job for `<FR-XXX-00N>`.
>
> Per `@docs/ENGINEERING-STANDARDS.md` §4:
> - `<BullMQ (in-app work) | EventBridge+SQS (domain event)>` — state which and why
> - Idempotent: re-running with the same input produces the same result and no duplicate side effect
> - Retry with exponential backoff; dead-letter on exhaustion; alert on dead-letter
> - Status retrievable (`FR-ARCH-005`)
> - Tenant context carried through and present on every log and span
>
> Tests: the happy path; a duplicate delivery producing no duplicate effect; exhaustion reaching the DLQ.

---

## D.5 — New module (a whole BRD area)

Use this **once per module**, then D.1–D.4 for its contents.

> We are starting the `<module>` module, covering BRD areas `<AREA>` (`<n>` requirements).
>
> Here is the full requirement list:
> ```
> <paste the requirement table for that area>
> ```
>
> Do not write code. Produce:
> 1. The entities and their relationships
> 2. Which are tenant-owned and which are platform master data (`FR-TEN-007`)
> 3. Which requirements are rules belonging in a service, versus schema constraints, versus endpoints
> 4. Which carry monetary values
> 5. Dependencies on modules not yet built
> 6. **Any requirement you find ambiguous, contradictory, or that appears to conflict with another area** — this matters more than the rest
> 7. A build order of units, each small enough to review in one sitting
>
> For item 6: do not resolve ambiguity by choosing. Raise it. Inventing a business rule to fill a gap is how a specification stops describing the system.

**Item 6 is the highest-value output of this entire playbook.** An agent reading 100 requirements in one pass finds contradictions that a human reading them over three weeks does not.

---

# PART E — VERIFICATION PROMPTS

Run these on a schedule, not only when something feels wrong. Each is adversarial by design — the agent is asked to find failure, not to confirm success.

---

### E.1 — Tenancy sweep *(weekly, and before every phase gate)*

> Audit this codebase for cross-tenant data leakage. Assume a leak exists and find it.
>
> Check:
> 1. Any database access outside `src/data/`
> 2. Any query against a `TenantOwned` table without an `oem_id` predicate
> 3. Any repository method not taking `TenantContext`
> 4. Any place an OEM id is read from a request — header, param, body, or a Zod key
> 5. Any out-of-scope path returning 403 instead of 404
> 6. Any `TenantOwned` entity with no case in `test/tenancy/`
> 7. Any raw SQL, `sql` template literal, or query builder escape hatch
> 8. Any cache key, job payload or event that omits the OEM and could be read across tenants
>
> For each finding: file, line, why it is exploitable, the fix. If you find nothing, say which of the eight you could not fully verify and why.

**That last sentence matters.** "No issues found" is not a useful result; "no issues found, but I could not verify item 8 because job payloads are constructed dynamically" is.

---

### E.2 — Money sweep *(after every pricing, cart, tax, voucher or order change)*

> Audit every monetary path in this codebase.
>
> Find:
> 1. Any monetary value typed as `number`
> 2. Any `+`, `-`, `*`, `/`, `parseFloat`, `Number()`, `toFixed` applied to money
> 3. Any `DECIMAL` column read as a number rather than a string
> 4. Any rounding that is not a named `RoundingPolicy`
> 5. Any FX conversion applied more than once, or per line rather than at the end
> 6. Any allocation that may not sum exactly to its total
> 7. Any order-affecting value read live instead of from a snapshot
> 8. Any money serialised as a JSON number
>
> For each: file, line, the incorrect output it could produce, the fix.

---

### E.3 — Additive-only check *(before every release touching storefront endpoints)*

> Compare the current OpenAPI spec against `<the last released version>`.
>
> Identify every change to the **storefront** endpoint family that is not strictly additive:
> - Removed or renamed field
> - Field that became required
> - Narrowed type or tightened validation
> - Removed enum value, or one whose meaning changed
> - Changed status code or error code
> - Changed endpoint semantics
>
> A shipped hybrid mobile app cannot be force-updated. Any of the above is a breaking change for clients in customers' hands. List them; propose an additive alternative for each.

---

### E.4 — Test integrity *(monthly — this one catches a specific, common failure)*

> Review the test suite for tests that have been weakened rather than fixed.
>
> Find:
> 1. Skipped, `.todo`, commented-out or quarantined tests
> 2. Assertions loosened over time — `toBeDefined()` where a value was once compared, `expect.any()` where a shape was once asserted
> 3. Tests asserting implementation rather than behaviour
> 4. Tenancy, money, authz or contract tests that were modified when a feature changed — **the test is usually right and the feature wrong**
> 5. Tests passing for the wrong reason: no assertion reached, a swallowed promise, a mocked-away subject
>
> Use git history. For each, tell me what it was, what it became, and which commit changed it.

---

### E.5 — Requirement coverage *(before every phase gate)*

> For BRD area `<AREA>`, list every requirement `<FR-XXX-001>` through `<FR-XXX-0NN>` and tell me, for each:
>
> - Implemented / partially implemented / not implemented
> - The file and symbol that implements it
> - The test that proves it
>
> Requirement text:
> ```
> <paste the area's requirement table>
> ```
>
> Be strict about "partially". A requirement with a happy path and no rule enforcement is partial. A requirement with code and no test is partial.

---

### E.6 — The privileged-path check *(monthly)*

> The admin UI must have no privileged path — it uses the same API as any other client (`FR-ARCH-002`), and no business rule may be enforced only in a client (`FR-ARCH-003`).
>
> Find:
> 1. Any admin-UI code path reaching data other than through the generated API client
> 2. Any endpoint that behaves differently based on which client called it
> 3. Any validation or rule in the UI with no server-side equivalent
> 4. Any admin endpoint skipping `@RequirePermission`
> 5. Any credential or secret reachable from the client bundle
>
> For item 3, the test is: if I called this endpoint with curl and bad data, would the server reject it?

---

# PART F — PROMPTS NOT TO USE

Each of these produces output that looks like progress.

| Do not ask | What actually happens | Ask instead |
|---|---|---|
| "Build the catalog module" | 4,000 unreviewable lines; a tenancy bug you will find in Phase 4 | D.5 to plan it, then D.1 per entity |
| "Implement all of Part 5" | The pricing engine written from a summary of the rules rather than the rules | One rule at a time, tests first |
| "Make the tests pass" | The tests get weakened | "Explain why this test fails. Do not modify the test." |
| "Add multi-tenancy" | A retrofit across a codebase that assumed a single tenant | Sprint 0, before the first entity |
| "Optimise this" | Caching that breaks tenant isolation | "Profile this and show me where time is spent" |
| "Fix the type errors" | `any` and `!` scattered through the diff | "Fix these type errors without adding `any` or `!`. If a type is genuinely unknowable, tell me and I'll decide." |
| "Refactor this to be cleaner" | Churn, and rules relocated out of services | Name the specific problem to solve |
| "Add caching to the price endpoint" | Prices served from cache — prohibited (`FR-SAC-021`) | Nothing. Pricing is never cached |
| "Generate the whole admin UI from the OpenAPI spec" | 71 screens nobody reviewed, none accessible | D.3, one screen at a time |

**"Make the tests pass" is the most dangerous prompt on this project**, because the tenancy and money suites are exactly the ones an agent will "fix" by relaxing an assertion, and the relaxation reads as a small diff.

---

# PART G — DRIVING PHASES 2 TO 5

The playbook does not contain a prompt per requirement, because that is not how this is built. The loop per module:

```
1. D.5   Plan the module. Read the output. Resolve the ambiguities it raises
         with a human — never by letting the agent choose.
2. D.1   Per entity: schema, repository, service, tenancy test.
3. D.2   Per endpoint.
4. D.4   Per job.
5. D.3   Per screen.
6. E.1, E.2, E.5  Verify before the module is called done.
7.       Commit, regenerate OpenAPI, publish for the frontend project.
```

## G.1 Module order

Follow the phases in `@docs/PHASE-1-BACKLOG.md` and the Development Start Plan. Dependency order and release order are the same here:

| Phase | Modules |
|---|---|
| 2 | catalog → print-spec → pricing |
| 3 | assets → projects → render |
| 4 | cart → tax → payment → orders → suppliers |
| 5 | notifications → reporting → vouchers |

## G.2 Two modules that need a human first

**Pricing (Phase 2).** Two-dimensional precedence, FX applied once, page increments. Write the worked examples from BRD Part 5 as tests **by hand, before prompting for any implementation**. An agent given the rules will produce something plausible; an agent given failing tests will produce something correct.

**Render (Phase 3).** Not a TypeScript problem. The prepress proof comes first — photograph → ICC → imposition → PDF/X, twice, byte-identical, accepted by a real supplier. Only then prompt for the orchestration around it. Do not ask an agent to implement colour management; ask it to orchestrate Ghostscript and libvips, with every version pinned by digest.

## G.3 Keep the playbook current

When the agent makes the same mistake twice, that is a missing rule. Add it to the relevant `.mdc` file and, if it is a whole class of mistake, add a verification prompt to Part E.

Do not add rules in anticipation. A rule set that grows faster than the mistakes it prevents stops being read — by the agent, whose context it crowds, and by the team, who learn it does not reflect reality.
