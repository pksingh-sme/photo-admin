import { Decimal } from 'decimal.js';
import { assertIso4217Code, type Currency } from './currency.js';
import {
  MONEY_DECIMAL_PLACES,
  RoundingPolicy,
  decimalRoundingMode,
  type RoundingPolicy as RoundingPolicyName,
} from './rounding.js';

export type { Currency } from './currency.js';
export { MONEY_DECIMAL_PLACES, RoundingPolicy } from './rounding.js';

/**
 * Branded monetary value. Amount is a Decimal; currency is an ISO 4217 code.
 * Construct only through `Money.of` — there is no `fromNumber`.
 *
 * The type parameter is the currency literal when it is known (`Money<'EUR'>`).
 * Adding `Money<'EUR'>` to `Money<'GBP'>` is a compile error. Heterogeneous
 * `Money` values still throw `CurrencyMismatchError` at runtime.
 */
const moneyBrand: unique symbol = Symbol('Money');

export type Money<C extends string = Currency> = {
  readonly [moneyBrand]: 'Money';
  readonly amount: Decimal;
  readonly currency: C;
};

export class CurrencyMismatchError extends Error {
  readonly code = 'CURRENCY_MISMATCH';

  constructor(left: string, right: string) {
    super(
      `Cannot combine ${left} with ${right}: Money values must share a currency`,
    );
    this.name = 'CurrencyMismatchError';
  }
}

function raw<C extends string>(amount: Decimal, currency: C): Money<C> {
  const money: Money<C> = {
    [moneyBrand]: 'Money',
    amount,
    currency,
  };
  return Object.freeze(money);
}

function of<const C extends string>(amount: string, currency: C): Money<C> {
  if (typeof amount !== 'string') {
    throw new Error(
      'Money.of: amount must be a string; there is no fromNumber',
    );
  }
  if (amount.trim() === '') {
    throw new Error('Money.of: amount must be a non-empty string');
  }
  assertIso4217Code(currency);

  let value: Decimal;
  try {
    value = new Decimal(amount);
  } catch {
    throw new Error(`Money.of: invalid amount ${JSON.stringify(amount)}`);
  }
  if (!value.isFinite()) {
    throw new Error(
      `Money.of: amount must be finite, got ${JSON.stringify(amount)}`,
    );
  }
  return raw(value, currency);
}

function assertSameCurrency<C extends string>(
  left: Money<C>,
  right: Money,
): asserts right is Money<C> {
  if (left.currency !== right.currency) {
    throw new CurrencyMismatchError(left.currency, right.currency);
  }
}

function add<const C extends string, D extends C>(
  left: Money<C>,
  right: Money<D>,
): Money<C> {
  assertSameCurrency(left, right);
  return raw(left.amount.plus(right.amount), left.currency);
}

function subtract<const C extends string, D extends C>(
  left: Money<C>,
  right: Money<D>,
): Money<C> {
  assertSameCurrency(left, right);
  return raw(left.amount.minus(right.amount), left.currency);
}

function quantityToDecimal(quantity: Decimal | number): Decimal {
  if (quantity instanceof Decimal) {
    if (!quantity.isFinite()) {
      throw new Error('Money.multiply: quantity must be finite');
    }
    return quantity;
  }
  if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity)) {
    throw new Error(
      'Money.multiply: number quantity must be a safe integer; use Decimal for non-integers',
    );
  }
  return new Decimal(quantity);
}

function multiply<C extends string>(
  money: Money<C>,
  quantity: Decimal | number,
): Money<C> {
  return raw(money.amount.times(quantityToDecimal(quantity)), money.currency);
}

function round<C extends string>(
  money: Money<C>,
  policy: RoundingPolicyName,
): Money<C> {
  return raw(
    money.amount.toDecimalPlaces(
      MONEY_DECIMAL_PLACES,
      decimalRoundingMode(policy),
    ),
    money.currency,
  );
}

/**
 * Distribute `total` across `weights` in proportion.
 *
 * Each share is rounded to `MONEY_DECIMAL_PLACES` using
 * `RoundingPolicy.HALF_UP`. The difference between `total` and the sum of
 * those rounded shares (the remainder) is assigned to the **first line**, so
 * the returned shares always sum exactly to `total`.
 *
 * First line, not largest-remainder: 10.00 across [1,1,1] is 3.34, 3.33, 3.33
 * — the extra 0.01 does not move to a different line depending on leftover
 * size. (Parts 5–6: basket voucher allocated across lines before VAT.)
 */
function allocate<C extends string>(
  total: Money<C>,
  weights: readonly Decimal[],
): Money<C>[] {
  if (weights.length === 0) {
    throw new Error('Money.allocate: weights must not be empty');
  }

  for (const weight of weights) {
    if (!(weight instanceof Decimal) || !weight.isFinite() || weight.lt(0)) {
      throw new Error(
        'Money.allocate: each weight must be a finite non-negative Decimal',
      );
    }
  }

  const weightSum = weights.reduce(
    (sum, weight) => sum.plus(weight),
    new Decimal(0),
  );
  if (weightSum.isZero()) {
    throw new Error('Money.allocate: weights must sum to a positive amount');
  }

  const rounded = weights.map((weight) =>
    round(
      raw(total.amount.times(weight).div(weightSum), total.currency),
      RoundingPolicy.HALF_UP,
    ),
  );

  const [first, ...rest] = rounded;
  if (first === undefined) {
    throw new Error('Money.allocate: weights must not be empty');
  }

  const roundedTotal = rest.reduce((sum, share) => add(sum, share), first);
  const remainder = subtract(total, roundedTotal);
  return [add(first, remainder), ...rest];
}

function equals(left: Money, right: Money): boolean {
  return left.currency === right.currency && left.amount.equals(right.amount);
}

function toJSON(money: Money): { amount: string; currency: string } {
  return {
    amount: money.amount.toFixed(),
    currency: money.currency,
  };
}

export const Money: {
  readonly of: typeof of;
  readonly add: typeof add;
  readonly subtract: typeof subtract;
  readonly multiply: typeof multiply;
  readonly allocate: typeof allocate;
  readonly round: typeof round;
  readonly equals: typeof equals;
  readonly toJSON: typeof toJSON;
} = {
  of,
  add,
  subtract,
  multiply,
  allocate,
  round,
  equals,
  toJSON,
};
