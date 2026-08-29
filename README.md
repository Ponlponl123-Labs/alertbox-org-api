# Alertbox API

High-performance backend, real-time WebSocket overlay broadcaster, and webhook ingestion service for [Alertbox.org](https://alertbox.org).

---

## Overview

The Alertbox API is built on top of [ElysiaJS](https://elysiajs.com) and the [Bun](https://bun.sh) runtime. It handles user authentication (Discord OAuth), integration credential management, instant webhook ingestion (Buy Me a Coffee, Ko-fi, Stripe, FeelFreePay, Streamlabs), and sub-millisecond WebSocket fan-out for stream overlays.

### Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **HTTP & WebSocket Framework**: [ElysiaJS](https://elysiajs.com)
- **Database & ORM**: [Prisma](https://prisma.io) (MariaDB / MySQL / SQLite support)
- **Cache & Pub/Sub**: [Redis](https://redis.io) / [Dragonfly](https://www.dragonflydb.io)
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

## Testing & Quality Checks

```bash
# Strict Typecheck
bun x tsc --noEmit

# Run unit and integration tests
bun test

# Compile standalone production binary
bun run build
```

---

## Project Structure

```
alertbox-org-api/
├── prisma/                 # Database schema & migrations
├── src/
│   ├── classes/            # Domain classes (Account, Profile, Connections, Sessions)
│   ├── config/             # Environment, DB, and TOML configuration loader
│   ├── core/               # Server initialization, Prisma instance, Redis client
│   ├── routes/             # API route handlers & WebSocket endpoints
│   │   └── v1/
│   │       ├── auth/       # Discord & session authentication
│   │       ├── me/         # User profile, devices, connection settings
│   │       ├── profile/    # Public creator tip page details
│   │       ├── webhook/    # BMAC, Ko-fi, Streamlabs webhook handlers
│   │       └── widget.ts   # Real-time WebSocket stream overlay connection
│   ├── types/              # Declarative TypeScript types and schemas
│   └── utils/              # Cryptographic verification, formatting, image processing
├── test/                   # Unit test suites
└── .github/workflows/      # GitHub Actions CI pipeline
```

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
