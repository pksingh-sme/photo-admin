# Definition of Done

A change is done when every line below is true. Not "mostly true" — a partially satisfied list is how a platform accumulates the debt that makes Phase 4 twice as long as Phase 2.

## Every change

- [ ] Implements a named requirement, or the PR states explicitly that it implements none
- [ ] Requirement IDs in the branch name, commit message and PR description
- [ ] TypeScript compiles under `strict` with no new `any` and no `!` added to silence the compiler
- [ ] Lint and format pass
- [ ] Reviewed by someone who did not write it

## Anything touching tenant-owned data

- [ ] The table carries a non-nullable, immutable `oem_id`
- [ ] All access goes through `src/data/` — no database import elsewhere
- [ ] Every query is scope-filtered; no raw query against a tenant table
- [ ] Out-of-scope access returns **404**, not 403
- [ ] A case added to `test/tenancy/` covering read, write, update, delete and list
- [ ] That suite passes

## Anything touching money

- [ ] No monetary value typed as `number` anywhere in the change
- [ ] All arithmetic through `Money`
- [ ] Rounding points explicit and matching the specification
- [ ] FX applied once, at the end
- [ ] Values that belong on an order are snapshotted, not read live
- [ ] Tests include a rounding-remainder case

## Any API endpoint

- [ ] OEM derived from credentials; no tenant identifier in the request signature
- [ ] Authorization enforced server-side on every request
- [ ] Input validated with Zod at the boundary
- [ ] State-changing endpoints accept an idempotency key
- [ ] Errors use the standard model with a translatable code
- [ ] Every mutation audited with actor, OEM, before and after
- [ ] OpenAPI regenerated and committed
- [ ] **If on the storefront family:** the change is additive only

## Any admin UI screen

- [ ] Uses the generated API client — no hand-written fetch
- [ ] Enforces no business rule the server does not also enforce
- [ ] OEM context visible; scoped correctly
- [ ] Keyboard operable end to end
- [ ] Screen-reader labels and roles on every control
- [ ] Colour is not the sole carrier of any meaning
- [ ] Contrast passes in light and dark
- [ ] axe passes in the pipeline
- [ ] Money formatted from a string; never parsed to a number

## Any async work

- [ ] Runs as a job, not on the request path
- [ ] Status retrievable
- [ ] Consumer is idempotent
- [ ] Retries with backoff; dead-letters on exhaustion; alerts on dead-letter

## Any change to the render worker

- [ ] Every binary pinned by version in the Dockerfile
- [ ] Image digest recorded on each render
- [ ] Reproducibility test passes — same inputs, byte-identical output

## Before a phase exits

- [ ] The phase's exit criterion is **demonstrated**, not asserted
- [ ] OpenAPI published for the frontend project
- [ ] No `test/tenancy/`, `test/money/`, `test/authz/` or `test/contract/` test skipped or quarantined
- [ ] Open questions raised during the phase are recorded, with an owner

---

## The three that are never waived

Most of this list can, under real pressure, be deferred to a follow-up ticket. These three cannot, because each is unrecoverable rather than merely untidy:

1. **The tenancy case in `test/tenancy/`** — the mistake it catches is a cross-tenant data leak
2. **No `number` for money** — the precision is lost at the driver, silently, and surfaces as a tax discrepancy
3. **Version pinning in the render image** — breaks reproducibility invisibly, discovered at the first reprint of an old order

If a deadline requires cutting something, it is not one of these.
