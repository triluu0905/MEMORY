# MEMORY

Vietnamese laboratory workspace with account authentication, PostgreSQL persistence, local file storage, calculators, charts, and report exports.

## Local setup

1. Install Node.js 22+ and PostgreSQL.
2. Copy `.env.example` to `.env` and set `DATABASE_URL`.
3. Initialize the database: `psql "$DATABASE_URL" -f server/schema.sql`.
4. Install dependencies: `npm ci`.
5. Start development: `npm run dev`.

## Verification

```sh
npm run typecheck
npm run build
TEST_DATABASE_URL=postgres://.../memory_test npm run test:integration
```

The integration test requires a separate disposable PostgreSQL database.

## Production

Build with `npm run build`, configure `.env`, then run `npm start` behind an HTTPS reverse proxy. Do not expose PostgreSQL or the Node.js port publicly.
