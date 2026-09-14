# Development Kit — How to use this

This kit turns the BRD into something a team (and Cursor) can build against. Copy its contents into the root of the new code repository.

```
photoprint-platform/
├── AGENTS.md              ← from this kit
├── .cursor/rules/         ← from this kit
└── docs/                  ← from this kit
```

## What each file is for

| File | Purpose | Read it |
|---|---|---|
| `AGENTS.md` | Baseline instructions. Cursor reads this automatically in every session, as do most other AI coding tools | Everyone, first |
| `.cursor/rules/000-core.mdc` | Always active. The constraints that apply to every file | — (automatic) |
| `.cursor/rules/010-tenancy.mdc` | Activates on data-access files | — (automatic) |
| `.cursor/rules/020-money.mdc` | Activates on pricing, cart, tax, voucher, order files | — (automatic) |
| `.cursor/rules/030-api.mdc` | Activates on controllers, DTOs, guards | — (automatic) |
| `.cursor/rules/040-frontend.mdc` | Activates on `apps/admin-ui/**` | — (automatic) |
| `.cursor/rules/050-testing.mdc` | Activates on test files | — (automatic) |
| `docs/ENGINEERING-STANDARDS.md` | The patterns, with code | Everyone, before writing code |
| `docs/REPOSITORY-STRUCTURE.md` | Folder layout and why the boundaries are where they are | Everyone, first week |
| `docs/PHASE-1-BACKLOG.md` | The actual first sprints, mapped to requirement IDs | Lead, then the team |
| `docs/DEFINITION-OF-DONE.md` | The checklist a PR is reviewed against | Everyone, pinned |

## How the Cursor rules work

Rules live in `.cursor/rules/*.mdc` — markdown with YAML frontmatter. Three fields control when a rule activates:

- `alwaysApply: true` — in force in every session (only `000-core.mdc` uses this)
- `globs: [...]` — activates when a matching file is in context
- `description: "..."` — lets the agent decide relevance by topic

`AGENTS.md` is read automatically as an always-on baseline. The `.mdc` files add conditional depth so that, for example, the money rules load when you open the pricing module and stay out of the way when you don't.

**Keep the always-applied rule small.** Everything in `000-core.mdc` is spent from every request's context budget. Depth belongs in the glob-scoped files.

## Why these rules exist

Cursor is fast and confident, and this stack has three specific traps it will walk into unprompted:

1. **It will write an unscoped query.** MySQL has no row-level security, so nothing catches it. `010-tenancy.mdc` and the lint rule do.
2. **It will do arithmetic on a price.** `const total = price * qty` looks completely normal and is a tax defect. `020-money.mdc` and the `Money` type prevent it.
3. **It will add a tenant id to a request signature.** Passing `oemId` as a parameter is conventional in most codebases and is a cross-tenant vulnerability here. `000-core.mdc` and the build check reject it.

The rules are not style preferences. They encode the three mistakes that are expensive to discover late.

## Maintaining the rules

Add a rule when the agent repeats a mistake — not in anticipation. A large rule set that nobody trusts gets ignored; a small one that reflects real corrections gets followed. Keep each file under a few hundred lines and split by concern rather than growing one file.

## What this kit does not cover

- **Storefront and mobile.** Angular storefront and the hybrid app are a separate project (`FR-SCP-021`). This repository serves them through the API; it does not build them.
- **The render pipeline's prepress internals.** Phase 3. The Phase 0 prepress proof comes first, and its result shapes that work.
- **Infrastructure detail.** CDK stacks are Sprint 0; the technology selection document covers the choices and their costs.

## Before the first sprint

Four things from the Development Start Plan are not code and should be in motion now:

1. **The prepress proof** — photograph → ICC → imposition → PDF/X, twice, byte-identical, accepted by a real supplier
2. **Ghostscript licensing** to legal (AGPL position, or a commercial licence)
3. **`OQ-03`** — controller or processor. This shapes the data model, not just the paperwork
4. **The release boundary** — the BRD has 1,300 P0 requirements and no MVP. Only the sponsor can set it
