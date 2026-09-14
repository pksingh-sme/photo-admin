# Repository Structure

A single repository containing the API, the admin UI and the infrastructure. One repository rather than three, because the OpenAPI contract is shared and a contract split across repositories drifts.

```
photoprint-platform/
├── AGENTS.md                      Baseline instructions for AI assistants
├── .cursor/rules/                 Conditional rules, activated by file globs
│   ├── 000-core.mdc               always applied
│   ├── 010-tenancy.mdc
│   ├── 020-money.mdc
│   ├── 030-api.mdc
│   ├── 040-frontend.mdc
│   └── 050-testing.mdc
├── docs/
│   ├── ENGINEERING-STANDARDS.md
│   ├── REPOSITORY-STRUCTURE.md
│   ├── PHASE-1-BACKLOG.md
│   └── DEFINITION-OF-DONE.md
│
├── src/                           API service
│   ├── main.ts
│   ├── app.module.ts
│   │
│   ├── data/                      ◄── THE ONLY PLACE THAT TOUCHES THE DATABASE
│   │   ├── client.ts              Drizzle client. NOT exported beyond this folder
│   │   ├── scoped.ts              Scoped query builder — requires TenantContext
│   │   ├── schema/                Table definitions
│   │   ├── migrations/
│   │   └── repositories/          One per aggregate
│   │
│   ├── money/                     ◄── THE ONLY PLACE MONEY IS CONSTRUCTED
│   │   ├── money.ts               Branded Money type over decimal.js
│   │   ├── currency.ts
│   │   └── rounding.ts            Named rounding policies
│   │
│   ├── platform/                  Cross-cutting concerns
│   │   ├── auth/                  Authentication, credentials, MFA
│   │   ├── authz/                 Grants, scope resolution, guards
│   │   ├── tenant/                TenantContext creation and propagation
│   │   ├── audit/                 Append-only audit writer
│   │   ├── jobs/                  BullMQ queues, workers, DLQ handling
│   │   ├── events/                EventBridge/SQS publish and consume
│   │   ├── errors/                Error model, codes, request id
│   │   └── telemetry/             OpenTelemetry, with OEM context
│   │
│   ├── modules/                   Feature modules, one per BRD area group
│   │   ├── organizations/         ORG
│   │   ├── iam/                   IAM
│   │   ├── configuration/         CFG
│   │   ├── content/               CNT — editor translation keys
│   │   ├── currency/              PFX
│   │   ├── catalog/               CAT PTY VAR CMP OPT AVL
│   │   ├── print-spec/            PSP PGR
│   │   ├── pricing/               PRC PRR PSN PSM PPG
│   │   ├── assets/                AST
│   │   ├── projects/              PRJ PFL
│   │   ├── render/                RND ROP RQU RQA RDV RRS
│   │   ├── cart/                  CART CHK CNS DLV OPL
│   │   ├── tax/                   VAT
│   │   ├── payment/               PAY
│   │   ├── orders/                ORD FUL SEL CXL
│   │   ├── suppliers/             SUP SHP
│   │   ├── notifications/         NOT EVT
│   │   ├── reporting/             MET RPT
│   │   └── vouchers/              VCH VRD VAD VAP
│   │
│   └── contracts/                 Generated OpenAPI + shared DTO types
│
├── apps/
│   └── admin-ui/                  React 19 + Vite
│       ├── src/routes/            TanStack Router
│       ├── src/components/        Including copied shadcn/ui components
│       ├── src/api/               Generated client — do not hand-write
│       └── src/lib/
│
├── workers/
│   └── render/                    Separate container: Ghostscript, LittleCMS, libvips
│       └── Dockerfile             ◄── EVERY VERSION PINNED BY DIGEST
│
├── test/
│   ├── tenancy/                   Cross-tenant suite — blocks the build
│   ├── money/
│   ├── authz/
│   └── contract/
│
├── e2e/                           Playwright, including axe accessibility
│
└── infra/                         AWS CDK (TypeScript)
```

## Why `src/data/` is a hard boundary

MySQL has no row-level security. The only substitute is a single, narrow place where queries are built, where the tenant predicate is applied without exception. If the Drizzle client can be imported anywhere, that boundary does not exist.

**Enforce it in the linter**, not in review:

```json
// .eslintrc — no-restricted-imports
{
  "patterns": [{
    "group": ["**/data/client", "drizzle-orm/mysql2", "mysql2"],
    "message": "Database access is only permitted inside src/data/. Use a repository."
  }]
}
```

with an override allowing the import inside `src/data/**`.

## Module shape

Each feature module follows the same layout, so navigating an unfamiliar one requires no orientation:

```
modules/<domain>/
  <domain>.module.ts
  <domain>.controller.ts      HTTP boundary — validation, no logic
  <domain>.service.ts         Business rules — the authoritative place
  <domain>.schema.ts          Zod schemas for request and response
  <domain>.events.ts          Domain events published
  __tests__/
```

Controllers validate and delegate. Services hold rules. Repositories (in `src/data/`) hold queries. A rule in a controller is a rule that will be bypassed by the next caller.

## The render worker is a separate deployment

It is not a module in the API. It is its own container with prepress binaries installed and pinned, scaled independently, and suitable for Fargate Spot because its jobs are idempotent and re-runnable by design.

**Pin every binary by version in the Dockerfile.** Reproducibility across reprints depends on it, and an unpinned `apt-get install` breaks it silently — discovered when someone reprints a six-month-old order and the colour is different.
