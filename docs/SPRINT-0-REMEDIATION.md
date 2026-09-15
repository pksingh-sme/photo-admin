# Sprint 0 — Remediation

**Addendum to `CURSOR-PROMPT-PLAYBOOK.md`, Part B.**
Written in response to the B.11 gate audit. Eleven prompts, ordered by leverage.

---

# PART A — TWO CORRECTIONS TO MY OWN DOCUMENTS

The audit found two errors in `PHASE-1-BACKLOG.md`. Both are mine, and both are now corrected in that file.

## A.1 Item 0.9 said "resource attribute". That is wrong.

The backlog said the OEM id should be attached as an **OpenTelemetry resource attribute**. A Resource describes the *process*, is fixed at SDK initialisation, and is identical for every span the process emits. In a multi-tenant service one process serves every OEM, so a resource attribute would either be absent or — worse — carry one tenant's id on every other tenant's spans.

**Span attribute plus baggage is correct**, which is what was built. The implementation is right and the specification was wrong. Corrected.

## A.2 Item 0.4's done-when line was not achievable as written

I wrote: *"an unscoped query against a tenant table does not compile."*

That cannot be literally true. The raw Drizzle client must exist somewhere for `scoped()` to be built on top of it, and wherever it exists, `db.select().from(tenantTable)` compiles. The type system can narrow the surface; it cannot eliminate it.

**The honest criterion, now in the backlog:**

> No path reachable from feature code compiles unscoped; the raw client is confined to a single file inside `src/data/`; `TenantContext` cannot be constructed without an authenticated principal; and the runtime hook covers the residual surface inside `src/data/`.

That is a layered guarantee rather than a compile-time one, and it should have been described that way from the start. R4 below tightens the residual surface as far as it will go.

---

# PART B — WHAT BLOCKS SPRINT 1 AND WHAT DOES NOT

The audit's conclusion is correct: the files exist; several guards do not fire.

| | Before 1.x | Reason |
|---|---|---|
| **R1** Typecheck tests in CI | **Yes** | Every compile-time proof in 0.4 and 0.8 is currently unverified. This is the highest-leverage fix in the list and the smallest |
| **R2** Tenancy registry | **Yes** | The first real entity is a Sprint 1 deliverable. Without this, it can ship with no isolation suite and nothing notices |
| **R3** Hook fail-closed | **Yes** | Sprint 1 adds the first tenant-owned tables. A hook that silently exempts unregistered tables is worse than no hook, because it reads as coverage |
| **R4** Narrow the client surface | **Yes** | Cheap now, invasive after repositories exist |
| **R5** Broaden the request checker | **Yes** | Sprint 1 introduces auth and DTOs. `@Body() dto` with an `oemId` field is the exact shape the current checker misses, and it is about to become common |
| **R6** Money lint + opaque amount | **Yes** | Currency configuration is Sprint 2; the bypasses should close before money spreads |
| **R7** Secret scanning | **Yes** | Sprint 1 item 1.6 creates the first real credentials. Scanning must precede them |
| **R8** Error-model residuals | No | Parallel with Sprint 1 |
| **R9** Name the security standard | No | A decision, not a task. Book the meeting |
| **R10** Infra, Docker, Graviton, deploy | No | Parallel with Sprint 1, needed before Phase 1 exit |
| **R11** Re-run the gate | — | After R1–R7 |

**R1 through R7 before Sprint 1.** They are perhaps two days of work and they are the difference between guards and the appearance of guards.

---

# PART C — THE REMEDIATION PROMPTS

---

### R1 — Typecheck the tests ⚠️ do this first

> CI currently runs `nest build`, which uses `tsconfig.build.json` and excludes `*.spec.ts`. Every `@ts-expect-error` compile-time proof in `src/data/scoped.spec.ts` and the money specs is therefore **never typechecked on a pull request**. Those proofs are the only evidence that the `TenantContext` brand and the `Money` type cannot be bypassed, and right now weakening either would not fail the build.
>
> Fix it:
> - Add `npm run typecheck` → `tsc --noEmit -p tsconfig.json` covering **all** sources including specs and `test/**`
> - Add it as a required CI job, separate from `build` so the failure reason is unambiguous
> - Verify `tsconfig.json` (not the build variant) includes `src/**/*.spec.ts`, `test/**` and `scripts/**`
>
> Then prove it two ways:
> 1. Temporarily delete a `@ts-expect-error` in `scoped.spec.ts` where the error is still raised → `typecheck` must **fail** with the underlying error (`TS2322` or similar)
> 2. Temporarily widen the `TenantContext` brand so a plain object satisfies it → `typecheck` must **fail** with `TS2578`, unused `@ts-expect-error` directive — this is the signal that a proof has stopped proving anything
>
> Show me both failures, then revert both.

**Why first.** It costs an hour and retroactively makes two other guards real. Until it lands, "it's a compile error" is an unverified claim.

---

### R2 — Make the tenancy suite self-enforcing

> `test/tenancy/placeholder.test.ts` currently fails on purpose, which makes CI red and creates a process risk the audit named: someone deletes the placeholder to go green, and `FR-TEN-010` goes silent permanently.
>
> Replace it with a **registry assertion** that cannot go silent:
>
> - Maintain a registry of every table created through `tenantOwned()` — either a module-level registry the helper writes to, or a filesystem scan of `src/data/schema/**`
> - Write `test/tenancy/registry.test.ts` that enumerates the registry and asserts **every** tenant-owned table has a corresponding `assertTenantIsolation(...)` suite
> - With zero entities, the assertion passes trivially and **CI is green**
> - The moment a `tenantOwned()` table exists without an isolation suite, it **fails**, naming the table
> - Delete the placeholder
>
> This inverts the failure mode: instead of a red build someone is tempted to silence, adding an entity without a suite turns the build red by itself.
>
> Prove it: add a throwaway `tenantOwned()` table with no suite, show the registry test failing and naming it, then remove the table.

**This is strictly better than what I specified.** A guard that is red by default gets deleted; a guard that goes red only when someone forgets gets fixed.

---

### R3 — Make the unscoped-SQL hook fail closed

> `src/data/tenant-scope-hook.ts` has four gaps the audit identified. Close them in this order of importance:
>
> **1. Fail closed on unregistered tables.** Any table in the schema carrying an `oem_id` column but not created through `tenantOwned()` is currently invisible to the hook. Add a **startup assertion** (all environments, production included) that scans the schema and throws if such a table exists, naming it. A tenant-owned table that forgot the helper must not boot the service.
>
> **2. Check equality, not mention.** The hook currently passes any WHERE clause containing `oem_id`, so `WHERE oem_id IS NOT NULL` satisfies it. Require an equality predicate binding `oem_id` to a parameter, and assert the bound value equals the caller's OEM.
>
> **3. Cover INSERT.** An `INSERT` into a tenant-owned table must carry `oem_id`, and it must equal the caller's. Remove the blanket exemption. Cover UPDATE and DELETE the same way.
>
> **4. Keep production behaviour deliberate.** Leave the hook off in production for cost — but note in a comment that production then relies on R4's confinement plus R2's suite, and that item 1 above is the only part that runs in production.
>
> For each of 1–3, write a test that demonstrates the *previous* behaviour would have passed and the new behaviour throws.

---

### R4 — Confine the raw client

> The audit correctly notes that `db.select().from(tenantTable)` still compiles inside `src/data/`, and that the folder-wide ESLint override switches the boundary rule off for everything in it.
>
> Narrow the residual surface:
>
> - Move the pool and Drizzle instance into `src/data/internal/client.ts`. Export **only** `scoped()` and the repository base from `src/data/`
> - Add a second `no-restricted-imports` rule: `src/data/internal/**` may be imported **only** by `src/data/scoped.ts` and `src/data/tenant-scope-hook.ts`. Every other file in `src/data/`, including repositories, goes through `scoped()`
> - Forbid a second pool: `createPool` may be called exactly once, in `src/data/internal/client.ts`. Add a lint rule or a scan script. A second pool would bypass the DECIMAL flags and the hook — the audit named this and it is the worst of the three
> - Ban `createRequire` and dynamic `import()` of `mysql2`/`drizzle-orm` anywhere
> - Confirm `TenantContext` can only be produced by the authenticated-principal factory, and that `as TenantContext` is rejected — add a `@ts-expect-error` proof (now typechecked, per R1)
>
> Show me the lint failures for: a repository importing `internal/client`, and a second `createPool` call.

---

### R5 — Broaden the tenant-in-request check

> `scripts/check-no-tenant-in-request.ts` catches `@Query('oemId')` and Zod keys. Sprint 1 adds auth and DTO classes, which is exactly where the misses become likely. Extend it:
>
> **1. DTO and interface properties.** Resolve the type of every `@Body()`, `@Query()` and `@Param()` parameter and scan the class or interface for a property matching `/^oem|tenant/i`. The audit's example — `@Body() dto: CreateOemDto` where the DTO has `oemId` — must fail.
>
> **2. Ban raw request access.** `@Req()`, `@Res()`, `@Request()`, `@Response()` are forbidden in controllers. They defeat every other check, and there is no legitimate use in this codebase. If one is ever genuinely needed, it requires an explicit, reviewed allowlist entry.
>
> **3. Fastify hooks.** Scan `onRequest`/`preHandler`/`preValidation` hooks for reads of `req.query`, `req.params`, `req.body` or `req.headers` on a key matching `/oem|tenant/i`.
>
> **4. Headers.** Any header read matching `/x-oem|x-tenant/i` fails.
>
> Add a fixtures directory with one file per bypass, each asserted to be rejected, so the checker's own coverage is tested rather than assumed.
>
> Note explicitly in the script's header comment: this stops the convenient shapes. It is not a proof that the OEM never comes from the request — only auth plus code review closes that.

---

### R6 — Close the money bypasses

> Two holes in `src/money/`:
>
> **1. `amount` is a public `Decimal`.** `a.amount.plus(b.amount)` performs cross-currency arithmetic with no currency check — the exact thing the type exists to prevent. Make the underlying `Decimal` inaccessible: a private field with a symbol key, or a module-private `WeakMap`. Arithmetic goes through `Money` methods only. Expose `toString()` and a formatter for display.
>
> **2. No lint rule on numeric coercion.** Add `no-restricted-syntax` rules rejecting `parseFloat`, `Number(...)`, `+expr` and `.toFixed(` anywhere in `src/money/**`, `src/modules/pricing/**`, `src/modules/cart/**`, `src/modules/tax/**`, `src/modules/vouchers/**`, `src/modules/orders/**`. Message: "Monetary values never pass through a JS number. Use Money."
>
> Also make `CurrencyMismatchError` extend `DomainError` so it surfaces as a stable `CURRENCY_MISMATCH` code rather than a generic 500 (this is the 0.10 residual the audit flagged).
>
> Prove both: show that `a.amount.plus(b.amount)` no longer compiles, and that `parseFloat(price)` in a pricing file fails lint.

---

### R7 — Secret scanning, before the first credential

> Item 0.2 is absent. Sprint 1 item 1.6 creates the first real credentials, so this must land first. `FR-SEC-001`.
>
> - Add **gitleaks** as a required CI job, scanning the full history on `main` and the diff on pull requests
> - Add a pre-commit hook running the same scan on staged files
> - Add a `.gitleaks.toml` with rules for AWS keys, private keys, generic high-entropy strings, and connection strings containing credentials
> - Commit `.env.example` with **names only, no values**; ensure `.env` is git-ignored
> - Add a Secrets Manager client in `src/platform/config/` that resolves secrets at startup, with local development reading from environment and **failing loudly** if a required secret is absent — never falling back to a default
>
> Prove it: commit a file containing a realistic fake AWS key on a scratch branch, show the CI job failing, then remove it.
>
> The absence of a `.env` today is not a guard. The guard is the scanner.

---

### R8 — Error-model residuals *(parallel with Sprint 1)*

> Two gaps from the audit:
>
> - Fastify-level failures — malformed JSON, payload too large, unsupported media type — may not reach the Nest exception filter. Add `app.getHttpAdapter().getInstance().setErrorHandler(...)` producing the same `{ code, message, requestId }` shape
> - Add a test asserting that a request with a malformed JSON body returns the standard error envelope, not Fastify's default

---

### R9 — Name the security standard *(a decision, not a task)*

> Item 0.11 needs a named standard, per `FR-SEC-004`.
>
> **Recommendation: OWASP ASVS, Level 2**, verified before production release.
>
> Level 2 is the right target: this platform processes personal data including customer photographs (`FR-SEC-003`), operates under GDPR with erasure and residency obligations, and handles payment flows — while delegating card data to a PSP, so it is not itself in PCI DSS scope for cardholder data. Level 3 is for systems where compromise threatens life or critical infrastructure, and the extra cost is not proportionate here.
>
> What this needs from the team, not from an agent:
> - Sponsor agreement on ASVS Level 2 as the target
> - A mapping of ASVS V1–V14 chapters to owners
> - A pre-release verification booked with a third party
> - The ASVS control ids referenced from the relevant `.cursor/rules` files, so the standard shapes the code rather than sitting in a document
>
> Record the decision in `docs/SECURITY-STANDARD.md`.

---

### R10 — Infrastructure *(parallel with Sprint 1, required before Phase 1 exit)*

> Item 0.1 is a repository and CI only. Add, in this order:
>
> 1. **Dockerfile**, multi-stage, `linux/arm64` — Graviton from the first image, per the technology selection. Non-root user. Every base image pinned **by digest**, not by tag
> 2. **`infra/` CDK app** in TypeScript: VPC, ECS Fargate service on ARM64, Aurora MySQL, ElastiCache, S3, Secrets Manager — **all in an EEA region** (`FR-SEC-005`)
> 3. **Three environments** — dev, staging, production — as CDK stages. Aurora Serverless v2 with **scale-to-zero on dev and staging only**, never production
> 4. **Deploy pipeline**: build multi-arch image, push to ECR, deploy to dev on merge to main; staging and production gated
> 5. **CI on ARM** — `runs-on: ubuntu-24.04-arm` so tests run on the architecture that will serve production
>
> Then the 0.1 done-when is real: a commit builds and deploys.

---

### R11 — Re-run the gate

> Re-run the B.11 Sprint 0 gate audit against `@docs/DEFINITION-OF-DONE.md` and `@docs/PHASE-1-BACKLOG.md`.
>
> Apply the same standard as the previous audit: for each of the eleven items, done / partially done / not done, with the file that proves it, and — where partial — the specific mistake the guard would still fail to catch.
>
> Additionally, for each of R1 through R7, confirm the demonstration was actually performed and observed, not merely described. A guard whose failure nobody has watched is not verified.
>
> Do not mark an item done because the file exists.

---

# PART D — WHAT THE AUDIT GOT RIGHT THAT IS WORTH KEEPING

Three habits in that audit are worth making standard, because they are what made it useful:

**It separated "the file exists" from "the guard fires."** That distinction is the whole value of a gate. Most audits conflate them and produce a green report over a hollow codebase.

**It named the specific bypass for each partial item.** "0.5 will not catch `WHERE oem_id IS NOT NULL`" is actionable in a way that "0.5 is partially complete" is not. Every finding in Part C above exists because the audit was specific enough to act on.

**It checked the mechanism, not the claim** — that `nest build` excludes specs, and therefore that the compile-time proofs were decorative. That finding invalidated two other items and could only be reached by looking at what CI actually runs rather than at what the code appears to assert.

Use the same standard at every phase gate. `CURSOR-PROMPT-PLAYBOOK.md` Part E.5 is the coverage prompt; this audit is the quality bar it should be held to.
