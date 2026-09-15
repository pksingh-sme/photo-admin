import { Decimal } from 'decimal.js';
import { CurrencyMismatchError } from '../platform/errors/domain-error.js';
import { assertIso4217Code, type Currency } from './currency.js';
import {
  MONEY_DECIMAL_PLACES,
  RoundingPolicy,
  decimalRoundingMode,
  type RoundingPolicy as RoundingPolicyName,
} from './rounding.js';

export type { Currency } from './currency.js';
export { CurrencyMismatchError } from '../platform/errors/domain-error.js';
export { MONEY_DECIMAL_PLACES, RoundingPolicy } from './rounding.js';

/**
 * Branded monetary value. The Decimal amount is module-private — arithmetic
 * goes through `Money` methods only, which check currency. Construct only
 * through `Money.of`; there is no `fromNumber`.
 *
 * The type parameter is the currency literal when it is known (`Money<'EUR'>`).
 * Adding `Money<'EUR'>` to `Money<'GBP'>` is a compile error. Heterogeneous
 * `Money` values still throw `CurrencyMismatchError` at runtime.
 */
const moneyBrand: unique symbol = Symbol('Money');
const amounts = new WeakMap<object, Decimal>();

export type Money<C extends string = Currency> = {
  readonly [moneyBrand]: 'Money';
  readonly currency: C;
};

function amountOf(money: Money): Decimal {
  const amount = amounts.get(money);
  if (amount === undefined) {
    throw new Error('Money: value is missing its internal amount');
  }
  return amount;
}

function raw<C extends string>(amount: Decimal, currency: C): Money<C> {
  const money: Money<C> = {
    [moneyBrand]: 'Money',
    currency,
  };
  amounts.set(money, amount);
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
  return raw(amountOf(left).plus(amountOf(right)), left.currency);
}

function subtract<const C extends string, D extends C>(
  left: Money<C>,
  right: Money<D>,
): Money<C> {
  assertSameCurrency(left, right);
  return raw(amountOf(left).minus(amountOf(right)), left.currency);
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
  return raw(
    amountOf(money).times(quantityToDecimal(quantity)),
    money.currency,
  );
}

function round<C extends string>(
  money: Money<C>,
  policy: RoundingPolicyName,
): Money<C> {
  return raw(
    amountOf(money).toDecimalPlaces(
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
      raw(amountOf(total).times(weight).div(weightSum), total.currency),
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
  return (
    left.currency === right.currency && amountOf(left).equals(amountOf(right))
  );
}

function decimalToString(value: Decimal): string {
  return value.toJSON();
}

function formatDecimal(value: Decimal, places: number): string {
  const rounded = value.toDecimalPlaces(places, Decimal.ROUND_HALF_UP);
  const sign = rounded.isNegative() ? '-' : '';
  const abs = rounded.abs();
  const rawDigits = decimalToString(abs);
  const dot = rawDigits.indexOf('.');
  const whole = dot === -1 ? rawDigits : rawDigits.slice(0, dot);
  const fraction = dot === -1 ? '' : rawDigits.slice(dot + 1);
  if (places === 0) {
    return `${sign}${whole}`;
  }
  return `${sign}${whole}.${fraction.padEnd(places, '0').slice(0, places)}`;
}

function toString(money: Money): string {
  return `${decimalToString(amountOf(money))} ${money.currency}`;
}

function format(money: Money): string {
  return `${formatDecimal(amountOf(money), MONEY_DECIMAL_PLACES)} ${money.currency}`;
}

function toJSON(money: Money): { amount: string; currency: string } {
  return {
    amount: decimalToString(amountOf(money)),
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
  readonly toString: typeof toString;
  readonly format: typeof format;
  readonly toJSON: typeof toJSON;
} = {
  of,
  add,
  subtract,
  multiply,
  allocate,
  round,
  equals,
  toString,
  format,
  toJSON,
};
