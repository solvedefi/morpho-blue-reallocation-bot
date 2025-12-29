FROM node:20-alpine

RUN corepack enable pnpm

WORKDIR /app

COPY . .

RUN pnpm install
RUN pnpm build:all

# Generate Prisma Client
RUN cd apps/server && pnpm prisma generate

COPY .env* ./

# Run migrations on startup, then start the server
CMD sh -c "pnpm db:migrate && pnpm start"
