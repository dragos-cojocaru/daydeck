# Contributing to Daydeck

Thank you for helping. This page covers setup, the checks to run, the code style and what a
pull request needs. For a vulnerability, follow [SECURITY.md](SECURITY.md) instead of opening
an issue.

## Set up

You need no Buffer account. The repository includes a mock Buffer server
(`apps/web/e2e/mock-buffer/server.ts`), a local stand-in for Buffer's OAuth server and GraphQL
API. Its consent screen offers three test accounts.

1. Install Node.js 26. The `.node-version` file pins it for version managers such as fnm and
   nvm.
2. Install pnpm 11 through Corepack (the tool that installs the pnpm version that
   `package.json` asks for). Node.js 26 does not include Corepack, so install it once:

   ```bash
   npm install --global corepack@latest
   corepack enable
   ```

3. Install the dependencies and create your local settings file:

   ```bash
   pnpm install
   cp .env.example apps/web/.env.local
   ```

4. Get a PostgreSQL 18 database (Neon or Docker) and fill in `apps/web/.env.local` with the
   mock Buffer values. [Set up in the README](README.md#3-the-database-neon) and
   [Local development](README.md#9-local-development) show both steps.
5. Start everything:

   ```bash
   pnpm --filter @daydeck/db db:migrate     # creates the tables, once
   pnpm --filter @daydeck/web mock:buffer   # terminal 1: mock Buffer on http://localhost:4010
   pnpm dev                                  # terminal 2: the app on https://localhost:3000
   ```

## Run the checks

CI runs these checks too, plus a production build. They need no database and no Buffer
account.

```bash
pnpm exec biome ci .            # lint and format check
pnpm turbo run typecheck test   # TypeScript type check and Vitest unit tests in every package
```

Unit tests use PGlite, a Postgres that runs inside the test process. To run them against a
real Postgres, as CI does, set `TEST_DATABASE_URL` to a database user that may create
databases.

The end-to-end tests run in Playwright against the mock Buffer server. Keep the mock server
and `pnpm dev` from step 5 running, then:

```bash
pnpm --filter @daydeck/web exec playwright install chromium   # once
PLAYWRIGHT_BASE_URL=https://localhost:3000 E2E_MOCK_BUFFER_URL=http://localhost:4010 \
  pnpm --filter @daydeck/web exec playwright test --workers=1
```

Two changes need an extra command:

- **A Buffer GraphQL query or mutation** in `packages/buffer`: run `pnpm codegen` and commit
  the files it changes in `packages/buffer/src/gql`. CI fails when they are out of date.
- **The database schema** in `packages/db/src/schema`: run
  `pnpm --filter @daydeck/db db:generate` and commit the new migration in
  `packages/db/drizzle`.

## Code style

[Biome](https://biomejs.dev) is the linter and the formatter. The shared settings are in
`packages/config/biome.json`: two spaces, lines up to 100 characters, the recommended rules,
and `import type` for imports that are only types. `pnpm lint:fix` fixes most problems for you.

Do not edit generated files by hand: `packages/buffer/src/gql` and `packages/db/drizzle/meta`.

## Pull requests

- Keep one topic per pull request, and explain what it changes and why.
- A pull request needs green CI before it can be merged. CI runs a secret scan (gitleaks),
  Biome, a check that the generated Buffer types are up to date, and then type checks, unit
  tests and a production build.
- CI does not run the end-to-end tests. If you change a screen or a flow, run them locally
  against the mock Buffer server.
- By contributing, you agree that your work is published under the [MIT License](LICENSE).
