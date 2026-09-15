# Engineering Standards

The patterns behind the rules in `AGENTS.md`. Read this once before writing code; the `.cursor/rules` files will remind you of the specifics in context.

---

## 1. Tenancy

### The problem this solves

PostgreSQL has row-level security: a policy on the table that no query can escape. **MySQL has no equivalent.** AWS publishes a pattern using views and `CURRENT_USER()`, but it needs a database user per tenant — incompatible with a pooled connection serving every OEM.

So the enforcement is ours, and it must be structural. A convention that "everyone remembers to filter" fails on the first tired Friday.

### The pattern

```ts
// src/data/scoped.ts — the only way to reach tenant-owned tables

export function scoped(ctx: TenantContext) {
  return {
    from<T extends TenantOwnedTable>(table: T) {
      return db.select().from(table).where(eq(table.oemId, ctx.oemId));
    },
    insert<T extends TenantOwnedTable>(table: T, values: InsertOf<T>) {
      return db.insert(table).values({ ...values, oemId: ctx.oemId });
    },
    // update / delete likewise, predicate always applied
  };
}
```

```ts
// A repository. Note the first parameter.
export class OemRepository {
  async findById(ctx: TenantContext, id: OemId): Promise<Oem | null> {
    const [row] = await scoped(ctx).from(oems).where(eq(oems.id, id)).limit(1);
    return row ?? null;   // null → the controller returns 404, never 403
  }
}
```

**`TenantContext` is a required first parameter, not ambient.** Async-local storage looks tidier and fails silently when a job, a scheduled task or a test forgets to establish it. An explicit parameter cannot be forgotten — the code does not compile.

### The three guards

| Guard | Where | Catches |
|---|---|---|
| Lint rule on imports | `.eslintrc` | Reaching the database outside `src/data/` |
| Runtime assertion (non-production) | Drizzle query hook | A statement against a tenant-owned table with no `oem_id` predicate |
| `test/tenancy/` suite | CI | Everything the first two miss |

Build all three in week 1, before the first entity exists.

### Not-found, not forbidden

```ts
// Correct
if (!record) throw new NotFoundError('oem', id);

// Wrong — confirms the record exists in another tenant
if (record.oemId !== ctx.oemId) throw new ForbiddenError();
```

The second form is a disclosure vulnerability that reads as good defensive programming. `FR-TEN-003` exists to prevent exactly it.

---

## 2. Money

### The failure

`DECIMAL(10,2)` in MySQL is exact. A JS `number` is not. Most drivers convert on the way out, and the precision is gone before your code runs.

```ts
0.1 + 0.2                     // 0.30000000000000004
19.99 * 3                     // 59.97000000000001
(1.005).toFixed(2)            // "1.00"  — not "1.01"
```

On a photo book with a basket voucher allocated across lines at different VAT rates, this becomes a cent or two wrong on an invoice. That is a tax and accounting problem.

### The pattern

```ts
// src/money/money.ts
declare const brand: unique symbol;

export type Money = {
  readonly [brand]: 'Money';
  readonly amount: Decimal;     // decimal.js
  readonly currency: Currency;
};

export const Money = {
  of(amount: string, currency: Currency): Money { /* ... */ },
  // deliberately no fromNumber()
  add(a: Money, b: Money): Money {
    assertSameCurrency(a, b);
    return raw(a.amount.plus(b.amount), a.currency);
  },
  multiply(m: Money, factor: Decimal | number): Money { /* quantity is safe */ },
  allocate(total: Money, weights: Decimal[]): Money[] { /* remainder reconciled */ },
  round(m: Money, policy: RoundingPolicy): Money { /* named, explicit */ },
};
```

There is no `fromNumber`. A `number` cannot become `Money` — that is the point.

### Driver configuration — verify, don't assume

```ts
createPool({
  // …
  decimalNumbers: false,   // DECIMAL arrives as string
  supportBigNumbers: true,
  bigNumberStrings: true,
});
```

**Write a test that asserts a `DECIMAL` round-trips as a string.** This setting is one careless change away from being flipped, and nothing else will fail loudly when it is.

### Allocation

A basket discount spread across lines that carry different VAT rates:

```ts
const shares = Money.allocate(discount, lines.map(l => l.netTotal.amount));
// sum(shares) === discount, exactly. The remainder goes to a documented line.
```

Allocating after VAT, or applying the whole discount to one line, gives a wrong tax figure even when the customer-visible total looks right.

### FX

Conversion is applied **once**, at the end, and the rate is snapshotted onto the order. Never per line; never again on display.

---

## 3. API

### Idempotency

```ts
@Post('orders')
async create(
  @IdempotencyKey() key: string,
  @Body() body: CreateOrderDto,
  @Tenant() ctx: TenantContext,       // from the credential — never from body
) { /* ... */ }
```

The key is stored with the result. A replay returns the original response rather than creating a second order. (`FR-API-004`, `FR-CHK-008`)

### The tenant decorator

`@Tenant()` resolves from the authenticated principal. There is no `@Query('oemId')` anywhere in this codebase, and the build check rejects one.

### Errors

```ts
{
  "code": "PRODUCT_NOT_AVAILABLE",     // machine-readable, stable, translatable
  "message": "That product is not available in this OEM.",
  "requestId": "01J8X..."
}
```

Every code has a translation key (`FR-CNT-019`). Codes are part of the contract — additive only on storefront endpoints.

### Additive-only, concretely

| Allowed | Not allowed |
|---|---|
| Add an optional request field | Add a required request field |
| Add a response field | Remove or rename a response field |
| Add an enum value *(if clients tolerate unknowns — design for it from v1)* | Change what an existing enum value means |
| Add an endpoint | Change an endpoint's semantics |
| Relax validation | Tighten validation |

A hybrid mobile app in a customer's hand cannot be force-updated. The version shipped in March is still calling in December.

---

## 4. Async work

Anything slow or failure-prone is a job, never an awaited side effect on the request path. (`FR-ARCH-005`)

| Concern | Mechanism |
|---|---|
| In-application jobs — render, exports, bulk operations | **BullMQ** on Redis |
| Domain events — notifications, fulfilment, reporting | **EventBridge → SQS** with dead-letter queues |

**Do not use BullMQ for domain events.** Its durability is the cache's durability; render jobs are re-runnable by design, order events are not.

Every consumer is idempotent and tolerates at-least-once delivery (`FR-ARCH-007`). Every failure retries with backoff and dead-letters on exhaustion, with an alert (`FR-ARCH-008`).

---

## 5. Audit

```ts
await audit.record(ctx, {
  action: 'oem.activated',
  resource: { type: 'oem', id: oem.id },
  before: previousState,
  after: newState,
});
```

Append-only. Never updated, never deleted. Users who appear in audit records are **deactivated, never deleted** (`FR-IAM-013`); erasure pseudonymises rather than breaking the chain (`FR-SEC-007`).

Build this in week 2, before there is much to audit — a trail with a hole where early development was is not a trail.

---

## 6. Secrets and configuration

- No secret in source, in a client bundle, or in committed configuration. Ever. (`FR-SEC-001`)
- AWS Secrets Manager, read at startup or via the task role.
- Anything that might need changing quickly is **server-side configuration**, not a constant — thresholds, feature flags, minimum supported app version.
- Application security is verified against **OWASP ASVS Level 2** before production release (`FR-SEC-004`). See `docs/SECURITY-STANDARD.md`.

---

## 7. Observability

OpenTelemetry, vendor-neutral, exporting to Grafana Cloud initially.

**OEM context on every log, metric, trace and audit record** (`FR-TEN-009`), set as a resource/baggage attribute in week 1. Retrofitting it means rebuilding every dashboard and alert, and it is what makes per-OEM operational questions answerable at all.

Instrument for the volume figures that are still open (`OQ-01`, `OQ-34`) — when the numbers arrive, the gap should be measurable rather than theoretical.

---

## 8. Git and traceability

- Branch: `feat/FR-ORG-007-oem-activation-gate`
- Commit: `feat(org): enforce activation prerequisites (FR-ORG-007)`
- PR description lists the requirement IDs implemented, and the acceptance criteria satisfied.

A change implementing no requirement is fine — say so explicitly rather than leaving it blank.

---

## 9. What to do when the specification is ambiguous

The BRD classifies statements as CONFIRMED, ASSUMPTION, RECOMMENDATION, OPEN DECISION or GAP. **Do not invent a business rule to fill a gap.** Raise it, get it decided, and record the decision.

Inventing a rule under deadline pressure is how a specification silently stops describing the system.
