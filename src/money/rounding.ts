import { Decimal } from 'decimal.js';

/**
 * Scale used by `Money.round` and `Money.allocate`.
 * Worked examples in Parts 5–6 are EUR/GBP (2 minor units). Per-currency
 * exponents become PFX data; this constant is not that table.
 */
export const MONEY_DECIMAL_PLACES = 2;

/**
 * Named rounding policies. Every call that rounds money must pass one of
 * these — never a raw decimal.js mode number.
 */
export const RoundingPolicy = {
  UP: 'UP',
  DOWN: 'DOWN',
  CEIL: 'CEIL',
  FLOOR: 'FLOOR',
  HALF_UP: 'HALF_UP',
  HALF_DOWN: 'HALF_DOWN',
  HALF_EVEN: 'HALF_EVEN',
  HALF_CEIL: 'HALF_CEIL',
  HALF_FLOOR: 'HALF_FLOOR',
} as const;

export type RoundingPolicy =
  (typeof RoundingPolicy)[keyof typeof RoundingPolicy];

const DECIMAL_ROUNDING = {
  [RoundingPolicy.UP]: Decimal.ROUND_UP,
  [RoundingPolicy.DOWN]: Decimal.ROUND_DOWN,
  [RoundingPolicy.CEIL]: Decimal.ROUND_CEIL,
  [RoundingPolicy.FLOOR]: Decimal.ROUND_FLOOR,
  [RoundingPolicy.HALF_UP]: Decimal.ROUND_HALF_UP,
  [RoundingPolicy.HALF_DOWN]: Decimal.ROUND_HALF_DOWN,
  [RoundingPolicy.HALF_EVEN]: Decimal.ROUND_HALF_EVEN,
  [RoundingPolicy.HALF_CEIL]: Decimal.ROUND_HALF_CEIL,
  [RoundingPolicy.HALF_FLOOR]: Decimal.ROUND_HALF_FLOOR,
} as const satisfies Record<RoundingPolicy, Decimal.Rounding>;

export function decimalRoundingMode(policy: RoundingPolicy): Decimal.Rounding {
  const mode = DECIMAL_ROUNDING[policy];
  if (mode === undefined) {
    throw new Error(`unknown RoundingPolicy: ${String(policy)}`);
  }
  return mode;
}
