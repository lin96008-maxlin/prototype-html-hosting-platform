import nextEnv from "@next/env";
import pg from "pg";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const required = ["DATABASE_URL"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`缺少环境变量：${missing.join(", ")}`);
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
  await client.query("begin");
  const existing = await client.query("select 1 from users limit 1");
  if (existing.rowCount) {
    await client.query("rollback");
    console.log("系统已有用户，已跳过超级管理员初始化。");
    process.exitCode = 0;
  } else {
    const account = process.env.BOOTSTRAP_SUPER_ADMIN_ACCOUNT?.trim().toLowerCase();
    const password = process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD;
    if (!account || !password || password.length < 8) {
      throw new Error("首次启动时必须设置超级管理员账号及至少 8 位初始密码");
    }
    const departmentName = process.env.BOOTSTRAP_DEPARTMENT_NAME || "产品中心";
    const department = await client.query(
      `insert into departments (name, sort_order) values ($1, 1)
       returning id`,
      [departmentName],
    );
    await client.query(
      `insert into users (account, password_hash, name, department_id, role)
       values ($1, crypt($2, gen_salt('bf', 10)), $3, $4, 'super_admin')`,
      [
        account,
        password,
        process.env.BOOTSTRAP_SUPER_ADMIN_NAME || "系统管理员",
        department.rows[0].id,
      ],
    );
    await client.query(
      `insert into business_categories (name, sort_order) values
       ('企业服务', 10), ('协作工具', 20), ('数据产品', 30)
       on conflict (name) do nothing`,
    );
    await client.query("commit");
    console.log(`超级管理员 ${account} 初始化完成。`);
  }
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
