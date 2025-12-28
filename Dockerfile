FROM node:20-alpine

RUN corepack enable pnpm

WORKDIR /app

COPY . .

RUN pnpm install
RUN pnpm build:config

# Generate Prisma Client
RUN cd apps/client && pnpm db:generate

COPY .env* ./

# Run migrations on startup, then start the bot
CMD sh -c "cd apps/client && pnpm db:migrate && cd ../.. && pnpm reallocate"
