import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'mysql',
  schema: './src/data/schema/*.ts',
  out: './src/data/migrations',
  dbCredentials: {
    host: process.env['MYSQL_HOST'] ?? '127.0.0.1',
    port: Number.parseInt(process.env['MYSQL_PORT'] ?? '3306', 10),
    user: process.env['MYSQL_USER'] ?? 'photoprint',
    password: process.env['MYSQL_PASSWORD'] ?? '',
    database: process.env['MYSQL_DATABASE'] ?? 'photoprint',
  },
});
