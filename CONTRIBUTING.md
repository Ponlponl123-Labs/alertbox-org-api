# Contributing to Alertbox API

Thank you for contributing to the Alertbox API. To maintain our production standards of raw performance, strict type safety, and zero dataloss, please adhere to these guidelines.

---

## Engineering Standards

### 1. Database Architecture & Migrations
- **Zero-Dependency Native Driver**: NEVER install `@prisma/client`, `mysql2`, or runtime ORM libraries. All database queries must run through native `Bun.SQL` (`import { SQL } from "bun"`) via our zero-overhead `BunSqlDialect` (`db` / `sql`).
- **Clustered `BigInt` Primary Keys**: All models and relational foreign keys must use `BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY`. Do not use random string CUIDs or UUIDs as database keys to prevent B+ tree leaf page splits.
- **Standalone Goose SQL Migrations**: All schema updates must be written as raw SQL migrations in `migrations/` with both `-- +goose Up` and `-- +goose Down` blocks.
- **Galera-Safe TOI & 3-Stage Backfill**: All `ALTER TABLE` statements must include `ALGORITHM=INPLACE, LOCK=NONE`. New non-null columns must follow the 3-stage backfill protocol (1. Add `NULL` → 2. Backfill existing rows → 3. Modify to `NOT NULL`).

### 2. Query Performance & Projection Hygiene
- **Zero Table Scans (`type != ALL`)**: Every `WHERE`, `JOIN` (ON), and `ORDER BY` clause must resolve to a primary key or indexed column targeting InnoDB covering indexes (`Using index`).
- **Explicit Projection (Ban `SELECT *`)**: Always use explicit, minimal `.select(["col1", "col2"])` blocks. Never use wildcard queries.
- **Keyset Pagination (Ban `OFFSET`)**: Paginate using cursor tuples `WHERE (createdAt, id) < (cursorDate, cursorId) ORDER BY createdAt DESC, id DESC LIMIT ${limit}`.
- **Off-Page LOB Elimination**: Do not select large `TEXT` or blob columns unless strictly required by the client UI to eliminate secondary InnoDB buffer pool page fetches.

### 3. Security & Cryptography
- **Hardware-Accelerated Tokens**: Use the AES-256-GCM token engine (`src/utils/token.ts`) for user and session authentication.
- **Constant-Time Verification**: All webhook signatures and token comparisons must use timing-safe comparison utilities (`timingSafeEqualString` / `crypto.subtle`).
- **Secret Protection**: Ensure sensitive internal fields (such as `userSecret`) are never exposed across API boundaries.

### 4. Code & Architecture Discipline
- **Microservice Separation**: Heavy non-core workloads (such as AI/ML content moderation) belong in their respective microservices (e.g. [`moderation-api`](https://github.com/ponlponl123/moderation-api)). Do not introduce heavy dependencies or model weights into this repository.
- **Single Binary Compilation**: All server code must compile cleanly into a standalone native binary via `bun build --compile`.
- **Type Safety**: Keep interface definitions generated and centralized in `src/db/types.d.ts` and `src/types/`.

---

## Development Workflow

### Pre-PR Checklist

Before opening a pull request, run all verification steps locally:

```bash
# 1. Regenerate Kysely DB types from local schema (if migrations changed)
bun run db:codegen

# 2. Strict Typecheck (Must exit 0 with zero errors)
bun x tsc --noEmit

# 3. Run Unit and Integration Tests
bun test

# 4. Verify Database Query I/O (0 Table Scans)
bun run db:inspect

# 5. Production Standalone Binary Compilation Check
bun run build
```

---

## Pull Request Guidelines

1. **Branch Naming**: Use clear prefixes: `feat/`, `fix/`, `perf/`, or `refactor/`.
2. **Commit Messages**: Follow conventional commits (`feat: ...`, `fix: ...`, `perf: ...`, `refactor: ...`).
3. **Focused Scope**: Keep changes localized and purposeful. Avoid mixing unrelated refactors into a single PR.
4. **CI Compliance**: Ensure all automated GitHub Actions checks pass cleanly.
