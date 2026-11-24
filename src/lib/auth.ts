// بوابة كلمة مرور اختيارية للوحة التحكم.
// تُفعَّل فقط عند ضبط متغير البيئة DASHBOARD_PASSWORD.
// الجلسة: كوكي موقّعة بـ HMAC-SHA256 (node:crypto) — بسيطة لكنها حقيقية:
// لا يمكن تزويرها دون معرفة كلمة المرور نفسها.
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const AUTH_COOKIE = "eln_auth";

export function passwordGateEnabled(): boolean {
  return !!process.env.DASHBOARD_PASSWORD;
}

function sessionToken(): string {
  const password = process.env.DASHBOARD_PASSWORD || "";
  return createHmac("sha256", password).update("eln-session-v1").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function checkPassword(candidate: string): boolean {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return false;
  return safeEqual(candidate, password);
}

export async function isAuthenticated(): Promise<boolean> {
  if (!passwordGateEnabled()) return true;
  const store = await cookies();
  const value = store.get(AUTH_COOKIE)?.value;
  if (!value) return false;
  return safeEqual(value, sessionToken());
}

export async function setSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(AUTH_COOKIE, sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(AUTH_COOKIE);
}
