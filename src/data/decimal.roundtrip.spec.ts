import {
  MySqlContainer,
  type StartedMySqlContainer,
} from '@testcontainers/mysql';
import type { Pool } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from './client.js';

const MYSQL_IMAGE = 'mysql:8.4';
const CONTAINER_TIMEOUT_MS = 180_000;

function amountFromRows(rows: unknown): unknown {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('DECIMAL round-trip expected one row');
  }

  const row: unknown = rows[0];
  if (typeof row !== 'object' || row === null || !('amount' in row)) {
    throw new Error('DECIMAL round-trip expected an amount column');
  }

  return row.amount;
}

describe(
  'DECIMAL(10,2) driver round-trip',
  { timeout: CONTAINER_TIMEOUT_MS },
  () => {
    let container: StartedMySqlContainer | undefined;
    let pool: Pool | undefined;

    beforeAll(async () => {
      container = await new MySqlContainer(MYSQL_IMAGE).start();
      pool = createPool({
        host: container.getHost(),
        port: container.getPort(),
        user: container.getUsername(),
        password: container.getUserPassword(),
        database: container.getDatabase(),
      });

      await pool.query(`
      CREATE TABLE decimal_roundtrip (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        amount DECIMAL(10,2) NOT NULL
      )
    `);
      await pool.query(
        `INSERT INTO decimal_roundtrip (amount) VALUES ('19.99')`,
      );
    }, CONTAINER_TIMEOUT_MS);

    afterAll(async () => {
      if (pool !== undefined) {
        await pool.end();
      }
      if (container !== undefined) {
        await container.stop();
      }
    }, CONTAINER_TIMEOUT_MS);

    it('returns DECIMAL(10,2) as a string, not a number', async () => {
      if (pool === undefined) {
        throw new Error('MySQL pool was not created');
      }

      const [rows] = await pool.query('SELECT amount FROM decimal_roundtrip');
      const amount = amountFromRows(rows);

      expect(typeof amount).toBe('string');
      expect(amount).not.toBeTypeOf('number');
      expect(amount).toBe('19.99');
    });
  },
);
