"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Draft, Story } from "@/lib/db";

const CATEGORY_CHIPS = [
  "الكل",
  "قضية رأي عام",
  "حكم محكمة",
  "قانون جديد",
  "قرار رسمي",
  "تريند",
] as const;

const STALE_MS = 30 * 60 * 1000;

interface Props {
  initialStories: Story[];
  initialDrafts: Draft[];
  initialLastRefreshAt: string | null;
  gateEnabled: boolean;
  aiEnabled: boolean;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    hour: "numeric",
    minute: "2-digit",
    day: "numeric",
    month: "long",
  }).format(d);
}

function scoreColor(score: number): string {
  if (score >= 70) return "bg-red-600";
  if (score >= 40) return "bg-gold-500";
  if (score >= 20) return "bg-navy-700";
  return "bg-slate-400";
}

export default function Dashboard({
  initialStories,
  initialDrafts,
  initialLastRefreshAt,
  gateEnabled,
  aiEnabled,
}: Props) {
  const router = useRouter();
  const [stories, setStories] = useState<Story[]>(initialStories);
  const [drafts, setDrafts] = useState<Draft[]>(initialDrafts);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(initialLastRefreshAt);
  const [view, setView] = useState<"stream" | "drafts">("stream");
  const [category, setCategory] = useState<string>("الكل");
  const [legalOnly, setLegalOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState("");
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const autoRefreshed = useRef(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 3500);
  }, []);

  const reloadStories = useCallback(async () => {
    const res = await fetch("/api/stories");
    if (res.ok) {
      const data = await res.json();
      setStories(data.stories);
      setLastRefreshAt(data.lastRefreshAt);
    }
  }, []);

  const doRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshNote("");
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "فشل التحديث.");
      await reloadStories();
      setRefreshNote(
        `تم جلب ${data.fetchedTotal} خبراً من المصادر، منها ${data.newStories} جديد، وقُيّم ${data.scoredCount} خبراً (${
          data.scoringMethod === "claude" ? "بذكاء Claude" : "بالكلمات المفتاحية"
        }).`
      );
    } catch (e) {
      setRefreshNote(e instanceof Error ? e.message : "فشل التحديث.");
    } finally {
      setRefreshing(false);
    }
  }, [reloadStories]);

  // تحديث تلقائي عند فتح الصفحة إذا كانت البيانات أقدم من 30 دقيقة
  useEffect(() => {
    if (autoRefreshed.current) return;
    autoRefreshed.current = true;
    const stale =
      !initialLastRefreshAt || Date.now() - new Date(initialLastRefreshAt).getTime() > STALE_MS;
    if (stale) void doRefresh();
  }, [initialLastRefreshAt, doRefresh]);

  async function generate(story: Story, type: "post" | "script") {
    const key = `${story.id}-${type}`;
    setGeneratingId(key);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storyId: story.id, type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل التوليد.");
      setDrafts((prev) => [data.draft as Draft, ...prev]);
      showToast(type === "post" ? "تم توليد بوست فيسبوك وحفظه في المسودات." : "تم توليد سكربت الفيديو وحفظه في المسودات.");
      setView("drafts");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "فشل التوليد.");
    } finally {
      setGeneratingId(null);
    }
  }

  async function patchDraft(id: number, patch: { text?: string; status?: "draft" | "used" }) {
    const res = await fetch(`/api/drafts/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data.error || "فشل الحفظ.");
      return;
    }
    setDrafts((prev) => prev.map((d) => (d.id === id ? (data.draft as Draft) : d)));
  }

  async function removeDraft(id: number) {
    if (!window.confirm("حذف هذه المسودة نهائياً؟")) return;
    const res = await fetch(`/api/drafts/${id}`, { method: "DELETE" });
    if (res.ok) {
      setDrafts((prev) => prev.filter((d) => d.id !== id));
      showToast("تم حذف المسودة.");
    } else {
      showToast("فشل الحذف.");
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("تم النسخ إلى الحافظة.");
    } catch {
      showToast("تعذّر النسخ التلقائي — حدّد النص وانسخه يدوياً.");
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const trending = useMemo(
    () => stories.filter((s) => s.isTrending).slice(0, 8),
    [stories]
  );

  const filtered = useMemo(() => {
    return stories.filter((s) => {
      if (legalOnly && !s.isLegal) return false;
      if (category !== "الكل" && s.category !== category) return false;
      return true;
    });
  }, [stories, legalOnly, category]);

  return (
    <div className="min-h-screen">
      {/* الترويسة */}
      <header className="bg-navy-950 text-white shadow-lg">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-gold-500 bg-navy-900 text-2xl"
              aria-hidden
            >
              ⚖️
            </span>
            <div>
              <h1 className="text-lg font-extrabold leading-snug sm:text-xl">
                مؤسسة عمرو منصور للمحاماة والاستشارات القانونية
              </h1>
              <p className="text-sm text-gold-400">مجمّع الأخبار القانونية المصرية والتريندات</p>
            </div>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <button
              onClick={() => setView("stream")}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
                view === "stream" ? "bg-gold-500 text-navy-950" : "bg-navy-800 text-white hover:bg-navy-700"
              }`}
            >
              📰 نشرة الأخبار
            </button>
            <button
              onClick={() => setView("drafts")}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
                view === "drafts" ? "bg-gold-500 text-navy-950" : "bg-navy-800 text-white hover:bg-navy-700"
              }`}
            >
              ✍️ المسودات ({drafts.length})
            </button>
            {gateEnabled && (
              <button
                onClick={logout}
                className="rounded-lg bg-navy-800 px-3 py-2 text-sm text-navy-100 transition hover:bg-navy-700"
              >
                خروج
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {!aiEnabled && (
          <div className="mb-4 rounded-xl border border-gold-500 bg-gold-100 px-4 py-3 text-sm font-semibold text-navy-900">
            تنبيه: مفتاح ANTHROPIC_API_KEY غير مُعدّ على الخادم — التقييم القانوني يعمل الآن
            بالكلمات المفتاحية، وأزرار توليد البوستات والسكربتات ستعرض رسالة خطأ واضحة حتى إضافة
            المفتاح.
          </div>
        )}

        {view === "stream" && (
          <>
            {/* شريط التحديث */}
            <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow">
              <button
                onClick={doRefresh}
                disabled={refreshing}
                className="rounded-lg bg-navy-900 px-5 py-2.5 font-bold text-white transition hover:bg-navy-800 disabled:opacity-50"
              >
                {refreshing ? "جارٍ التحديث…" : "🔄 تحديث الآن"}
              </button>
              <p className="text-sm text-slate-600">
                آخر تحديث: <span className="font-bold text-navy-900">{formatTime(lastRefreshAt)}</span>
                {" · "}إجمالي الأخبار المخزّنة: {stories.length}
              </p>
              {refreshNote && <p className="w-full text-sm text-navy-800">{refreshNote}</p>}
            </div>

            {/* التريندات */}
            {trending.length > 0 && (
              <section className="mb-6 rounded-2xl border-2 border-gold-500 bg-gradient-to-l from-gold-100 to-white p-4 shadow">
                <h2 className="mb-3 text-lg font-extrabold text-navy-950">🔥 التريندات</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {trending.map((s) => (
                    <StoryCard
                      key={s.id}
                      story={s}
                      compact
                      generatingId={generatingId}
                      onGenerate={generate}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* الفلاتر */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {CATEGORY_CHIPS.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
                    category === c
                      ? "bg-navy-900 text-white"
                      : "bg-white text-navy-900 shadow hover:bg-navy-50"
                  }`}
                >
                  {c}
                </button>
              ))}
              <button
                onClick={() => setLegalOnly((v) => !v)}
                className={`me-auto rounded-full px-4 py-1.5 text-sm font-bold transition ${
                  legalOnly ? "bg-gold-500 text-navy-950" : "bg-white text-navy-900 shadow hover:bg-navy-50"
                }`}
                aria-pressed={legalOnly}
              >
                ⚖️ قانوني {legalOnly ? "✓" : ""}
              </button>
            </div>

            {/* قائمة الأخبار */}
            {filtered.length === 0 ? (
              <div className="rounded-2xl bg-white p-10 text-center text-slate-500 shadow">
                {stories.length === 0
                  ? "لا توجد أخبار بعد — اضغط «تحديث الآن» لجلب أحدث الأخبار."
                  : "لا توجد أخبار مطابقة للفلاتر الحالية."}
              </div>
            ) : (
              <div className="grid gap-4">
                {filtered.map((s) => (
                  <StoryCard key={s.id} story={s} generatingId={generatingId} onGenerate={generate} />
                ))}
              </div>
            )}
          </>
        )}

        {view === "drafts" && (
          <DraftsView drafts={drafts} onPatch={patchDraft} onDelete={removeDraft} onCopy={copyText} />
        )}
      </main>

      <footer className="pb-8 text-center text-xs text-slate-500">
        كل المسودات للمراجعة فقط — لا يُنشر أي محتوى تلقائياً.
      </footer>

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-xl bg-navy-950 px-5 py-3 text-center text-sm font-bold text-white shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}

function StoryCard({
  story,
  generatingId,
  onGenerate,
  compact = false,
}: {
  story: Story;
  generatingId: string | null;
  onGenerate: (story: Story, type: "post" | "script") => void;
  compact?: boolean;
}) {
  const postKey = `${story.id}-post`;
  const scriptKey = `${story.id}-script`;
  return (
    <article className="rounded-2xl bg-white p-4 shadow transition hover:shadow-md">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-navy-100 px-2.5 py-1 font-bold text-navy-900">
          {story.category}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 font-bold text-white ${scoreColor(story.legalScore)}`}
          title="درجة الأهمية القانونية"
        >
          ⚖️ {story.legalScore}
        </span>
        {story.isTrending && (
          <span className="rounded-full bg-red-100 px-2.5 py-1 font-bold text-red-700">🔥 رائج</span>
        )}
        <a
          href={story.link}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-navy-700 underline decoration-gold-500 decoration-2 underline-offset-2 hover:text-navy-900"
        >
          {story.sourceName}
        </a>
        <span className="text-slate-400">{formatTime(story.publishedAt || story.fetchedAt)}</span>
      </div>
      <h3 className="mb-1 text-base font-extrabold leading-relaxed text-navy-950">{story.title}</h3>
      {!compact && story.description && (
        <p className="mb-2 text-sm leading-relaxed text-slate-600">{story.description}</p>
      )}
      {story.legalAngle && (
        <p className="mb-3 rounded-lg bg-navy-50 px-3 py-2 text-sm leading-relaxed text-navy-900">
          <span className="font-bold text-gold-500">الزاوية القانونية: </span>
          {story.legalAngle}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onGenerate(story, "post")}
          disabled={generatingId !== null}
          className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-navy-800 disabled:opacity-50"
        >
          {generatingId === postKey ? "جارٍ التوليد…" : "📣 بوست فيسبوك"}
        </button>
        <button
          onClick={() => onGenerate(story, "script")}
          disabled={generatingId !== null}
          className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-bold text-navy-950 transition hover:bg-gold-400 disabled:opacity-50"
        >
          {generatingId === scriptKey ? "جارٍ التوليد…" : "🎬 سكربت فيديو"}
        </button>
      </div>
    </article>
  );
}

function DraftsView({
  drafts,
  onPatch,
  onDelete,
  onCopy,
}: {
  drafts: Draft[];
  onPatch: (id: number, patch: { text?: string; status?: "draft" | "used" }) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onCopy: (text: string) => Promise<void>;
}) {
  if (drafts.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-10 text-center text-slate-500 shadow">
        لا توجد مسودات بعد — ولّد بوستاً أو سكربتاً من أي خبر في نشرة الأخبار وسيظهر هنا.
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      <p className="text-sm font-semibold text-slate-600">عدد المسودات: {drafts.length}</p>
      {drafts.map((d) => (
        <DraftCard key={d.id} draft={d} onPatch={onPatch} onDelete={onDelete} onCopy={onCopy} />
      ))}
    </div>
  );
}

function DraftCard({
  draft,
  onPatch,
  onDelete,
  onCopy,
}: {
  draft: Draft;
  onPatch: (id: number, patch: { text?: string; status?: "draft" | "used" }) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onCopy: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState(draft.text);
  const [saving, setSaving] = useState(false);
  const dirty = text !== draft.text;

  useEffect(() => {
    setText(draft.text);
  }, [draft.text]);

  async function save() {
    setSaving(true);
    await onPatch(draft.id, { text });
    setSaving(false);
  }

  return (
    <article
      className={`rounded-2xl bg-white p-4 shadow ${draft.status === "used" ? "opacity-75" : ""}`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`rounded-full px-2.5 py-1 font-bold ${
            draft.type === "post" ? "bg-navy-100 text-navy-900" : "bg-gold-100 text-navy-900"
          }`}
        >
          {draft.type === "post" ? "📣 بوست فيسبوك" : "🎬 سكربت فيديو"}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 font-bold ${
            draft.status === "used" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
          }`}
        >
          {draft.status === "used" ? "✓ مستخدم" : "مسودة"}
        </span>
        <span className="text-slate-400">{formatTime(draft.createdAt)}</span>
      </div>
      {draft.storyTitle && (
        <p className="mb-2 text-sm font-bold text-navy-900">عن: {draft.storyTitle}</p>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.min(14, Math.max(5, text.split("\n").length + 1))}
        className="mb-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-relaxed focus:border-gold-500 focus:outline-none"
      />
      <div className="flex flex-wrap gap-2">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-navy-800 disabled:opacity-40"
        >
          {saving ? "جارٍ الحفظ…" : "💾 حفظ التعديل"}
        </button>
        <button
          onClick={() => onCopy(text)}
          className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-navy-900 shadow transition hover:bg-navy-50"
        >
          📋 نسخ
        </button>
        <button
          onClick={() => onPatch(draft.id, { status: draft.status === "used" ? "draft" : "used" })}
          className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-bold text-navy-950 transition hover:bg-gold-400"
        >
          {draft.status === "used" ? "↩ إعادة لمسودة" : "✓ تعليم كمستخدم"}
        </button>
        <button
          onClick={() => onDelete(draft.id)}
          className="rounded-lg bg-red-50 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-100"
        >
          🗑 حذف
        </button>
      </div>
    </article>
  );
}
