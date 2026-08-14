import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { query } from "@/lib/db";
import { env, isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!isDemoMode) {
      await Promise.all([
        query("select 1"),
        access(path.resolve(env.dataDir), constants.R_OK | constants.W_OK),
      ]);
    }
    return Response.json({ status: "ok" }, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ status: "unavailable" }, {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }
}
