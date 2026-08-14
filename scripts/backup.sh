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
DUMP_FILE="/staging/database.dump"
mkdir -p "$STATUS_DIR" /staging
exec 8>"$STATUS_DIR/maintenance.lock"
flock -w "${BACKUP_LOCK_TIMEOUT_SECONDS:-600}" 8 || {
  echo "等待备份维护锁超时" >&2
  exit 1
}
backup_hostname="${BACKUP_HOSTNAME:-prototype-demo}"

read_status_field() {
  field="$1"
  if [ -f "$STATUS_FILE" ]; then
    jq -r --arg field "$field" '.[$field] // empty' "$STATUS_FILE" 2>/dev/null || true
  fi
}

read_status_number() {
  value="$(read_status_field "$1")"
  case "$value" in
    ''|*[!0-9]*) printf '0\n' ;;
    *) printf '%s\n' "$value" ;;
  esac
}

write_status() {
  state="$1"
  attempt_at="$2"
  attempt_epoch="$3"
  success_at="$4"
  success_epoch="$5"
  integrity_at="$6"
  snapshot_id="$7"
  repository_bytes="$8"
  prototype_bytes="$9"
  database_bytes="${10}"
  error_message="${11}"
  temp_file="$STATUS_FILE.tmp"

  jq -n \
    --arg status "$state" \
    --arg lastAttemptAt "$attempt_at" \
    --argjson lastAttemptEpoch "$attempt_epoch" \
    --arg lastSuccessAt "$success_at" \
    --argjson lastSuccessEpoch "${success_epoch:-0}" \
    --arg lastIntegrityCheckAt "$integrity_at" \
    --arg snapshotId "$snapshot_id" \
    --argjson repositorySizeBytes "${repository_bytes:-0}" \
    --argjson prototypeVolumeBytes "${prototype_bytes:-0}" \
    --argjson databaseDumpBytes "${database_bytes:-0}" \
    --arg error "$error_message" \
    --arg lastRestoreVerifiedAt "$(read_status_field lastRestoreVerifiedAt)" \
    --argjson lastRestoreVerifiedEpoch "$(read_status_number lastRestoreVerifiedEpoch)" \
    --arg lastRestoreVerificationStatus "$(read_status_field lastRestoreVerificationStatus)" \
    --arg lastRestoreError "$(read_status_field lastRestoreError)" \
    --argjson restoredProjectCount "$(read_status_number restoredProjectCount)" \
    --argjson restoredFileCount "$(read_status_number restoredFileCount)" \
    '{
      status: $status,
      lastAttemptAt: $lastAttemptAt,
      lastAttemptEpoch: $lastAttemptEpoch,
      lastSuccessAt: (if $lastSuccessAt == "" then null else $lastSuccessAt end),
      lastSuccessEpoch: $lastSuccessEpoch,
      lastIntegrityCheckAt: (if $lastIntegrityCheckAt == "" then null else $lastIntegrityCheckAt end),
      snapshotId: (if $snapshotId == "" then null else $snapshotId end),
      repositorySizeBytes: $repositorySizeBytes,
      prototypeVolumeBytes: $prototypeVolumeBytes,
      databaseDumpBytes: $databaseDumpBytes,
      error: (if $error == "" then null else $error end),
      lastRestoreVerifiedAt: (if $lastRestoreVerifiedAt == "" then null else $lastRestoreVerifiedAt end),
      lastRestoreVerifiedEpoch: ($lastRestoreVerifiedEpoch // 0),
      lastRestoreVerificationStatus: (if $lastRestoreVerificationStatus == "" then null else $lastRestoreVerificationStatus end),
      lastRestoreError: (if $lastRestoreError == "" then null else $lastRestoreError end),
      restoredProjectCount: ($restoredProjectCount // 0),
      restoredFileCount: ($restoredFileCount // 0)
    }' > "$temp_file"
  mv "$temp_file" "$STATUS_FILE"
}

attempt_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
attempt_epoch="$(date +%s)"
previous_success_at="$(read_status_field lastSuccessAt)"
previous_success_epoch="$(read_status_number lastSuccessEpoch)"
previous_integrity_at="$(read_status_field lastIntegrityCheckAt)"
previous_snapshot_id="$(read_status_field snapshotId)"
previous_repository_bytes="$(read_status_number repositorySizeBytes)"
previous_prototype_bytes="$(read_status_number prototypeVolumeBytes)"
previous_database_bytes="$(read_status_number databaseDumpBytes)"

write_status \
  "running" "$attempt_at" "$attempt_epoch" \
  "$previous_success_at" "${previous_success_epoch:-0}" \
  "$previous_integrity_at" "$previous_snapshot_id" \
  "${previous_repository_bytes:-0}" "${previous_prototype_bytes:-0}" \
  "${previous_database_bytes:-0}" ""

on_failure() {
  exit_code="$1"
  trap - EXIT
  failed_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  failed_epoch="$(date +%s)"
  write_status \
    "failed" "$failed_at" "$failed_epoch" \
    "$previous_success_at" "${previous_success_epoch:-0}" \
    "$previous_integrity_at" "$previous_snapshot_id" \
    "${previous_repository_bytes:-0}" "${previous_prototype_bytes:-0}" \
    "${previous_database_bytes:-0}" "备份任务失败，请查看 backup 容器日志"
  exit "$exit_code"
}
trap 'on_failure $?' EXIT

if ! restic snapshots >/dev/null 2>&1; then
  restic init
fi

dump_temp="$DUMP_FILE.tmp"
pg_dump --format=custom --file="$dump_temp"
mv "$dump_temp" "$DUMP_FILE"

restic backup "$DUMP_FILE" --tag database-daily --host "$backup_hostname"
restic check
restic forget --tag database-daily --host "$backup_hostname" --keep-daily 7 --prune

snapshot_json="$(restic snapshots \
  --tag database-daily \
  --host "$backup_hostname" \
  --latest 1 \
  --json)"
snapshot_id="$(printf '%s' "$snapshot_json" | jq -r '.[0].short_id // empty')"
repository_bytes="$(( $(du -sk "$RESTIC_REPOSITORY" | awk '{print $1}') * 1024 ))"
prototype_bytes="$(( $(du -sk /data | awk '{print $1}') * 1024 ))"
database_bytes="$(stat -c %s "$DUMP_FILE")"
success_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
success_epoch="$(date +%s)"

trap - EXIT
write_status \
  "success" "$attempt_at" "$attempt_epoch" \
  "$success_at" "$success_epoch" "$success_at" "$snapshot_id" \
  "$repository_bytes" "$prototype_bytes" "$database_bytes" ""

echo "备份完成：快照 $snapshot_id"
