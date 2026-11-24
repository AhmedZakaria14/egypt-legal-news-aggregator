import { NextResponse } from "next/server";
import { listDrafts } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/drafts — كل المسودات المحفوظة (الأحدث أولاً)
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "غير مصرّح. سجّل الدخول أولاً." }, { status: 401 });
  }
  const drafts = listDrafts();
  return NextResponse.json({ drafts, total: drafts.length });
}
