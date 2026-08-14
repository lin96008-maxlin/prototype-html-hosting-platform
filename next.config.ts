import type { NextConfig } from "next";

const basePath = (() => {
  const value = process.env.NEXT_PUBLIC_BASE_PATH?.trim();
  if (!value || value === "/") return "";
  return `/${value.replace(/^\/+|\/+$/g, "")}`;
})();

const nextConfig: NextConfig = {
  basePath,
  devIndicators: false,
  skipTrailingSlashRedirect: true,
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
  outputFileTracingIncludes: {
    "/*": ["./node_modules/node-unrar-js/esm/js/unrar.wasm"],
  },
};

export default nextConfig;
