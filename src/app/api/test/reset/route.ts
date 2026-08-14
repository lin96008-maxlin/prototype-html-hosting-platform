import { NextResponse } from "next/server";
import { resetDemoStore } from "@/lib/demo-store";

export async function POST() {
  if (process.env.NODE_ENV === "production" || process.env.E2E_TEST_MODE !== "true") {
    return new NextResponse(null, { status: 404 });
  }
  resetDemoStore();
  return NextResponse.json({ ok: true });
}
