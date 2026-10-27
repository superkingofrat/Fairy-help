# 故意不写 `# syntax=docker/dockerfile:1`：本文件只用标准 Dockerfile 语法，无需钉前端版本；
# 写上会让 BuildKit 额外去 Docker Hub 拉 docker/dockerfile 前端镜像，在无法直连 Docker Hub 的
# 网络（国内自托管常见）直接卡死。去掉后走 BuildKit 内置前端，构建零额外拉取。
# 构建上下文是 monorepo 根目录 Fairy/：docker build -f apps/web/Dockerfile .
FROM node:20-alpine AS builder

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN apk add --no-cache openssl ca-certificates
RUN corepack prepare pnpm@9.0.0 --activate
# prepare --activate 只下载并设为默认版本，不在 PATH 上生成 shim；少了这行后续 RUN pnpm 全部 127
RUN corepack enable

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
# VITE_AMAP_JS_KEY（高德浏览器端安全密钥）同样 build-time 内联；不传则行程地图
# 静默不渲染（TripMap 三种降级之一），不影响其余功能。
# 注：BuildKit 会对此处报 SecretsUsedInArgOrEnv 警告——该 key 按设计就是要内联进浏览器
# 产物的公开参照受限密钥（服务端 AMAP_SERVER_KEY 严禁出现在任何前端产物，AGENTS §14），
# 属误报；警告不影响构建结果。
ARG VITE_AMAP_JS_KEY=""
ENV VITE_AMAP_JS_KEY=$VITE_AMAP_JS_KEY
RUN pnpm --filter "@fairy/web..." run build

FROM nginx:alpine AS runtime

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
