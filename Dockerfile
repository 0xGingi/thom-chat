FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache bun install

COPY . .

# Set environment variables for build
ENV NODE_ENV=production

# Build the application
RUN bun run build

# Production image
FROM oven/bun:1

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock

# Copy migrations
COPY --from=builder /app/drizzle ./drizzle

RUN --mount=type=cache,target=/root/.bun/install/cache bun install

EXPOSE 3000

ENV PORT=3000
ENV HOST=0.0.0.0
# Ensure data directory exists
RUN mkdir -p data

CMD ["bun", "build/index.js"]
