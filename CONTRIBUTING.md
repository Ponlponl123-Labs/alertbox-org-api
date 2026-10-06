# Contributing to Alertbox API

Thanks for contributing to the Alertbox API!

---

## Development Guidelines

1. **Runtime**: Use `bun`. Do not commit npm or yarn lockfiles.
2. **Type Safety**: Keep all types in `src/types/*.types.ts` and re-export via `src/types/index.ts`. All endpoints and schemas must use TypeBox validation.
3. **Database Changes**: Always update `prisma/schema.prisma` and test with `bun x prisma generate` before submitting PRs.
4. **Database Query Optimization**: Every query must be pre-analyzed for 0 table scans, minimal logical reads, and zero physical reads. Always use explicit `select` instead of `include`, and prefer `findUnique` over `findFirst`.
5. **Security**: Ensure all external webhook endpoints use timing-safe HMAC validation via `src/utils/signature.ts`.

---

## Database Query Standards & I/O Verification

Before adding or modifying any Prisma query or raw SQL, verify its performance:

- **Zero Table Scans (`type != ALL`)**: Every `WHERE`, `JOIN`, and `ORDER BY` clause must map to a primary key, unique constraint, or composite index.
- **Projection Hygiene (`select` > `include`)**: Strictly project required fields via `select`. Never use indiscriminate `include` or full model fetches to prevent fetching secrets or bloating buffer pool memory.
- **I/O Metric Invariants**: Lookups must produce **0 table scans**, single-digit logical reads (`Innodb_buffer_pool_read_requests`), and **0 physical reads**.
- **Automated Verification**: Run `bun run db:inspect` to test all queries against the MariaDB Galera cluster.

---

## Pre-PR Checklist

Make sure all checks pass before opening your pull request:

```bash
# 1. Generate Prisma Client
bun x prisma generate

# 2. Strict Typecheck
bun x tsc --noEmit

# 3. Unit & Integration Tests
bun test

# 4. DB Query Performance & Zero-Scan Inspection
bun run db:inspect

# 5. Compile Check
bun run build
```

---

## Submitting Pull Requests

1. Fork the repo and create your branch (`feature/my-feature` or `fix/issue-description`).
2. Commit your changes with clear messages.
3. Open a Pull Request against `main`.
4. Ensure the GitHub Actions CI pipeline passes.
