import { NextResponse } from "next/server";
import { deleteDraft, updateDraft } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

// PATCH /api/drafts/[id] — تعديل نص المسودة و/أو حالتها (draft | used)
export async function PATCH(req: Request, ctx: Ctx) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "غير مصرّح. سجّل الدخول أولاً." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const draftId = Number(id);
  if (!Number.isFinite(draftId)) {
    return NextResponse.json({ error: "معرّف غير صالح." }, { status: 400 });
  }
  let body: { text?: unknown; status?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح." }, { status: 400 });
  }
  const patch: { text?: string; status?: "draft" | "used" } = {};
  if (typeof body.text === "string") patch.text = body.text;
  if (body.status === "draft" || body.status === "used") patch.status = body.status;
  const updated = updateDraft(draftId, patch);
  if (!updated) {
    return NextResponse.json({ error: "المسودة غير موجودة." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, draft: updated });
}

// DELETE /api/drafts/[id] — حذف مسودة
export async function DELETE(_req: Request, ctx: Ctx) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "غير مصرّح. سجّل الدخول أولاً." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const draftId = Number(id);
  if (!Number.isFinite(draftId) || !deleteDraft(draftId)) {
    return NextResponse.json({ error: "المسودة غير موجودة." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
