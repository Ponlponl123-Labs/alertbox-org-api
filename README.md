# Alertbox API

High-performance backend, real-time WebSocket overlay broadcaster, and webhook ingestion service for [Alertbox.org](https://alertbox.org).

---

## Architecture & Engineering Standards

The Alertbox API is engineered for maximum throughput, low-latency stream overlays, and ultra-low memory footprint on resource-constrained Kubernetes nodes (2 vCPU / ~3GB RAM).

### 1. Zero-Dependency Database Engineering (`Bun.SQL` + MariaDB Galera)
- **Native Zig/C++ Driver**: Zero npm runtime ORM dependencies. Eliminates `@prisma/client`, `prisma`, and `mysql2` at runtime using Bun's built-in native `SQL` client (`import { SQL } from "bun"`).
- **Compile-Time Type Safety (`BunSqlDialect`)**: Wraps native `Bun.SQL` in a custom Kysely `Dialect` + `Driver` executing via `sql.unsafe()`. Queries achieve IDE type-safety and query-builder ergonomics with **0 bytes of runtime cost**.
- **Clustered `BigInt` Primary Keys**: All relational models use `BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY`. Ensures sequential B+ tree appends in MariaDB InnoDB, eliminating random leaf page splits and buffer pool fragmentation caused by UUID/CUID strings.
- **Covering Index & Projection Hygiene**: Handlers mandate explicit column selections (`SELECT col1, col2`) targeting InnoDB covering indexes (`Using index`). Wildcard queries (`SELECT *`) and heavy off-page LOBs are strictly disallowed.
- **Keyset Pagination**: Ban `OFFSET`. All list endpoints use cursor-based keyset pagination to maintain $O(1)$ query execution as datasets scale.

### 2. Standalone Zero-Dataloss Migrations (`Goose`)
- **Standalone SQL Migrations**: Database schemas are managed purely via [Goose](https://github.com/pressly/goose) (`migrations/*.sql`) with mandatory `-- +goose Up` and `-- +goose Down` blocks.
- **Galera-Safe DDL**: All `ALTER TABLE` operations enforce `ALGORITHM=INPLACE, LOCK=NONE` to prevent Total Order Isolation (TOI) cluster stalls.
- **3-Stage Backfill Protocol**: New non-null columns are added via expand-and-contract (1. Add column `NULL` → 2. Backfill existing rows → 3. Modify `NOT NULL` & add constraints) for zero-downtime, rollback-safe GitOps deployments in ArgoCD `PreSync` hooks.

### 3. High-Performance Token & Security Engine
- **Hardware-Accelerated AES-256-GCM**: Session and internal tokens are encrypted and authenticated via CPU cryptographic instructions (`src/utils/token.ts`) with sub-2.0µs verification latency.
- **Stateless Verification**: User identifiers and timestamps decrypt directly in microseconds, eliminating primary database roundtrips.
- **Instant Atomic Revocation**: Session invalidation is handled in memory via Redis version tracking (`user:v:{userId}`) with zero-downtime cache invalidation.
- **Timing-Safe Webhook Signatures**: External webhook ingestion (Buy Me a Coffee, Ko-fi, Stripe, Streamlabs) validates authenticity using constant-time HMAC verification.

### 4. Decoupled Microservice & Single-Binary Runtime
- **Single Standalone Executable**: Compiles into a single self-contained native binary via `bun build --compile` (<100MB RAM footprint).
- **Offloaded AI/ML Workloads**: Resource-intensive tasks (such as text and image safety moderation) are decoupled from the API and delegated to the standalone [`moderation-api`](https://github.com/ponlponl123/moderation-api) microservice.

---

## Tech Stack

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Runtime** | [Bun](https://bun.sh) (v1.3+) | High-performance JavaScript/TypeScript runtime & native test runner |
| **HTTP & WebSockets** | [ElysiaJS](https://elysiajs.com) | Type-safe, ultra-low overhead web framework |
| **Database Driver** | [Bun.SQL](https://bun.sh/docs/api/sql) | Native Zig/C++ MariaDB Galera driver with strict mTLS |
| **Query Ergonomics** | [Kysely](https://kysely.dev) (`BunSqlDialect`) | Zero-runtime-dependency compile-time type-safe query builder |
| **Migrations** | [Goose](https://github.com/pressly/goose) (v3.24+) | Standalone SQL migrations for ArgoCD GitOps PreSync jobs |
| **Caching & Pub/Sub** | [Redis](https://redis.io) / [Dragonfly](https://www.dragonflydb.io) | Overlay event broadcast and token revocation cache |
| **Validation** | [TypeBox](https://github.com/sinclairzx81/typebox) | High-speed compile-time & runtime schema validation |

---

## Getting Started

### Prerequisites

- **Bun** (v1.3+)
- **MariaDB / MySQL** (v10.6+)
- **Redis** (v7.0+)
- **Goose** (v3.24+) *(Optional for local migrations; pre-packaged in Docker release)*

### 1. Installation

```bash
git clone https://github.com/Ponlponl123-Labs/alertbox-org-api.git
cd alertbox-org-api
bun install --frozen-lockfile
```

### 2. Environment Configuration

Copy `.env.example` and populate your secrets:

```bash
cp .env.example .env
```

Key configuration parameters:

```env
PORT=3000
DB_HOST="localhost"
DB_PORT=3306
DB_USER="root"
DB_PASS="password"
DB_NAME="alertbox_org"
REDIS_URL="redis://localhost:6379"
TOKEN_MASTER_SECRET="your_32_byte_hex_or_base64_master_secret"

# OAuth & Integrations
DISCORD_CLIENT_ID="your_discord_client_id"
DISCORD_CLIENT_SECRET="your_discord_client_secret"

# Telemetry & Logging
# Options: verbose | traffic | traffic-pending | process | debug | none
LOG_LEVEL="verbose"
```

### 3. Database Migrations & Type Codegen

```bash
# Run standalone Goose migrations up
bun run db:migrate:up

# Introspect MariaDB schema into src/db/types.d.ts (Kysely types)
bun run db:codegen
```

### 4. Running the Service

```bash
# Development (with hot-reloading)
bun run dev

# Production Standalone Compile
bun run build
./dist/server
```

---

## Quality & Performance Verification

Every change must pass strict typechecking, unit tests, and query I/O verification before deployment:

```bash
# 1. Typecheck (0 Errors)
bun x tsc --noEmit

# 2. Run Test Suite
bun test

# 3. MariaDB Galera Zero-Scan & I/O Verification
bun run db:inspect

# 4. Standalone Binary Compilation
bun run build
```

---

## Project Structure

```
alertbox-org-api/
├── migrations/             # Standalone Goose SQL migrations (00001_init ... 00008_optimize)
├── src/
│   ├── classes/            # Domain services (account, session, cache, webhooks, org)
│   ├── config/             # Typed environment & TOML configuration
│   ├── consts/             # Route constants, provider definitions, time helpers
│   ├── core/               # Server initialization, auth plugin, Redis clients
│   ├── db/                 # Native Bun.SQL connection pool, BunSqlDialect, generated types
│   ├── routes/             # Versioned REST endpoints & WebSocket broadcasters
│   ├── types/              # Centralized TypeScript definitions & TypeBox schemas
│   └── utils/              # Hardware AES-256-GCM tokens, signatures, Streamlabs relay
├── test/                   # Test suites (unit, crypto, payloads, performance inspection)
└── deployment/             # Kubernetes & ArgoCD PreSync migration job manifests
```

---

## Contributing & License

Please review our [Contributing Guidelines](CONTRIBUTING.md) before opening issues or submitting pull requests.

Licensed under the **Ponlponl123 Labs License (MIT)** — see the [LICENSE](LICENSE) file for details.
