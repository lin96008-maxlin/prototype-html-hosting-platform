#!/bin/sh
set -u

interval_seconds="${BACKUP_INTERVAL_SECONDS:-86400}"
retry_seconds="${BACKUP_RETRY_SECONDS:-300}"

while true; do
  if /usr/local/bin/backup.sh; then
    sleep "$interval_seconds"
  else
    echo "备份失败，将在 ${retry_seconds} 秒后重试" >&2
    sleep "$retry_seconds"
  fi
done
