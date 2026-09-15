# Sprint 0 — Remediation, round 2

**Addendum to `SPRINT-0-REMEDIATION.md`.** Written in response to the R11 gate: 7 done, 4 partial, Sprint 1 blocked on 0.7 / R5.

---

# PART A — CORRECTIONS TO MY DOCUMENTS

Third and fourth errors of mine found by these gates. Both corrected in place.

## A.1 R1's two failure messages were swapped

I wrote that deleting a `@ts-expect-error` yields "unused @ts-expect-error", and that widening the brand fails on the forge proof. It is the other way round:

| Action | Actual result |
|---|---|
| Delete a `@ts-expect-error` where the error still occurs | The underlying error surfaces — `TS2322` or similar |
| Widen the brand so the error no longer occurs | `TS2578` — unused `@ts-expect-error` directive |

`tsc` was correct and my note was wrong. Corrected.

**The general point is worth keeping.** `TS2578` is the more valuable of the two signals: it fires when a type has been *weakened* to the point where a proof no longer proves anything. That is exactly the silent regression R1 exists to catch, and it is why the directives must stay in a typechecked file rather than being replaced by a comment.

## A.2 The backlog's 0.6 line is stale

`PHASE-1-BACKLOG.md` still says the tenancy suite should "exist and fail (no entity yet)." R2 replaced that with the registry assertion, which passes at zero entities and fails only when a `tenantOwned()` table has no suite. The done-when line now reads:

> Registry enumerates every `tenantOwned()` table and asserts each has an isolation suite; passes at zero entities; fails by name when one is missing.

---

# PART B — WHY R5 DID NOT GET BUILT, AND THE CHEAPER WAY TO BUILD IT

R5 is the only item blocking the 0.3–0.8 gate, and it is the one remediation item that was skipped. That is not a coincidence — as I specified it, it was the hardest thing on the list.

**I asked for type resolution.** Detecting `@Body() dto: CreateOemDto` where `CreateOemDto` has an `oemId` property means resolving a type across files: the TypeScript compiler API or ts-morph, an incremental program, handling inheritance, intersections, generics and imported types. That is a real piece of engineering to sit in `scripts/`, and it is brittle once it exists.

**The cheaper and stronger fix is to remove the shape rather than detect it.**

The checker is hard to write because the codebase permits two ways to describe a request body. If there is only one way, and that way is already scannable, the sophisticated checker becomes unnecessary.

| Approach | Cost | Strength |
|---|---|---|
| Resolve DTO class property types with ts-morph | High; brittle | Catches the shape |
| **Ban class DTOs; every input is a Zod schema; ban `@Req()`/`@Res()`** | Low | Removes the shape — nothing to catch |

The existing scanner already reads Zod object keys. If a Zod schema is the *only* permitted way to type a request, that scan covers every body, query and param by construction. `@Req()` is the remaining hole, and banning it is a five-line lint rule.

This is the same move as `src/data/` — not "detect unscoped queries everywhere" but "make there be only one place a query can be built."

**R5 below is rewritten on that basis.** R5c keeps the type-resolving version as optional defence in depth, if you ever need to permit class DTOs.

---

# PART C — PROMPTS

Ordered. R5a and R5b close the gate; F1 and F2 make `main` green.

---

### R5a — Make request inputs uniform

> `FR-API-003` requires the OEM to come from credentials and never from the request. Our checker only catches `@Query('oemId')`, because a request body can currently be typed two different ways. Remove one of them.
>
> **1. Ban class-based DTOs in controllers.** Every `@Body()`, `@Query()` and `@Param()` parameter is typed as `z.infer<typeof SomeSchema>` and validated by a Zod pipe. Add an ESLint rule rejecting a controller parameter whose type annotation is a class or interface reference rather than a `z.infer<...>`.
>
> **2. Ban raw request access.** `@Req()`, `@Res()`, `@Request()`, `@Response()`, `@Next()` are forbidden in `src/modules/**`. `no-restricted-syntax` on the decorator name. Message: "Raw request access defeats FR-API-003 enforcement. Use typed parameters."
>
> **3. Migrate anything existing** to the Zod shape.
>
> Prove all three: a probe controller with a class DTO fails lint; a probe with `@Req()` fails lint; delete both.
>
> The point is that after this, the existing Zod-key scan covers every request input by construction — there is no second shape for a tenant id to hide in.

---

### R5b — Extend the checker over the remaining surface

> With R5a landed, extend `scripts/check-no-tenant-in-request.ts`:
>
> **1. Headers.** Any read of a header matching `/^x-(oem|tenant)/i`, in controllers, guards, interceptors or hooks.
>
> **2. Fastify hooks.** In `onRequest`, `preHandler`, `preValidation`, `preParsing`: any read of `req.query`, `req.params`, `req.body`, `req.headers` on a key matching `/oem|tenant/i`.
>
> **3. Zod keys — recursive.** The current scan is shallow. Recurse into `z.object({ nested: z.object({ oemId: ... }) })`, arrays, unions and `.extend()` chains.
>
> **4. Fixtures.** Add `scripts/__fixtures__/tenant-in-request/` with one file per bypass: `class-dto.ts`, `req-decorator.ts`, `fastify-hook.ts`, `header-read.ts`, `nested-zod.ts`, `query-decorator.ts`. Add a test asserting the checker rejects **every** fixture. The checker's own coverage must be tested, not assumed — that is how it ended up partial the first time.
>
> **5. Header comment** stating plainly what this does and does not prove: it removes the convenient shapes; only auth plus review closes "the OEM never comes from the request" in general.
>
> Run it against the fixtures and show me all six rejected.

---

### F1 — Fix lint on `main`

> `npm run lint` fails on `main`: `'process' is not defined`. The ESLint flat config has no Node globals.
>
> - Add `globals.node` to `languageOptions.globals` for `src/**`, `scripts/**`, `test/**` and `infra/**`
> - Keep browser globals out of those scopes — a `window` reference in server code should still fail
> - `apps/admin-ui/**` gets `globals.browser` instead, when it exists
>
> Confirm `npm run lint` passes on a clean tree, and that a deliberate `window.alert()` in `src/main.ts` still fails.

---

### F2 — Fix the arm64 image build

> The `docker linux/arm64` job fails: the `prepare` lifecycle script runs during `npm ci` inside the image and cannot find `/app/scripts/install-git-hooks.mjs`.
>
> Git hooks have no business in a production image. Fix it properly rather than by copying the script in:
>
> - Run `npm ci --ignore-scripts` in the builder stage, or guard `prepare` with a check that skips when `CI` is set or `.git` is absent
> - Ensure the runtime stage carries only `dist/`, production `node_modules`, and nothing from `scripts/`
> - Keep every base image pinned **by digest**
> - Confirm the image builds for `linux/arm64` and that `docker run` starts and answers `/health`
>
> Then confirm `main` is green end to end, and that the deploy job actually runs rather than being skipped.

---

### F3 — Watch gitleaks fail on GitHub

> R7's local scan fired; the GitHub job has only ever been seen green, which proves nothing.
>
> On a scratch branch, commit a file containing a realistic but fake AWS access key. Push it. Show me the **red GitHub Actions run** and the gitleaks finding in its log. Then delete the branch.
>
> A scanner that has only been observed succeeding is not a verified guard.

---

### H1 — Registry must see the whole source tree

> `test/tenancy/registry.test.ts` only loads `src/data/schema/**`, so a `tenantOwned()` table declared anywhere else is invisible to it — the registry would report full coverage while an unprotected table exists.
>
> - Scan **all** of `src/**` for `tenantOwned(` call sites, not just `schema/**`
> - Assert that every call site is inside `src/data/schema/**` — a `tenantOwned()` table declared elsewhere fails immediately, naming the file
> - Then assert every registered table has an isolation suite
>
> Two independent assertions: tables are declared where expected, and declared tables are covered.
>
> Prove it: declare a `tenantOwned()` table in `src/modules/` temporarily, show the failure naming the file, remove it.

---

### H2 — Money lint by import, not by folder list

> The numeric-coercion lint currently applies to a hardcoded list of module folders. A new module handling money — `invoicing`, `refunds`, `reporting` — is unprotected until someone remembers to add it to the list. That list will fall out of date.
>
> Invert it: apply the rule to **any file that imports from `src/money/`**. A file that touches money is covered automatically; a file that does not cannot produce a monetary defect.
>
> Also extend the banned set: `Number.parseInt`, `Number.parseFloat`, `Math.round`, `Math.floor`, `Math.ceil`, unary `+`, and `JSON.parse` results assigned to a money-typed field.
>
> Prove it: add `Number.parseInt` to a new file that imports `Money`, show lint failing, revert.

---

### H3 — Close the hook's SQL-shape gaps

> Three parser gaps in `src/data/tenant-scope-hook.ts`:
>
> - **Unquoted identifiers.** `from widgets` is not matched where `` from `widgets` `` is. Normalise identifiers before comparison — strip backticks, case-fold
> - **`oem_id IN (?)`.** Currently passes as a predicate. Either reject `IN` on `oem_id` outright, or verify the bound set is exactly the caller's OEM
> - **Aliases and joins.** `from widgets w where w.oem_id = ?` and any joined tenant-owned table must each carry their own predicate
>
> Add a test per gap showing the previous behaviour passing and the new behaviour throwing.
>
> Keep production hook-off, and add a comment recording that R3's startup assertion is the only part that runs in production — that is deliberate, and it is why H1 matters.

---

# PART D — NOT PROMPTS

### 0.11 — named is not agreed

`docs/SECURITY-STANDARD.md` names OWASP ASVS Level 2. That closes the file and not the item. Four things, none of which an agent can do:

1. Sponsor signs off Level 2 as the target
2. ASVS V1–V14 chapters mapped to named owners
3. A third-party verification booked, with a date
4. The relevant ASVS control ids referenced from `.cursor/rules/030-api.mdc` and `010-tenancy.mdc`, so the standard shapes code rather than sitting in a document

Item 4 is the one that decides whether this was worth doing.

### 0.9 — in-memory exporter is the right scope for now

The gate notes the telemetry test uses an in-memory exporter rather than a collector. That is correct for Sprint 0 — it proves the interceptor, which is what 0.9 claimed. A true end-to-end trace needs auth (Sprint 1) and a deployed collector (R10). **Re-verify 0.9 at the Phase 1 gate, not now.** Recording it as done at Sprint 0 scope is accurate; recording it as "a trace carries OEM context end to end" in production would not be.

### 0.3 — drizzle-orm inside `src/data/` is not a defect

The gate lists it as a residual miss. It is necessary — `scoped()` is built on it. The relevant constraint is R4's confinement of the *client*, not the ORM package. No action.

---

# PART E — THE GATE AFTER THIS

**Sprint 1 unblocks when R5a and R5b are green with all six fixtures rejected.** That is the only item failing the stated 0.3–0.8 gate.

**`main` must be green independently** — F1 and F2 — before Sprint 1 starts, regardless of the gate. Beginning feature work on a red trunk means the first Sprint 1 failure is indistinguishable from the pre-existing one.

H1, H2 and H3 are hardening. They should land in the same sitting because each is under an hour and each closes a hole that gets harder to close once entities exist — but they are not gate items.

F3 and 0.11 can run in parallel. 0.9's re-verification and an observed deploy move to the Phase 1 gate.

**Re-run R11 after R5a, R5b, F1, F2.** Same standard: watched failure, or it is not done.
