#!/bin/sh
set -eu

STATUS_FILE="${BACKUP_STATUS_DIR:-/status}/backup-status.json"
MAX_AGE_SECONDS="${BACKUP_MAX_AGE_SECONDS:-93600}"

[ -r "$STATUS_FILE" ] || {
  echo "尚无备份状态文件" >&2
  exit 1
}

status="$(jq -r '.status // "unknown"' "$STATUS_FILE")"
last_success_epoch="$(jq -r '.lastSuccessEpoch // 0' "$STATUS_FILE")"
now_epoch="$(date +%s)"

case "$status" in
  success|running) ;;
  *)
    echo "最近一次备份任务状态异常：$status" >&2
    exit 1
    ;;
esac

[ "$last_success_epoch" -gt 0 ] || {
  echo "尚无成功备份" >&2
  exit 1
}

age_seconds=$((now_epoch - last_success_epoch))
[ "$age_seconds" -le "$MAX_AGE_SECONDS" ] || {
  echo "最近成功备份已超过 ${MAX_AGE_SECONDS} 秒" >&2
  exit 1
}

restic snapshots --latest 1 >/dev/null
