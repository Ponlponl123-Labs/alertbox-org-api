# ---------------------------------------------------
# Stage 1: Build
# ---------------------------------------------------
FROM oven/bun:1.3-slim AS build

WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source and compile standalone binary
COPY . .
RUN mkdir -p /app/dist
RUN bun build --compile --minify-whitespace --minify-syntax --target bun ./src/index.ts --outfile /app/dist/server

# ---------------------------------------------------
# Stage 2: Runtime
# ---------------------------------------------------
FROM oven/bun:1.3-slim AS release

ENV NODE_ENV=production
ENV HOME=/home/bun
ENV HF_HOME=/home/bun/.cache
ENV TRANSFORMERS_CACHE=/home/bun/.cache

WORKDIR /app

# Ensure directories exist and permissions are set
RUN mkdir -p /home/bun/.cache /app/.cache /app/public/uploads && chown -R bun:bun /home/bun /app

# Copy the standalone compiled binary
COPY --from=build --chown=bun:bun /app/dist/server ./server

# Copy static assets required by the server
COPY --from=build --chown=bun:bun /app/favicon.ico ./favicon.ico
COPY --from=build --chown=bun:bun /app/public ./public

# Goose migration runner and migration files
COPY --from=gomicro/goose:v3.24.1 /bin/goose /usr/local/bin/goose
COPY --from=build --chown=bun:bun /app/migrations ./migrations
COPY --from=build --chown=bun:bun /app/package.json ./package.json

# Kubernetes / Docker best practice: run as non-root user
USER bun

# Default port for Elysia
EXPOSE 3000

# Start the standalone binary directly
ENTRYPOINT ["./server"]
