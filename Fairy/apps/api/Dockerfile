# 故意不写 `# syntax=docker/dockerfile:1`：本文件只用标准 Dockerfile 语法，无需钉前端版本；
# 写上会让 BuildKit 额外去 Docker Hub 拉 docker/dockerfile 前端镜像，在无法直连 Docker Hub 的
# 网络（国内自托管常见）直接卡死。去掉后走 BuildKit 内置前端，构建零额外拉取。
# 构建上下文是 monorepo 根目录 Fairy/：docker build -f apps/api/Dockerfile .
FROM node:20-alpine AS builder

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# prisma 的查询引擎在 alpine 上动态链接 openssl；tzdata 仅运行时需要
RUN apk add --no-cache openssl ca-certificates
RUN corepack prepare pnpm@9.0.0 --activate
# prepare --activate 只下载并设为默认版本，不在 PATH 上生成 shim；少了这行后续 RUN pnpm 全部 127
RUN corepack enable

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

# 构建产物可直接被 node 跑：api/shared/ai-sdk/database 四个包的 tsconfig 用
# moduleResolution: NodeNext，源码里的相对 import 一律带 .js 扩展名（tsc 会把 ./x.js
# 解析到 ./x.ts），Node 原生 ESM 因此无需任何 loader。web 仍由 Vite 打包，保持根的
# Bundler 解析不变。
CMD ["node", "apps/api/dist/index.js"]
