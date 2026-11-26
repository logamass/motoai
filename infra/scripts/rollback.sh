#!/bin/bash
# MotoAI — Rollback to previous version
# Usage: ./rollback.sh

set -euo pipefail

cd /opt/motoai

if [ ! -f .previous-image ]; then
  echo "❌ No previous version found (.previous-image missing)"
  exit 1
fi

PREV=$(cat .previous-image)
echo "🔄 Rolling back to: $PREV"

docker tag "$PREV" ghcr.io/motoai:rollback 2>/dev/null || true
APP_VERSION=rollback docker compose -f docker-compose.prod.yml up -d app

sleep 5
if curl -sf http://localhost:3000/api/health > /dev/null; then
  echo "✅ Rollback successful"
else
  echo "⚠️ Rollback deployed but health check still failing — check logs:"
  echo "  docker compose -f docker-compose.prod.yml logs app --tail 50"
fi
