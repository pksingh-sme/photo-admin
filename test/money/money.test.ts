import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { Money, CurrencyMismatchError } from '../../src/money/money.js';
import { DomainError } from '../../src/platform/errors/domain-error.js';
import { RoundingPolicy } from '../../src/money/rounding.js';

function threeShares(shares: readonly Money[]): [Money, Money, Money] {
  const [first, second, third] = shares;
  if (first === undefined || second === undefined || third === undefined) {
    throw new Error(`expected 3 shares, got ${String(shares.length)}`);
  }
  return [first, second, third];
}

function sum3(shares: readonly Money[]): Money {
  const [first, second, third] = threeShares(shares);
  return Money.add(Money.add(first, second), third);
}

describe('Money', () => {
  describe('allocate', () => {
    it('sums to exactly 10.00 across weights [1,1,1]', () => {
      const total = Money.of('10.00', 'EUR');
      const shares = Money.allocate(total, [
        new Decimal(1),
        new Decimal(1),
        new Decimal(1),
      ]);
      const [first, second, third] = threeShares(shares);

      expect(Money.equals(first, Money.of('3.34', 'EUR'))).toBe(true);
      expect(Money.equals(second, Money.of('3.33', 'EUR'))).toBe(true);
      expect(Money.equals(third, Money.of('3.33', 'EUR'))).toBe(true);
      expect(Money.equals(sum3(shares), total)).toBe(true);
    });

    it('allocates across lines with different VAT rates and a remainder', () => {
      // Basket voucher allocated by net, before VAT (Parts 5–6). Lines at
      // different rates would produce a wrong tax figure if the discount were
      // applied after VAT or dumped onto a single line.
      const lines = [
        { vatRatePercent: '20', net: Money.of('10.00', 'EUR') },
        { vatRatePercent: '5', net: Money.of('10.00', 'EUR') },
        { vatRatePercent: '0', net: Money.of('10.00', 'EUR') },
      ];
      const discount = Money.of('10.00', 'EUR');
      const shares = Money.allocate(
        discount,
        lines.map((line) => new Decimal(Money.toJSON(line.net).amount)),
      );
      const [standard, reduced, zero] = threeShares(shares);

      expect(Money.equals(standard, Money.of('3.34', 'EUR'))).toBe(true);
      expect(Money.equals(reduced, Money.of('3.33', 'EUR'))).toBe(true);
      expect(Money.equals(zero, Money.of('3.33', 'EUR'))).toBe(true);
      expect(Money.equals(sum3(shares), discount)).toBe(true);
    });
  });

  describe('arithmetic', () => {
    it('0.1 + 0.2 equals exactly 0.30', () => {
      expect(0.1 + 0.2 === 0.3).toBe(false);

      const sum = Money.add(Money.of('0.1', 'EUR'), Money.of('0.2', 'EUR'));
      expect(Money.equals(sum, Money.of('0.30', 'EUR'))).toBe(true);
    });

    it('1.005 rounds to 1.01 under half-up', () => {
      const rounded = Money.round(
        Money.of('1.005', 'EUR'),
        RoundingPolicy.HALF_UP,
      );
      expect(Money.equals(rounded, Money.of('1.01', 'EUR'))).toBe(true);
    });

    it('adding EUR to GBP fails with a domain CURRENCY_MISMATCH', () => {
      const eur: Money = Money.of('1.00', 'EUR');
      const gbp: Money = Money.of('1.00', 'GBP');
      expect(() => Money.add(eur, gbp)).toThrow(CurrencyMismatchError);
      expect(() => Money.subtract(eur, gbp)).toThrow(CurrencyMismatchError);
      try {
        Money.add(eur, gbp);
        expect.unreachable('mixed-currency add must throw');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect(error).toBeInstanceOf(CurrencyMismatchError);
        if (error instanceof CurrencyMismatchError) {
          expect(error.code).toBe('CURRENCY_MISMATCH');
        }
      }
    });
  });

  describe('display', () => {
    it('toString and format expose the amount without a public Decimal', () => {
      const price = Money.of('12.3', 'EUR');
      expect(Money.toString(price)).toBe('12.3 EUR');
      expect(Money.format(price)).toBe('12.30 EUR');
      expect(Money.toJSON(price)).toEqual({ amount: '12.3', currency: 'EUR' });
    });
  });

  describe('types', () => {
    it('rejects a number amount, fromNumber, mixed-currency add, Money as a quantity, and amount.plus', () => {
      const _typeCheck = () => {
        // @ts-expect-error amount must be a string — there is no fromNumber
        Money.of(1.005, 'EUR');
        // @ts-expect-error fromNumber is deliberately absent
        Money.fromNumber('1.00', 'EUR');
        // @ts-expect-error EUR and GBP are different currency literals
        Money.add(Money.of('1.00', 'EUR'), Money.of('1.00', 'GBP'));
        // @ts-expect-error multiply takes a quantity, never Money
        Money.multiply(Money.of('10.00', 'EUR'), Money.of('2', 'EUR'));
        const euros = Money.of('1.00', 'EUR');
        const pounds = Money.of('1.00', 'GBP');
        // @ts-expect-error amount is not on Money; arithmetic goes through Money methods
        euros.amount.plus(pounds.amount);
      };
      void _typeCheck;
      expect(_typeCheck).toBeTypeOf('function');
    });
  });
});
