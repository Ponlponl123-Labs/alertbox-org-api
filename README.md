# Alertbox API

High-performance backend, real-time WebSocket overlay broadcaster, and webhook ingestion service for [Alertbox.org](https://alertbox.org).

---

## Architecture & Engineering Standards

The Alertbox API is engineered for maximum throughput, low-latency stream overlays, and strict resource efficiency on cloud-native infrastructure.

### 1. Database & Storage Performance
- **Clustered `BigInt` Primary Keys**: All relational models use `BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY`. This ensures purely sequential B+ tree appends in MySQL/InnoDB, eliminating random leaf page splits and buffer pool fragmentation caused by UUID/CUID strings.
- **Index-Only Execution (`scans: 0`)**: All production endpoints enforce indexed lookups. Full table scans (`type = ALL`) are strictly disallowed.
- **Strict Projection Hygiene**: Handlers mandate explicit, minimal `select` blocks instead of broad `include` or wildcard queries (`SELECT *`). Heavy off-page LOBs (e.g. `TEXT`, large JSON) are omitted when not rendered, preventing secondary InnoDB buffer pool page reads.
- **Zero-Dataloss GitOps Migrations**: Schema updates are fully declarative and idempotent via Prisma SQL migrations, designed for automated ArgoCD `PreSync` rollout.

### 2. High-Performance Token & Security Engine
- **Hardware-Accelerated AES-256-GCM**: Session and internal tokens are encrypted and authenticated via CPU cryptographic instructions (`src/utils/token.ts`) with sub-2.0µs verification latency.
- **Stateless Verification**: User identifiers and validity timestamps are decrypted directly from the token, eliminating primary database roundtrips.
- **Instant Atomic Revocation**: Session invalidation is handled in memory via Redis version tracking (`user:v:{userId}`) with zero-downtime cache invalidation.
- **Timing-Safe Webhook Signatures**: External webhook ingestion (Buy Me a Coffee, Ko-fi, Stripe, Streamlabs) validates authenticity using constant-time HMAC verification.

### 3. Decoupled Microservice Architecture
- **Offloaded AI/ML Workloads**: Resource-intensive tasks (such as text and image safety moderation) are decoupled from the API and delegated to the standalone [`moderation-api`](https://github.com/ponlponl123/moderation-api) microservice.
- **Lightweight Core**: Keeps the core API process footprint small (<100MB RAM), fast to build, and resilient against third-party service latency via Redis SHA-256 caching and fail-open fallbacks.

---

## Tech Stack

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Runtime** | [Bun](https://bun.sh) | High-performance JavaScript runtime & native test runner |
| **HTTP & WebSockets** | [ElysiaJS](https://elysiajs.com) | Type-safe, ultra-low overhead web framework |
| **ORM & Database** | [Prisma](https://prisma.io) / MariaDB / MySQL | Strongly typed database client on clustered InnoDB storage |
| **Caching & Pub/Sub** | [Redis](https://redis.io) / [Dragonfly](https://www.dragonflydb.io) | Overlay event broadcast and token revocation cache |
| **Validation** | [TypeBox](https://github.com/sinclairzx81/typebox) | High-speed compile-time & runtime schema validation |

---

## Getting Started

### Prerequisites

- **Bun** (v1.2+)
- **MySQL / MariaDB** (v10.6+)
- **Redis** (v7.0+)

### 1. Installation

```bash
git clone https://github.com/Ponlponl123-Labs/alertbox-org-api.git
cd alertbox-org-api
bun install
```

### 2. Environment Configuration

Copy `.env.example` and populate your secrets:

```bash
cp .env.example .env
```

Key configuration parameters:

```env
PORT=3000
DATABASE_URL="mysql://user:password@localhost:3306/alertbox"
REDIS_URL="redis://localhost:6379"
TOKEN_MASTER_SECRET="your_32_byte_hex_or_base64_master_secret"

# OAuth & Integrations
DISCORD_CLIENT_ID="your_discord_client_id"
DISCORD_CLIENT_SECRET="your_discord_client_secret"
DISCORD_REDIRECT_URI="http://localhost:3000/api/v1/auth/discord/callback"

# Microservices
EXTERNAL_MODERATION_API="http://moderation-api.internal:5000"

# Telemetry & Logging
# Options: verbose | traffic | traffic-pending | process | debug | none
# Composable: "traffic,traffic-pending,process"
# Defaults: dev -> verbose | test -> traffic,process | prod -> none (silent)
LOG_LEVEL="verbose"
```

#### Logging Configuration (`LOG_LEVEL` / `LOG_MODE`)

Control observability granularity with composable flags:

| Mode / Flag | Description |
| :--- | :--- |
| `verbose` / `all` | Full telemetry: traffic, pending requests, process lifecycle, debug traces. *(Default for `development`)* |
| `traffic` | HTTP responses with status code, latency, IP, origin: `[TRAFFIC] GET /health 200 [1.2ms] (127.0.0.1)` |
| `traffic-pending` | Pre-flight requests before handler dispatch: `[TRAFFIC-PENDING] POST /v1/auth (127.0.0.1) from http://localhost:3000` |
| `process` | Lifecycle diagnostics: Prisma/Galera connectivity, Redis Sentinel mappings, server port rotation. |
| `debug` | Deep diagnostics: external OAuth payload exchanges and token state. |
| `none` / `silent` | Zero stdout/stderr overhead. *(Default for `production`)* |

```env
# Example: Production with traffic + pending audit logs
LOG_LEVEL="traffic,traffic-pending"
```

### 3. Database Migration & Client Generation

```bash
# Generate Prisma Client
bun run db:generate

# Apply declarative migrations
bun run db:migrate:deploy
```

### 4. Running the Service

```bash
# Development (with hot-reloading)
bun run dev

# Production Compile
bun run build
./alertbox-api
```

---

## Quality & Performance Verification

Every change must pass strict typechecking, unit tests, and query I/O verification before deployment:

```bash
# 1. Typecheck
bun x tsc --noEmit

# 2. Run Test Suite
bun test

# 3. MariaDB Galera Zero-Scan & I/O Verification
bun run db:inspect
```

### MariaDB Galera I/O Performance Benchmark

Point queries must resolve with **0 table scans** and **0 physical disk reads** under warm buffer pool cache:

![MariaDB Galera I/O Performance Summary](./images/mariadb-io-performance-summary.png)

---

## Project Structure

```
alertbox-org-api/
├── prisma/                 # Declarative database schema & SQL migrations
├── src/
│   ├── classes/            # Domain services (account, session, cache, webhooks)
│   ├── config/             # Typed environment & TOML configuration
│   ├── consts/             # Route constants, provider definitions, time helpers
│   ├── core/               # Server initialization, auth plugin, Prisma & Redis clients
│   ├── routes/             # Versioned REST endpoints & WebSocket broadcasters
│   ├── types/              # Centralized TypeScript definitions & TypeBox schemas
│   └── utils/              # Hardware AES-256-GCM tokens, signatures, Streamlabs relay
├── test/                   # Test suites (unit, crypto, payloads, performance inspection)
└── .github/workflows/      # Automated CI/CD pipelines
```

---

## Contributing & License

Please review our [Contributing Guidelines](CONTRIBUTING.md) before opening issues or submitting pull requests.

Licensed under the **Ponlponl123 Labs License (MIT)** — see the [LICENSE](LICENSE) file for details.
