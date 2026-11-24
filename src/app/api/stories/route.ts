import { NextResponse } from "next/server";
import { countStories, getLastRefreshAt, listStories } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/stories — قائمة الأخبار مرتبة بدرجة الأهمية القانونية + بيانات التحديث
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "غير مصرّح. سجّل الدخول أولاً." }, { status: 401 });
  }
  return NextResponse.json({
    stories: listStories(),
    total: countStories(),
    lastRefreshAt: getLastRefreshAt(),
  });
}
