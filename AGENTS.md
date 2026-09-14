# PhotoPrint Platform — Admin Section & API

Multi-tenant SaaS for personalised printed products, serving the European market.
This repository delivers **the Admin section and the API layer** (BRD `FR-SCP-020`).
The storefront web app (Angular) and the hybrid mobile app are **a separate project** (`FR-SCP-021`) and are not built here.

## Stack

TypeScript (strict) · Node 24 LTS · NestJS on Fastify · Drizzle ORM · MySQL (Aurora) · Redis · React 19 + Vite + TanStack Router · AWS (ECS Fargate, S3, SQS, EventBridge) · CDK

## The five rules that are never relaxed

These come from the BRD and are not style preferences. Code that violates any of them is wrong even if it works.

### 1. The tenant is derived from credentials, never from the request

The OEM in force comes from the authenticated session or API credential. It is **never** read from a header, query parameter, path segment or body — not even as a convenience for testing. (`FR-API-003`, `BR-ARCH-003`)

### 2. Every query against tenant-owned data is scope-filtered

MySQL has no row-level security, so the database will not catch a mistake here. Scoping is enforced in the data-access layer and nowhere else is allowed to reach the database. An out-of-scope read returns **not found**, never forbidden — the difference leaks which records exist. (`FR-TEN-001`–`003`)

### 3. Money is never a JavaScript number

`DECIMAL` columns are read as strings. All monetary arithmetic uses the `Money` type. `number` arithmetic on a price, tax, discount or total is a defect, not a shortcut. (Parts 5 and 6)

### 4. No business rule lives only in a client

The server is authoritative for every rule. The Admin UI may duplicate a rule for responsiveness, but it never enforces one, and it has no privileged path to the database — it uses the same API as every other client. (`FR-ARCH-002`, `FR-ARCH-003`)

### 5. Every mutation is audited

Who, what, which OEM, before and after. Append-only. (`FR-API-010`, `FR-AUD-*`)

## How work is traced

Every requirement in the BRD has an ID (`FR-ORG-007`, `FR-TEN-002`, …). Branches, commits and pull requests reference the IDs they implement. If a change implements no requirement, say so explicitly in the PR — that is allowed, but it should be a deliberate statement rather than an omission.

## Where things live

```
src/
  modules/<domain>/        feature modules — controllers, services, schemas
  data/                    THE ONLY place that imports the database client
  money/                   Money type and decimal arithmetic
  platform/                cross-cutting: auth, tenant context, audit, jobs, events
  contracts/               generated OpenAPI + shared DTO types
apps/admin-ui/             React admin client
test/tenancy/              cross-tenant access suite — never skipped
infra/                     CDK
```

## Before you write code

Read `docs/ENGINEERING-STANDARDS.md`. The detail behind all five rules is there, with the patterns to follow and the specific mistakes this stack invites.
