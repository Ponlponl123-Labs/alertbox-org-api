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

An ultra-lightweight, hardware-optimized content safety pipeline engineered for low-resource host environments (e.g., AMD Ryzen 5 2500U APU co-hosted with a Kubernetes cluster).

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
  └──► [Tier 1: Semantic Machine Learning (ONNX Runtime)]
        ├── Sentence Chunking (Anti-dilution clause analyzer)
        ├── Multi-Anchor Cosine Comparison (`MiniLM-L12`):
        │     ├─ `TOXIC_ANCHOR_TEXT` (slurs, harassment, hate)
        │     ├─ `NSFW_ANCHOR_TEXT` (adult, erotic, suggestive)
        │     └─ `VIOLENCE_ANCHOR_TEXT` (physical harm, threats, gore)
        └── Single-Thread Pinning (`intraOpNumThreads: 1`)
        ► EVAL: If max(score) >= threshold → Reject (HTTP 451)
        ► PASS: Profile update committed (HTTP 200)
```

### Models Matrix

| Model Name | Modality | Architecture | Target Languages | Quantization | Size on Disk | Latency (1 Core) | RAM Usage | Detection Target |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`paraphrase-multilingual-MiniLM-L12-v2`** *(Default Text)* | Text | Transformer (12L / 384D) | Multilingual (Thai, English, 50+ langs) | INT8 (ONNX) | ~118 MB | ~15–25 ms | ~180 MB | Semantic similarity against Toxic, NSFW, and Violence anchor vectors. |
| **`toxic-bert`** *(Alternative Text)* | Text | BERT (Seq. Classification) | English | INT8 (ONNX) | ~120 MB | ~20–30 ms | ~190 MB | Binary multi-class toxicity classification. |
| **`nsfw_image_detection-ONNX`** *(Image)* | Image | MobileNetV2 | Visual (PNG, JPEG, WebP) | INT8 (ONNX) | ~8 MB | ~18–35 ms | ~80 MB | Adult, explicit, and NSFW visual detection for avatars & banners. |

### Key Design Highlights

- **Single-Thread Execution (`MODERATION_CPU_THREADS=1`)**: Pinned via ONNX `intraOpNumThreads: 1` and `interOpNumThreads: 1` to prevent CPU starvation for co-located K3s pods (MariaDB, Redis Sentinel, Argo, Prometheus).
- **Anti-Dilution Clause Chunking**: Splits longer bio texts across clause boundaries so single toxic sentences within benign gaming paragraphs are caught reliably.
- **De-obfuscation (`src/utils/moderation.ts`)**: Automatically unmasks leetspeak (`F4gg0t5` → `faggot`) and Thai separator censorship (`ค_ย` → `ควย`, `เ_ด` → `เย็ด`).
- **HTTP 451 Rejections**: `PATCH /v1/me/` returns HTTP 451 (`Unavailable For Legal Reasons`) on moderation failures so client web applications can explicitly prompt the creator.

---

## Testing & Quality Checks

```bash
# Strict Typecheck
bun x tsc --noEmit

# Run unit and integration tests
bun test

# Run moderation pipeline tests
bun test test/moderation.test.ts

# Compile standalone production binary
bun run build
```

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
