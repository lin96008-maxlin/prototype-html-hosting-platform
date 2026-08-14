#!/usr/bin/env bash
set -Eeuo pipefail

CONTEXT="${1:-.}"
RUN_ID="prototype-backup-smoke-$(date +%s)-$$"
NETWORK="$RUN_ID"
POSTGRES_CONTAINER="$RUN_ID-postgres"
BACKUP_CONTAINER="$RUN_ID-backup"
IMAGE="$RUN_ID:latest"
POSTGRES_VOLUME="$RUN_ID-postgres"
PROTOTYPE_VOLUME="$RUN_ID-prototype"
REPOSITORY_VOLUME="$RUN_ID-repository"
STAGING_VOLUME="$RUN_ID-staging"
STATUS_VOLUME="$RUN_ID-status"

cleanup() {
  docker rm -f "$BACKUP_CONTAINER" "$POSTGRES_CONTAINER" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
  for volume in "$POSTGRES_VOLUME" "$PROTOTYPE_VOLUME" "$REPOSITORY_VOLUME" "$STAGING_VOLUME" "$STATUS_VOLUME"; do
    case "$volume" in
      prototype-backup-smoke-*) docker volume rm "$volume" >/dev/null 2>&1 || true ;;
    esac
  done
  docker image rm "$IMAGE" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create "$NETWORK" >/dev/null
for volume in "$POSTGRES_VOLUME" "$PROTOTYPE_VOLUME" "$REPOSITORY_VOLUME" "$STAGING_VOLUME" "$STATUS_VOLUME"; do
  docker volume create "$volume" >/dev/null
done

docker run -d \
  --name "$POSTGRES_CONTAINER" \
  --network "$NETWORK" \
  -e POSTGRES_DB=prototype_demo \
  -e POSTGRES_USER=prototype_demo \
  -e POSTGRES_PASSWORD=backup-smoke-password \
  -v "$POSTGRES_VOLUME:/var/lib/postgresql/data" \
  public.ecr.aws/docker/library/postgres:16-alpine >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$POSTGRES_CONTAINER" pg_isready -U prototype_demo -d prototype_demo >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$POSTGRES_CONTAINER" pg_isready -U prototype_demo -d prototype_demo >/dev/null
docker exec "$POSTGRES_CONTAINER" psql -U prototype_demo -d prototype_demo -v ON_ERROR_STOP=1 -c \
  "create table projects (id text primary key); insert into projects values ('backup-smoke-project');" >/dev/null

docker run --rm -v "$PROTOTYPE_VOLUME:/data" public.ecr.aws/docker/library/postgres:16-alpine \
  sh -eu -c "mkdir -p /data/projects/backup-smoke; printf '%s\n' '<!doctype html><title>backup smoke</title>' > /data/projects/backup-smoke/index.html"

docker build -f "$CONTEXT/docker/backup.Dockerfile" -t "$IMAGE" "$CONTEXT" >/dev/null
docker run -d \
  --name "$BACKUP_CONTAINER" \
  --network "$NETWORK" \
  -e PGHOST="$POSTGRES_CONTAINER" \
  -e PGUSER=prototype_demo \
  -e PGPASSWORD=backup-smoke-password \
  -e PGDATABASE=prototype_demo \
  -e RESTIC_REPOSITORY=/repository \
  -e RESTIC_PASSWORD=backup-smoke-restic-password \
  -e BACKUP_HOSTNAME=prototype-backup-smoke \
  -e BACKUP_STATUS_DIR=/status \
  -e BACKUP_INTERVAL_SECONDS=86400 \
  -e BACKUP_RETRY_SECONDS=2 \
  -e BACKUP_MAX_AGE_SECONDS=300 \
  -e BACKUP_LOCK_TIMEOUT_SECONDS=60 \
  -v "$PROTOTYPE_VOLUME:/data:ro" \
  -v "$REPOSITORY_VOLUME:/repository" \
  -v "$STAGING_VOLUME:/staging" \
  -v "$STATUS_VOLUME:/status" \
  "$IMAGE" >/dev/null

backup_ready=0
for _ in $(seq 1 120); do
  if docker exec "$BACKUP_CONTAINER" /usr/local/bin/backup-healthcheck.sh >/dev/null 2>&1; then
    backup_ready=1
    break
  fi
  if [[ "$(docker inspect --format '{{.State.Running}}' "$BACKUP_CONTAINER" 2>/dev/null || true)" != "true" ]]; then
    break
  fi
  sleep 1
done
if [[ "$backup_ready" -ne 1 ]]; then
  docker logs "$BACKUP_CONTAINER" >&2 || true
  exit 1
fi

docker exec "$BACKUP_CONTAINER" /usr/local/bin/verify-backup.sh
if docker exec "$BACKUP_CONTAINER" restic ls latest | grep -q '^/data'; then
  echo "数据库备份中不应包含原型文件目录" >&2
  exit 1
fi
docker exec "$BACKUP_CONTAINER" jq -e \
  '.status == "success"
    and .lastSuccessEpoch > 0
    and .repositorySizeBytes > 0
    and .prototypeVolumeBytes > 0
    and .lastRestoreVerificationStatus == "success"
    and .restoredProjectCount == 1
    and .restoredFileCount == 0' \
  /status/backup-status.json >/dev/null

docker exec "$BACKUP_CONTAINER" cat /status/backup-status.json
echo "备份隔离冒烟测试通过"
