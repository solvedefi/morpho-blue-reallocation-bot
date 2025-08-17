FROM node:20-alpine

RUN corepack enable pnpm

WORKDIR /app

COPY . .

RUN pnpm install
RUN pnpm build:config

COPY .env* ./

CMD ["pnpm", "reallocate"]
