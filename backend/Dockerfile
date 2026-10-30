# Build context is the repository root (see docker-compose.yml).
FROM node:22-slim
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY backend/prisma backend/prisma
RUN npm ci --workspace backend --include-workspace-root

COPY backend backend
RUN npm run build --workspace backend

WORKDIR /app/backend
ENV NODE_ENV=production
EXPOSE 4000
# Applies pending migrations, seeds base data (never overwrites existing rows), then starts the API.
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts && node dist/server.js"]
