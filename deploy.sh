#!/bin/bash
set -e

source ~/.profile || true
source ~/.bashrc || true
export PATH="/root/.bun/bin:$PATH"

echo "✅ Environment loaded."

echo "👉 Pulling latest code..."
git pull origin main

echo "🔨 Building client..."
cd ./src/client
bun run build

echo "🖼️ restarting Server..."
cd ../..
bun install
pm2 restart smartduck || pm2 start --name smartduck -- bun run start

echo "✅ Deploy complete!"
