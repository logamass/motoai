#!/bin/bash
# MotoAI — Manual DB backup
# Usage: ./backup-db.sh
# Backups saved to /opt/motoai/backups/

set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/motoai/backups"
BACKUP_FILE="$BACKUP_DIR/motoai_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "📦 Backing up MotoAI database..."
docker compose -f /opt/motoai/docker-compose.prod.yml exec -T db \
  pg_dump -U motoai --format=custom motoai | gzip > "$BACKUP_FILE"

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "✅ Backup saved: $BACKUP_FILE ($SIZE)"

# Clean old backups (keep 30 days)
find "$BACKUP_DIR" -name "motoai_*.sql.gz" -mtime +30 -delete 2>/dev/null || true
echo "🧹 Old backups (>30 days) cleaned"
