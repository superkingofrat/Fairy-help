#!/usr/bin/env bash
set -e

pnpm install
pnpm --filter=@fairy/database generate
pnpm dev
