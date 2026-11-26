#!/bin/bash
# MotoAI — Manual deploy script (run on VPS)
# Usage: ./deploy.sh [version]
# Example: ./deploy.sh latest
#          ./deploy.sh abc1234

set -euo pipefail

VERSION="${1:-latest}"
COMPOSE_FILE="/opt/motoai/docker-compose.prod.yml"

echo "🚀 Deploying MotoAI version: $VERSION"

cd /opt/motoai

# Save current for rollback
docker compose -f "$COMPOSE_FILE" images -q app > .previous-image 2>/dev/null || true

# Pull and start
APP_VERSION="$VERSION" docker compose -f "$COMPOSE_FILE" pull app
APP_VERSION="$VERSION" docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

# Health check
echo "⏳ Waiting for health check..."
sleep 8
for i in 1 2 3 4 5; do
  if curl -sf http://localhost:3000/api/health > /dev/null; then
    echo "✅ Deploy successful — version $VERSION is live"
    docker system prune -f --filter "until=72h" > /dev/null 2>&1 || true
    exit 0
  fi
  echo "  Attempt $i/5..."
  sleep 5
done

echo "❌ Health check failed"
echo "Run: ./rollback.sh"
exit 1
