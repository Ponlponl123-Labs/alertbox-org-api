# Alertbox API

High-performance backend, real-time WebSocket overlay broadcaster, and webhook ingestion service for [Alertbox.org](https://alertbox.org).

---

## Overview

The Alertbox API is built on top of [ElysiaJS](https://elysiajs.com) and the [Bun](https://bun.sh) runtime. It handles user authentication (Discord OAuth), integration credential management, instant webhook ingestion (Buy Me a Coffee, Ko-fi, Stripe, FeelFreePay, Streamlabs), sub-millisecond WebSocket fan-out for stream overlays, and automated content safety moderation for creator profiles.

### Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **HTTP & WebSocket Framework**: [ElysiaJS](https://elysiajs.com)
- **Database & ORM**: [Prisma](https://prisma.io) (MariaDB / MySQL / SQLite support)
- **Cache & Pub/Sub**: [Redis](https://redis.io) / [Dragonfly](https://www.dragonflydb.io)
- **Content Moderation (ML/ONNX)**: [ONNX Runtime](https://onnxruntime.ai/) & [@huggingface/transformers](https://github.com/huggingface/transformers.js)
- **Validation**: [TypeBox](https://github.com/sinclairzx81/typebox)
- **Testing**: Bun Test runner

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (v1.2+)
- Running instance of MySQL / MariaDB and Redis

### Installation

```bash
# Clone the repository
git clone https://github.com/Ponlponl123-Labs/alertbox-org-api.git
cd alertbox-org-api

# Install dependencies
bun install
```

### Environment Configuration

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env
```

Key environment variables:

```env
PORT=3000
DATABASE_URL="mysql://user:password@localhost:3306/alertbox"
REDIS_URL="redis://localhost:6379"
DISCORD_CLIENT_ID="your_discord_client_id"
DISCORD_CLIENT_SECRET="your_discord_client_secret"
DISCORD_REDIRECT_URI="http://localhost:3000/api/v1/auth/discord/callback"

# Content Moderation
MODERATION_ENABLED=true
MODERATION_TEXT_ENGINE="minilm"
MODERATION_CPU_THREADS=1
MODERATION_TEXT_THRESHOLD=0.45
MODERATION_IMAGE_NSFW_THRESHOLD=0.50
```

### Database Setup

```bash
# Generate Prisma Client
bun x prisma generate

# Push database schema migrations
bun x prisma db push
```

### Running Locally

```bash
# Start in watch/dev mode
bun run dev
```

---

## Automated Content Moderation Pipeline

An ultra-lightweight content safety pipeline engineered for low-resource host environments, offloading AI/ML inference to an external dedicated moderation microservice ([`ponlponl123/moderation-api`](https://github.com/ponlponl123/moderation-api)).

### Architecture Overview

The system uses a **2-Tier Hybrid Pipeline** that maximizes throughput and detection accuracy while preventing false positives.

```
Incoming Profile Update (avatar, banner, displayname, bio)
  │
  ├──► [Tier 0: Deterministic Filter (0ms)]
  │     ├── Leetspeak & Thai Evasion Normalizer (`normalizeModerationText`)
  │     └── Bounded Regex Matrix (`EXPLICIT_TEXT_PATTERNS`)
  │           ├─ Adult / OF / NSFW Solicitation
  │           ├─ Graphic Violence & Gore
  │           ├─ Hate Speech & Slurs
  │           └─ Severe Toxicity / Harassment
  │     ► MATCH: Short-circuit reject (HTTP 451, Score: 1.0, 0ms)
  │
  └──► [Tier 1: External Moderation Microservice (`EXTERNAL_MODERATION_API`)]
        ├── Redis SHA-256 Cache Check (7-day TTL, avoids duplicate requests)
        ├── Text Check (`POST /v1/moderate/text`)
        ├── Image Check (`POST /v1/moderate/image`)
        └── Graceful Fail-Open Fallback (ensures API availability if service is offline)
        ► EVAL: If flagged → Reject (HTTP 451)
        ► PASS: Profile update committed (HTTP 200)
```

### Key Design Highlights

- **Offloaded AI/ML Inference**: Heavy ONNX / transformer model weights and multi-core CPU inference are offloaded to [`ponlponl123/moderation-api`](https://github.com/ponlponl123/moderation-api), keeping `alertbox-org-api` lightweight, memory-efficient (< 100MB), and fast to build.
- **SHA-256 Redis Caching**: Hashes sanitized text and image buffers in Redis with a 7-day TTL (`MODERATION_CACHE_TTL=604800`) to eliminate redundant HTTP calls for repeat submissions.
- **De-obfuscation (`src/utils/moderation.ts`)**: Automatically unmasks leetspeak (`F4gg0t5` → `faggot`) and Thai separator censorship (`ค_ย` → `ควย`, `เ_ด` → `เย็ด`).
- **HTTP 451 Rejections**: `PATCH /v1/me/` returns HTTP 451 (`Unavailable For Legal Reasons`) on moderation failures so client web applications can explicitly prompt the creator.

---

## Testing & Quality Checks

```bash
# Strict Typecheck
bun x tsc --noEmit

# Run unit and integration tests
bun test

# Run database query performance & zero-scan verification
bun run db:inspect

# Run moderation pipeline tests
bun test test/moderation.test.ts

# Compile standalone production binary
bun run build
```

---

## Database Query Optimization & Standards

Every query in `alertbox-org-api` must be analyzed before implementation to preserve low latency on the MariaDB Galera cluster:

1. **Zero Table Scans (`type != ALL`)**: Full table scans are rejected. All `WHERE`, `JOIN` (ON), and `ORDER BY` clauses must resolve to a primary key, unique constraint, or composite index.
2. **Projection Hygiene (`select` > `include`)**: Always use explicit, minimal `select` blocks. Never use broad `include` or full model fetches to avoid pulling sensitive credentials (e.g. `secret`) and to reduce buffer pool memory usage.
3. **Lookup Method Priority**: Use `findUnique` over `findFirst` when querying unique keys.
4. **I/O Metric Invariants**: Point lookups must produce **0 table scans**, single-digit logical reads (`Innodb_buffer_pool_read_requests`), and **0 physical reads** under warm cache.

### MariaDB Galera I/O Performance Summary

All core queries are regression-tested via [`test/queries.performance.test.ts`](test/queries.performance.test.ts) (`bun run db:inspect`):

![MariaDB Galera I/O Performance Summary](./images/mariadb-io-performance-summary.png)

---

## Project Structure

```
alertbox-org-api/
├── prisma/                 # Database schema & migrations
├── src/
│   ├── classes/            # Domain classes
│   │   ├── me/             # Profile, account, sessions, connections
│   │   ├── moderation/     # Content moderation orchestrator & engines
│   │   └── webhook/        # BMAC, Ko-fi, Streamlabs dispatchers
│   ├── config/             # Environment, DB, and TOML configuration loader
│   ├── consts/             # Static configurations & moderation anchor matrices
│   ├── core/               # Server initialization, Prisma instance, Redis client
│   ├── routes/             # API route handlers & WebSocket endpoints
│   │   └── v1/
│   │       ├── auth/       # Discord & session authentication
│   │       ├── me/         # User profile, devices, connection settings
│   │       ├── profile/    # Public creator tip page details
│   │       ├── webhook/    # BMAC, Ko-fi, Streamlabs webhook handlers
│   │       └── widget.ts   # Real-time WebSocket stream overlay connection
│   ├── types/              # Declarative TypeScript types and schemas
│   └── utils/              # Cryptographic verification, moderation normalizer, image utils
├── test/                   # Unit test suites (50+ tests)
└── .github/workflows/      # GitHub Actions CI pipeline
```

---

## License

This project is licensed under the Ponlponl123 Labs License (MIT) — see the [LICENSE](LICENSE) file for details.
