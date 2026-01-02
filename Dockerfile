FROM node:20-alpine

# Install OpenSSL (required by Prisma)
RUN apk add --no-cache openssl

RUN corepack enable pnpm

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
COPY apps/ui/package.json ./apps/ui/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma Client FIRST (TypeScript build needs the types)
RUN cd apps/server && pnpm prisma generate

# Build UI first, then server (UI build artifacts needed by server)
RUN pnpm build:ui
RUN pnpm build:server

# Expose port 3000
EXPOSE 3000

# Run migrations on startup, then start the server
CMD sh -c "pnpm db:migrate && pnpm start"
