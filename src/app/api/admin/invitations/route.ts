import { customAlphabet } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { demoStore } from "@/lib/demo-store";
import { isDemoMode } from "@/lib/env";
import { rejectInvalidOrigin } from "@/lib/security";
import { readRequestJson } from "@/lib/request-json";

const createCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);
const schema = z.object({ expiresInMinutes: z.number().int().min(1).max(1440).default(10) });

export async function POST(request: Request) {
  const originError = rejectInvalidOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user || user.role !== "super_admin") {
    return NextResponse.json({ message: "仅超级管理员可生成邀请码" }, { status: 403 });
  }
  const parsed = schema.safeParse(await readRequestJson(request));
  if (!parsed.success) return NextResponse.json({ message: "有效期设置无效" }, { status: 400 });
  const now = new Date();
  const raw = createCode();
  const invitation = {
    id: crypto.randomUUID(),
    code: `DEMO-${raw.slice(0, 4)}-${raw.slice(4, 8)}`,
    expiresAt: new Date(now.getTime() + parsed.data.expiresInMinutes * 60_000).toISOString(),
    usedAt: null,
    usedByName: null,
    createdByName: user.name,
    createdAt: now.toISOString(),
  };
  if (isDemoMode) demoStore.invitations.unshift(invitation);
  else {
    await query(
      `insert into invitation_codes (id, code, expires_at, created_by, created_by_name)
       values ($1, $2, $3, $4, $5)`,
      [invitation.id, invitation.code, invitation.expiresAt, user.id, user.name],
    );
  }
  return NextResponse.json({ invitation });
}
