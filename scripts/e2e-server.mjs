import { spawn } from "node:child_process";
import path from "node:path";

const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, "dev", "--hostname", "127.0.0.1", "--port", "3100"], {
  env: {
    ...process.env,
    DEMO_MODE: "true",
    E2E_TEST_MODE: "true",
    NEXT_DIST_DIR: ".next-e2e",
    MANAGE_URL: "http://127.0.0.1:3100",
    DEMO_URL: "http://127.0.0.1:3100",
  },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code) => process.exit(code ?? 0));
