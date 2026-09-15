# Phase 1 Backlog — Foundation and Organization

**Exit criterion:** `FR-ORG-007` passes. An OEM is created and activated through the API and the Admin UI — with a website record, an enabled language and default, an active currency and base currency, an available product and supplier coverage — fully audited, and **invisible to every other OEM's administrator**.

When this demonstrates, roughly 174 requirements are working and the platform's spine exists.

---

## Sprint 0 — The guards (before the first entity)

Nothing in this sprint produces a visible feature. All of it is unrecoverable if skipped.

| # | Item | Requirements | Done when |
|---|---|---|---|
| 0.1 | Repository, CI pipeline, three EEA environments, multi-arch Graviton images | — | A commit builds and deploys |
| 0.2 | Secrets Manager wired before the first credential exists | `FR-SEC-001` | No secret in source; pipeline check rejects one |
| 0.3 | `src/data/` boundary + lint rule rejecting database imports elsewhere | `FR-TEN-002` | An import outside `src/data/` fails the build |
| 0.4 | `scoped()` builder requiring `TenantContext` | `FR-TEN-001`–`004` | No path reachable from feature code compiles unscoped; the raw client is confined to one file; `TenantContext` is unforgeable; the runtime hook covers the residue inside `src/data/` |
| 0.5 | Non-production runtime assertion on missing scope predicate | `FR-TEN-002` | A crafted unscoped statement throws in dev |
| 0.6 | `test/tenancy/` suite + registry assertion | `FR-TEN-010` | Registry enumerates every `tenantOwned()` table and asserts each has an isolation suite; passes at zero entities; fails by name when one is missing |
| 0.7 | Build check rejecting tenant identifiers in request signatures | `FR-API-003` | Adding `@Query('oemId')` fails the build |
| 0.8 | `Money` type, decimal.js, driver returns `DECIMAL` as string | Parts 5–6 | A `number` cannot become `Money`; round-trip test passes |
| 0.9 | OpenTelemetry with OEM as a **span attribute and baggage** (never a resource attribute — a Resource is process-wide and one process serves every OEM) | `FR-TEN-009` | A trace carries OEM context end to end |
| 0.10 | Error model, request id, machine-readable codes | `FR-API-005` | Every error response has the three fields |
| 0.11 | Name the application security standard to test against | `FR-SEC-004` | Written down and agreed |

**Do not start 1.x until 0.3 through 0.8 are done.** They are constraints on how everything after is written.

---

## Sprint 1 — Identity and organization

| # | Item | Requirements | Notes |
|---|---|---|---|
| 1.1 | Organization hierarchy: Platform → OEM Group → OEM → Website | `FR-ORG-001`–`004` | No separate Brand entity |
| 1.2 | Uniqueness of OEM code and website domain | `FR-ORG-006` | Platform-wide |
| 1.3 | Create, configure, activate, deactivate, archive | `FR-ORG-005`, `FR-ORG-008`, `FR-ORG-009` | Archive blocked while an active OEM exists |
| 1.4 | No hard delete once referenced | `FR-ORG-011` | Orders, audit, price snapshots |
| 1.5 | Registered client applications with per-channel credentials | `FR-ORG-010`, `FR-API-009` | Bound to exactly one OEM |
| 1.6 | **Administrator bootstrap** | `FR-IAM-011`, `FR-IAM-012` | One-time, audited, self-disabling once a grant exists, MFA before usable |
| 1.7 | Grants: user + role + single OEM | `FR-IAM-001`–`004` | Never at OEM Group level |
| 1.8 | Default deny; explicit deny beats grant | `FR-IAM-007` | |
| 1.9 | Delegated admin cannot grant what they lack | `FR-IAM-009` | |
| 1.10 | Revocation effective within 60 seconds | `FR-IAM-010` | Without re-authentication |
| 1.11 | Audit trail, append-only, OEM context | `FR-AUD-*`, `FR-API-010` | Build now, not later |

**1.6 is the item most likely to be done expediently.** The shortcut — a seeded password, a bypass flag for local development — is exactly what `FR-SEC-001` forbids and exactly what survives to production.

---

## Sprint 2 — Context, content and currency

| # | Item | Requirements |
|---|---|---|
| 2.1 | OEM context established before any scoped action, persistently visible | `FR-IAM-005` |
| 2.2 | Context switch re-resolves permissions and re-renders navigation | `FR-IAM-006` |
| 2.3 | Selector never reveals unauthorized OEMs | `FR-IAM-008` |
| 2.4 | Editor translation keys, per OEM per language | `FR-CNT-010`, `FR-CNT-011` |
| 2.5 | Fallback chain: requested → OEM default → platform default → key | `FR-CNT-017` |
| 2.6 | Keys additive only — deprecate, never rename or delete | `FR-CNT-020` |
| 2.7 | Resolved content bundle with version identifier | `FR-CNT-016` |
| 2.8 | Translation completeness reporting | `FR-CNT-018` |
| 2.9 | Content changes audited with before and after | `FR-CNT-021` |
| 2.10 | Currencies, base currency, FX rates as data | `PFX` area |
| 2.11 | Enabled languages and default exposed for the external CMS | `FR-CNT-015` |

---

## Sprint 3 — Async foundation and the activation gate

| # | Item | Requirements |
|---|---|---|
| 3.1 | BullMQ queues, workers, retry with backoff, dead-letter + alert | `FR-ARCH-005`, `FR-ARCH-008` |
| 3.2 | EventBridge/SQS domain events; idempotent consumers | `FR-ARCH-006`, `FR-ARCH-007` |
| 3.3 | Idempotency keys on state-changing endpoints | `FR-API-004` |
| 3.4 | Pagination, filtering, sorting conventions | `FR-API-006` |
| 3.5 | Rate limiting per client, per tenant, per endpoint | `FR-API-007` |
| 3.6 | Minimal catalog stub — enough for "at least one available product" | `FR-ORG-007` |
| 3.7 | Minimal supplier stub — enough for delivery-country coverage | `FR-ORG-007` |
| 3.8 | **The activation gate itself** | `FR-ORG-007` |
| 3.9 | OpenAPI generated and published | `FR-API-008`, `FR-SCP-026` |

**3.6 and 3.7 are deliberately stubs.** Full catalog and supplier management is Phase 2 and Phase 4. Phase 1 needs only enough for the activation gate to mean something.

---

## Admin UI, in parallel from Sprint 1

Built against the API, never ahead of it (`FR-ARCH-001`).

| # | Item | Requirements |
|---|---|---|
| U.1 | App shell, navigation, persistent OEM context display | `FR-NAV-*`, `FR-IAM-005` |
| U.2 | Context selector, scoped | `FR-IAM-008` |
| U.3 | Sign-in with MFA | `FR-IAM-012` |
| U.4 | OEM Group / OEM / Website CRUD screens | `FR-ORG-005` |
| U.5 | User and grant management | `FR-IAM-002`, `FR-IAM-009` |
| U.6 | Translation key editor | `FR-CNT-010` |
| U.7 | Currency and FX configuration | `PFX` |
| U.8 | Audit log viewer, scoped and filterable | `FR-AUD-*` |
| U.9 | Accessibility baseline + axe in the pipeline | `FR-SCP-007`, `FR-UIA-*` |

---

## The Phase 1 demonstration

1. Sign in as a platform administrator (bootstrapped, MFA enrolled)
2. Create an OEM Group and an OEM
3. Attempt activation → **blocked**, with the missing prerequisites named
4. Add website, language + default, currency + base, product availability, supplier coverage
5. Activate → **succeeds**
6. Show the audit trail for every step
7. Sign in as a second OEM's administrator → **the first OEM is not visible, and a direct request for it returns 404**

**Step 7 is the one that matters.** Steps 1–6 show a feature; step 7 shows the platform is safe to sell.
