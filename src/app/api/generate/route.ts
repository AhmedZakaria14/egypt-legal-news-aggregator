import { NextResponse } from "next/server";
import { createDraft, getStoryById } from "@/lib/db";
import { generateDraftText } from "@/lib/generate";
import { MISSING_KEY_ERROR, hasApiKey } from "@/lib/claude";
import { isAuthenticated } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/generate — توليد مسودة (بوست فيسبوك | سكربت فيديو) لخبر معيّن وحفظها
// Body: { storyId: number, type: "post" | "script" }
export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "غير مصرّح. سجّل الدخول أولاً." }, { status: 401 });
  }
  if (!hasApiKey()) {
    return NextResponse.json({ error: MISSING_KEY_ERROR }, { status: 400 });
  }

  let body: { storyId?: unknown; type?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح." }, { status: 400 });
  }
  const storyId = Number(body.storyId);
  const type = body.type === "script" ? "script" : body.type === "post" ? "post" : null;
  if (!Number.isFinite(storyId) || !type) {
    return NextResponse.json({ error: "بيانات ناقصة: storyId و type مطلوبان." }, { status: 400 });
  }

  const story = getStoryById(storyId);
  if (!story) {
    return NextResponse.json({ error: "الخبر غير موجود." }, { status: 404 });
  }

  try {
    const text = await generateDraftText(story, type);
    const draft = createDraft({
      type,
      storyId: story.id,
      storyTitle: story.title,
      text,
    });
    return NextResponse.json({ ok: true, draft });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "فشل التوليد." },
      { status: 500 }
    );
  }
}
