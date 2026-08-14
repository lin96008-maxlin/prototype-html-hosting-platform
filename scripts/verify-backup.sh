#!/bin/sh
set -eu

: "${RESTIC_REPOSITORY:?缺少 RESTIC_REPOSITORY}"
: "${RESTIC_PASSWORD:?缺少 RESTIC_PASSWORD}"
: "${PGHOST:?缺少 PGHOST}"
: "${PGUSER:?缺少 PGUSER}"
: "${PGDATABASE:?缺少 PGDATABASE}"
: "${PGPASSWORD:?缺少 PGPASSWORD}"

STATUS_DIR="${BACKUP_STATUS_DIR:-/status}"
STATUS_FILE="$STATUS_DIR/backup-status.json"
snapshot="${1:-latest}"
mkdir -p "$STATUS_DIR" /staging
exec 8>"$STATUS_DIR/maintenance.lock"
flock -w "${BACKUP_LOCK_TIMEOUT_SECONDS:-600}" 8 || {
  echo "等待备份维护锁超时" >&2
  exit 1
}
verify_root="$(mktemp -d /staging/restore-verify.XXXXXX)"
verify_database="prototype_restore_verify_$(date +%s)_$$"
database_created=0

case "$verify_database" in
  prototype_restore_verify_[0-9]*) ;;
  *) echo "临时数据库名称不安全" >&2; exit 1 ;;
esac

update_verify_status() {
  state="$1"
  verified_at="$2"
  verified_epoch="$3"
  error_message="$4"
  project_count="${5:-0}"
  file_count="${6:-0}"
  temp_file="$STATUS_FILE.tmp"

  [ -f "$STATUS_FILE" ] || printf '{}\n' > "$STATUS_FILE"
  jq \
    --arg state "$state" \
    --arg verifiedAt "$verified_at" \
    --argjson verifiedEpoch "$verified_epoch" \
    --arg error "$error_message" \
    --argjson projectCount "$project_count" \
    --argjson fileCount "$file_count" \
    '.lastRestoreVerificationStatus = $state
      | .lastRestoreVerifiedAt = (if $verifiedAt == "" then null else $verifiedAt end)
      | .lastRestoreVerifiedEpoch = $verifiedEpoch
      | .lastRestoreError = (if $error == "" then null else $error end)
      | .restoredProjectCount = $projectCount
      | .restoredFileCount = $fileCount' \
    "$STATUS_FILE" > "$temp_file"
  mv "$temp_file" "$STATUS_FILE"
}

cleanup() {
  if [ "$database_created" -eq 1 ]; then
    dropdb --if-exists "$verify_database" >/dev/null 2>&1 || true
  fi
  case "$verify_root" in
    /staging/restore-verify.*) rm -rf "$verify_root" ;;
  esac
}

on_exit() {
  exit_code="$?"
  trap - EXIT INT TERM
  cleanup
  if [ "$exit_code" -ne 0 ]; then
    update_verify_status \
      "failed" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$(date +%s)" \
      "隔离恢复验证失败，请查看 backup 容器日志"
  fi
  exit "$exit_code"
}
trap on_exit EXIT INT TERM

status_database_bytes="$(jq -r '.databaseDumpBytes // 0' "$STATUS_FILE" 2>/dev/null || printf '0\n')"
available_bytes="$(( $(df -Pk /staging | awk 'NR == 2 {print $4}') * 1024 ))"
required_bytes=$((status_database_bytes * 3 + 134217728))
[ "$available_bytes" -gt "$required_bytes" ] || {
  echo "剩余磁盘空间不足，取消隔离恢复验证" >&2
  exit 1
}

update_verify_status "running" "" 0 ""
restic restore "$snapshot" --target "$verify_root"

dump_file="$verify_root/staging/database.dump"
[ -r "$dump_file" ] || {
  echo "快照中缺少数据库备份" >&2
  exit 1
}
pg_restore --list "$dump_file" >/dev/null

createdb "$verify_database"
database_created=1
pg_restore --exit-on-error --no-owner --dbname "$verify_database" "$dump_file"
project_count="$(psql --dbname "$verify_database" -Atc 'select count(*) from projects')"
file_count=0

verified_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
verified_epoch="$(date +%s)"
cleanup
database_created=0
trap - EXIT INT TERM
update_verify_status "success" "$verified_at" "$verified_epoch" "" "$project_count" "$file_count"

echo "隔离恢复验证完成：数据库原型记录 $project_count 个"
