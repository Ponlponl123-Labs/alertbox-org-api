# ---------------------------------------------------
# Stage 1: Build
# ---------------------------------------------------
FROM oven/bun:1.3-alpine AS build

WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Generate Prisma Client
COPY prisma ./prisma
RUN bun prisma generate

# Copy source and build
COPY . .
RUN bun build ./src/index.ts --outdir ./dist --target bun --minify --sourcemap=none

# ---------------------------------------------------
# Stage 2: Runtime
# ---------------------------------------------------
FROM oven/bun:1.3-alpine AS release

# Set production environment
ENV NODE_ENV=production

WORKDIR /app

# Copy the build output from the build stage
COPY --from=build /app/dist/index.js ./index.js

# Copy static assets required by the server (favicon.ico is served in src/core/server.ts)
COPY --from=build /app/favicon.ico ./favicon.ico

# Copy Prisma schema, migrations, config, and CLI for runtime migration execution
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/src/config ./src/config

# Kubernetes / Docker best practice: run as a non-root user
USER bun

# Default port for Elysia
EXPOSE 3000

# Start the application
ENTRYPOINT ["bun", "run", "index.js"]
