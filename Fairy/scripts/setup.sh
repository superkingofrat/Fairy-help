#!/usr/bin/env bash
set -e

echo "Setting up Fairy development environment..."

pnpm install
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env.local

pnpm --filter=@fairy/shared build
pnpm --filter=@fairy/ai-sdk build
pnpm --filter=@fairy/database generate

echo "Setup complete. Fill in the .env.local files before running pnpm dev."
