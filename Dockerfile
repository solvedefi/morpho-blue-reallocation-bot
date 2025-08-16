# Use Node.js 18+ as specified in engines
FROM node:18-alpine

# Install pnpm
RUN corepack enable pnpm

# Set working directory
WORKDIR /app

# Copy package manager files
COPY package.json pnpm-lock.yaml* ./

# Copy workspace configuration
COPY apps/client/package.json ./apps/client/
COPY apps/config/package.json ./apps/config/
COPY apps/ponder/package.json ./apps/ponder/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY apps/ ./apps/
COPY tsconfig.json* ./

# Build the config package
RUN pnpm build:config

# Copy environment file
COPY .env* ./

# Expose any required ports (if needed)
# EXPOSE 3000

# Start the reallocation bot
CMD ["pnpm", "reallocate"]