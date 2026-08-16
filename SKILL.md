<!-- repository: services/gateway | kind: SERVICE | stack: nestjs -->

# gateway — Skill: Service Development

> Workflow for gateway (services/gateway). Execute this workflow before, during, and
> after changes in this repository.

## Repository Facts

- Kind: Service
- Package: `gateway-service` (version: 3.5.0)
- Runtime: Node >=25.8.2 (pnpm >=10.33.0)
- Description: Omnixys API Gateway – GraphQL federation gateway (Apollo), subscriptions, security, analytics.
- Architecture: src/admin, analytics, config, core, graphql, handlers, health, security, subscriptions, types
- Database: none (no local persistence; relies on downstream services); Migrations: none
- API: GraphQL (Apollo Federation gateway) + REST + gRPC clients via @omnixys/grpc-ts
- Messaging: Kafka via @omnixys/kafka-ts
- Tests: node --test __tests__/unit/*.test.mjs and __tests__/integration/*.test.mjs; node --test for e2e


## Workflow

### 1. Understand the change

- Identify the affected bounded context within `src/admin, analytics, config, core, graphql, handlers, health, security, subscriptions, types`.
- Inspect consumers of the GraphQL operations and Kafka events you may touch.
- Never weaken authentication or authorization to make a test pass.

### 2. Implement

- Follow the existing module layout and naming conventions.
- Reuse `omnixys/packages` (shared contracts, cache, kafka, observability, security, ...)
  before reimplementing shared infrastructure.
- Keep tenant isolation intact (`Gateway has no database. It aggregates downstream contracts; contract changes here affect every client.`).

### 3. Write tests

- Unit tests exercise isolated business behavior.
- Integration tests cover repository/Prisma, GraphQL, Kafka, and auth boundaries.
- Cover tenant-isolation and error-contract cases when the code path touches them.

### 4. Validate

## Validation

Run each applicable check and record the result as `PASS`, `FAIL`, `PRE-EXISTING
FAILURE`, or `NOT RUN` (with a reason). Never convert `NOT RUN` into `PASS`.

  - `pnpm install --frozen-lockfile`
  - `pnpm format:check`
  - `pnpm exec eslint "{src,apps,libs,test}/**/*.ts"  (check-only)`
  - `npx tsc -p tsconfig.json --noEmit`
  - `pnpm run test:unit`
  - `pnpm run test:integration`
  - `pnpm run test:e2e (node --test, infrastructure-dependent)`
  - `pnpm build`
  - `pnpm test`

## Commit

- Use Conventional Commits (`<type>(<scope>): <summary>`), e.g. `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`, `perf`.
- Stage only files belonging to the logical change. Run `git diff --check` before committing.
- Commit locally; never push.

## Definition of Done

See the "Definition of Done" section in `AGENTS.md`. Before finishing, confirm
`AGENTS.md` and `SKILL.md` remain accurate for this repository.
