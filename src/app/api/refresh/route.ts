import { NextResponse } from "next/server";
import { refreshNews } from "@/lib/refresh";
import { isAuthenticated } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/refresh — جلب أحدث الأخبار من الخلاصات وتقييم الجديد منها
export async function POST() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "غير مصرّح. سجّل الدخول أولاً." }, { status: 401 });
  }
  try {
    const result = await refreshNews();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "فشل التحديث." },
      { status: 500 }
    );
  }
}
