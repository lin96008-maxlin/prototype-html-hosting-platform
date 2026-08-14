#!/usr/bin/env bash
set -Eeuo pipefail

PUBLIC_KEY_FILE="${1:-/tmp/prototype_demo-github-actions-deploy.pub}"
DEPLOY_SCRIPT_FILE="${2:-/tmp/prototype-demo-deploy}"
BACKUP_MAINTENANCE_FILE="${3:-/tmp/prototype-hub-backup-maintenance}"
DEPLOY_USER="prototype-demo-deploy"
DEPLOY_HOME="/home/$DEPLOY_USER"

[[ "$(id -u)" -eq 0 ]] || {
  echo "必须使用 root 执行初始化脚本" >&2
  exit 1
}
[[ -s "$PUBLIC_KEY_FILE" ]] || {
  echo "未找到部署公钥" >&2
  exit 1
}
[[ -s "$DEPLOY_SCRIPT_FILE" ]] || {
  echo "未找到部署脚本" >&2
  exit 1
}
[[ -s "$BACKUP_MAINTENANCE_FILE" ]] || {
  echo "未找到备份维护脚本" >&2
  exit 1
}

if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$DEPLOY_USER"
fi

install -d -m 0700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$DEPLOY_HOME/.ssh"
install -d -m 0700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$DEPLOY_HOME/incoming"

public_key="$(tr -d '\r\n' < "$PUBLIC_KEY_FILE")"
authorized_keys="$DEPLOY_HOME/.ssh/authorized_keys"
touch "$authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "$authorized_keys"
chmod 0600 "$authorized_keys"
if ! grep -Fqx "restrict $public_key" "$authorized_keys"; then
  printf 'restrict %s\n' "$public_key" >> "$authorized_keys"
fi

install -m 0750 -o root -g root "$DEPLOY_SCRIPT_FILE" /usr/local/sbin/prototype-demo-deploy
install -m 0750 -o root -g root "$BACKUP_MAINTENANCE_FILE" /usr/local/sbin/prototype-hub-backup-maintenance

sudoers_temp="$(mktemp)"
trap 'rm -f "$sudoers_temp"' EXIT
printf '%s\n' \
  'prototype-demo-deploy ALL=(root) NOPASSWD: /usr/local/sbin/prototype-demo-deploy *' \
  'prototype-demo-deploy ALL=(root) NOPASSWD: /usr/local/sbin/prototype-hub-backup-maintenance *' \
  > "$sudoers_temp"
chmod 0440 "$sudoers_temp"
visudo -cf "$sudoers_temp" >/dev/null
install -m 0440 -o root -g root "$sudoers_temp" /etc/sudoers.d/prototype-demo-deploy

chown root:root /opt/prototype-hosting-platform-demo
chmod 0750 /opt/prototype-hosting-platform-demo
install -d -m 0700 -o root -g root /opt/prototype-hosting-platform-demo/releases

echo "GitHub Actions 专用部署账号已配置"
