import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const errors = [];
if (!process.env.DATABASE_URL) errors.push("缺少 DATABASE_URL");
if (!process.env.SESSION_SIGNING_SECRET || process.env.SESSION_SIGNING_SECRET.length < 32) {
  errors.push("SESSION_SIGNING_SECRET 至少需要 32 个字符");
}
if (!process.env.SHARE_PASSWORD_ENCRYPTION_KEY || process.env.SHARE_PASSWORD_ENCRYPTION_KEY.length < 32) {
  errors.push("SHARE_PASSWORD_ENCRYPTION_KEY 至少需要 32 个字符");
}
if (process.env.SHARE_PASSWORD_ENCRYPTION_KEY === process.env.SESSION_SIGNING_SECRET) {
  errors.push("分享密码加密密钥不能与会话签名密钥相同");
}
for (const name of ["MANAGE_URL", "DEMO_URL"]) {
  const value = process.env[name];
  try {
    if (!value || new URL(value).protocol !== "https:") throw new Error();
  } catch {
    errors.push(`${name} 必须是有效的 HTTPS 地址`);
  }
}
if (!process.env.AUTH_COOKIE_DOMAIN?.startsWith(".")) {
  errors.push("AUTH_COOKIE_DOMAIN 必须是以点开头的根域名，例如 .example.com");
}

if (errors.length) {
  console.error(`生产环境配置校验失败：\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log("生产环境配置校验通过");
