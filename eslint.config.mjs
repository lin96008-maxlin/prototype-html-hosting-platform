import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    ".next*/**",
    "out/**",
    "output/**",
    "build/**",
    "playwright-report/**",
    "test-results/**",
    "high-fidelity-prototype-ant-design/**",
    "next-env.d.ts",
  ]),
]);
