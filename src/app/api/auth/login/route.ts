import { NextResponse } from "next/server";
import { checkPassword, passwordGateEnabled, setSessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/auth/login — تسجيل الدخول بكلمة مرور اللوحة (DASHBOARD_PASSWORD)
export async function POST(req: Request) {
  if (!passwordGateEnabled()) {
    return NextResponse.json({ ok: true, note: "بوابة كلمة المرور غير مفعّلة." });
  }
  let body: { password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح." }, { status: 400 });
  }
  if (typeof body.password !== "string" || !checkPassword(body.password)) {
    return NextResponse.json({ error: "كلمة المرور غير صحيحة." }, { status: 401 });
  }
  await setSessionCookie();
  return NextResponse.json({ ok: true });
}
