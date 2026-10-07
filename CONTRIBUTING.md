# Contributing to Alertbox API

Thank you for contributing to the Alertbox API. To maintain our production standards of raw performance, strict type safety, and zero dataloss, please adhere to these guidelines.

---

## Engineering Standards

### 1. Database Architecture & Migrations
- **Clustered `BigInt` Primary Keys**: All models and relational foreign keys must use `BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY`. Do not use random string CUIDs or UUIDs as database keys to prevent B+ tree leaf page splits.
- **Zero-Dataloss Migrations**: All database schema changes must be declarative, idempotent, and compatible with automated ArgoCD PreSync hooks (`bun run db:migrate:deploy`). Never drop production columns directly without a safe dual-write or migration strategy.

### 2. Query Performance & Projection Hygiene
- **Zero Table Scans (`type != ALL`)**: Every `WHERE`, `JOIN` (ON), and `ORDER BY` clause must resolve to a primary key or indexed column.
- **Explicit Projection (`select` > `include`)**: Always use explicit, minimal `select` blocks. Never use wildcard queries or broad `include` blocks.
- **Off-Page LOB Elimination**: Do not select large `TEXT` or blob columns (e.g., `userAgent`) unless strictly required by the client UI to eliminate secondary InnoDB buffer pool page fetches.
- **Lookup Method Priority**: Prefer `findUnique` over `findFirst` when querying unique keys.

### 3. Security & Cryptography
- **Hardware-Accelerated Tokens**: Use the AES-256-GCM token engine (`src/utils/token.ts`) for user and session authentication.
- **Constant-Time Verification**: All webhook signatures and token comparisons must use timing-safe comparison utilities (`timingSafeEqualString`).
- **Secret Protection**: Ensure sensitive internal fields (such as `userSecret`) are never exposed across API boundaries.

### 4. Code & Architecture Discipline
- **Microservice Separation**: Heavy non-core workloads (such as AI/ML content moderation) belong in their respective microservices (e.g. [`moderation-api`](https://github.com/ponlponl123/moderation-api)). Do not introduce heavy dependencies or model weights into this repository.
- **Type Safety**: Define schemas using TypeBox and keep interface definitions centralized in `src/types/`.

---

## Development Workflow

### Pre-PR Checklist

Before opening a pull request, run all verification steps locally:

```bash
# 1. Generate Prisma Client
bun run db:generate

# 2. Strict Typecheck
bun x tsc --noEmit

# 3. Run Unit and Integration Tests
bun test

# 4. Verify Database Query I/O (0 Table Scans)
bun run db:inspect

# 5. Production Binary Compilation Check
bun run build
```

---

## Pull Request Guidelines

1. **Branch Naming**: Use clear prefixes: `feat/`, `fix/`, `perf/`, or `refactor/`.
2. **Commit Messages**: Follow conventional commits (`feat: ...`, `fix: ...`, `perf: ...`).
3. **Focused Scope**: Keep changes localized and purposeful. Avoid mixing unrelated refactors into a single PR.
4. **CI Compliance**: Ensure all automated GitHub Actions checks pass cleanly.
