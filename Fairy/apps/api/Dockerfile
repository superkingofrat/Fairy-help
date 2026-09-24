# syntax=docker/dockerfile:1
# 构建上下文是 monorepo 根目录 Fairy/：docker build -f apps/api/Dockerfile .
FROM node:20-alpine AS builder

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# prisma 的查询引擎在 alpine 上动态链接 openssl；tzdata 仅运行时需要
RUN apk add --no-cache openssl ca-certificates
RUN corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# 先只拷 manifest 再做一次 install，让依赖层可被缓存
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/ai-sdk/package.json packages/ai-sdk/
COPY packages/database/package.json packages/database/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @fairy/database generate
# "@fairy/api..." 带上尾随三点：api 及其依赖（shared / ai-sdk / database）按拓扑序构建
RUN pnpm --filter "@fairy/api..." run build

FROM node:20-alpine AS runtime

ENV NODE_ENV=production
ENV TZ=Asia/Shanghai
ENV PORT=3000

# TZ 只是环境变量：没有 zoneinfo 文件时 Date 仍按 UTC 走；查询引擎还需要 openssl
RUN apk add --no-cache tzdata openssl ca-certificates

WORKDIR /app

# 整棵 node_modules 连带 .pnpm 内部相对符号链接一起拷贝，工作区依赖（@fairy/*）
# 与 prisma 已生成的 client 才保持可解析
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/package.json ./package.json

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

CMD ["node", "apps/api/dist/index.js"]
