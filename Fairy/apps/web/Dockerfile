# syntax=docker/dockerfile:1
# 构建上下文是 monorepo 根目录 Fairy/：docker build -f apps/web/Dockerfile .
FROM node:20-alpine AS builder

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN apk add --no-cache openssl ca-certificates
RUN corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/ai-sdk/package.json packages/ai-sdk/
COPY packages/database/package.json packages/database/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @fairy/database generate
# Vite 在构建期内联 import.meta.env.VITE_API_URL：换域名发布必须重新 build，
# 不能指望运行时配置。默认空串 = 同源相对路径（配合反代 /api 时使用）
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter "@fairy/web..." run build

FROM nginx:alpine AS runtime

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
