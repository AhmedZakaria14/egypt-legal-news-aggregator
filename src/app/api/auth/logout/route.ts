import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/auth/logout — إنهاء جلسة اللوحة
export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
