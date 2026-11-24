// تقييم الأهمية القانونية للأخبار.
// المسار الأساسي: Claude (نداء واحد مجمّع لكل دفعة تحديث).
// المسار الاحتياطي عند غياب المفتاح أو فشل النداء: تقييم بالكلمات المفتاحية.
import { CATEGORIES, type Story, type ScoreUpdate } from "./db";
import { callClaude, extractJson, hasApiKey, scoringModel } from "./claude";
import { matchesTrend, normalizeText } from "./feeds";

const LEGAL_KEYWORDS: Array<{ word: string; weight: number }> = [
  { word: "محكمة", weight: 18 },
  { word: "النقض", weight: 18 },
  { word: "نيابة", weight: 16 },
  { word: "قضية", weight: 14 },
  { word: "حكم", weight: 14 },
  { word: "قانون", weight: 14 },
  { word: "تشريع", weight: 14 },
  { word: "جريمة", weight: 12 },
  { word: "متهم", weight: 12 },
  { word: "عقوبة", weight: 12 },
  { word: "دعوى", weight: 12 },
  { word: "استئناف", weight: 12 },
  { word: "جنح", weight: 12 },
  { word: "جنايات", weight: 12 },
  { word: "تعويض", weight: 12 },
  { word: "قاضي", weight: 12 },
  { word: "محام", weight: 10 },
  { word: "سجن", weight: 10 },
  { word: "حبس", weight: 10 },
  { word: "غرامة", weight: 10 },
  { word: "تحقيق", weight: 10 },
  { word: "النيابة العامة", weight: 16 },
  { word: "مجلس النواب", weight: 10 },
  { word: "قرار وزاري", weight: 8 },
  { word: "الجريدة الرسمية", weight: 12 },
  { word: "دستور", weight: 10 },
  { word: "طلاق", weight: 8 },
  { word: "ميراث", weight: 8 },
  { word: "عقد", weight: 6 },
  { word: "ضرائب", weight: 6 },
  { word: "جمارك", weight: 6 },
  { word: "شركة", weight: 3 },
  { word: "اعتقال", weight: 8 },
  { word: "إخلاء سبيل", weight: 10 },
  { word: "حجز", weight: 6 },
  { word: "تنفيذ", weight: 4 },
  // كلمات إنجليزية — لأن خلاصة Egypt Independent بالإنجليزية
  { word: "court", weight: 16 },
  { word: "verdict", weight: 16 },
  { word: "trial", weight: 14 },
  { word: "judge", weight: 12 },
  { word: "lawsuit", weight: 14 },
  { word: "prosecution", weight: 14 },
  { word: "defendant", weight: 12 },
  { word: "constitution", weight: 12 },
  { word: "parliament", weight: 8 },
  { word: "law", weight: 8 },
  { word: "crime", weight: 10 },
  { word: "sentenced", weight: 14 },
  { word: "appeal", weight: 10 },
  { word: "legal", weight: 8 },
];

function guessCategory(text: string, isLegal: boolean): string {
  if (/حكم|أيدت|براءة|إدانة|النقض|الاستئناف|جنح|جنايات/.test(text)) return "حكم محكمة";
  if (/قانون جديد|مشروع قانون|تعديل قانون|تشريع جديد|أصدر.*قانون|قانون.*جديد/.test(text))
    return "قانون جديد";
  if (/قرار|وزارة|محافظ|هيئة|رئيس الوزراء|رئيس الجمهورية/.test(text) && isLegal) return "قرار رسمي";
  if (isLegal) return "قضية رأي عام";
  return "تريند";
}

/** تقييم احتياطي بالكلمات المفتاحية — لا يحتاج أي مفتاح API. */
export function keywordScore(story: Story, trendsQueries: string[]): ScoreUpdate {
  const text = normalizeText(`${story.title} ${story.description}`);
  let score = 0;
  for (const { word, weight } of LEGAL_KEYWORDS) {
    if (text.includes(normalizeText(word))) score += weight;
  }
  score = Math.min(100, score);
  const isLegal = score >= 25;
  const category = guessCategory(`${story.title} ${story.description}`, isLegal);
  return {
    id: story.id,
    legalScore: score,
    category,
    isLegal,
    legalAngle: "",
    isTrending: matchesTrend(story.title, trendsQueries),
  };
}

const SCORING_SYSTEM = `أنت محرّر قانوني يقيّم أخباراً مصرية لمكتب محاماة. مهمتك: تقييم الأهمية القانونية لكل خبر اعتماداً فقط على عنوانه ووصفه كما هما معطيان لك.
قواعد صارمة:
- لا تخترع قوانين أو أرقام مواد أو أحكاماً أو وقائع غير موجودة في العنوان والوصف.
- legal_score من 0 إلى 100: مدى صلة الخبر بالقانون والقضاء والقضايا والتشريعات.
- category واحدة فقط من: "قضية رأي عام"، "حكم محكمة"، "قانون جديد"، "قرار رسمي"، "تريند". الأخبار العامة غير القانونية فئتها "تريند".
- is_legal: true فقط إذا كان للخبر صلة قانونية حقيقية.
- legal_angle: جملة عربية واحدة تشرح لماذا يهم الخبر قانونياً، أو سلسلة فارغة "" إذا لم توجد زاوية قانونية.
- is_trending: true إذا بدا الخبر موضوعاً متداولاً/رائجاً بقوة من صياغته وطبيعته.
أعد النتيجة بصيغة JSON فقط: مصفوفة من الكائنات بنفس ترتيب الأخبار وعددها، كل كائن فيه: i (رقم الخبر كما أعطي لك)، legal_score، category، is_legal، legal_angle، is_trending. بدون أي شرح خارج JSON.`;

interface ClaudeScoreItem {
  i?: number;
  legal_score?: number;
  category?: string;
  is_legal?: boolean;
  legal_angle?: string;
  is_trending?: boolean;
}

/** تقييم Claude المجمّع: نداء API واحد لكل الدفعة. يرمي عند الفشل ليتولى الاحتياطي الأمر. */
export async function claudeScoreBatch(
  stories: Story[],
  trendsQueries: string[]
): Promise<ScoreUpdate[]> {
  const list = stories
    .map(
      (s, idx) =>
        `${idx}. العنوان: ${s.title}\n   الوصف: ${s.description.slice(0, 400) || "(لا يوجد وصف)"}\n   المصدر: ${s.sourceName}`
    )
    .join("\n");
  const trendsNote =
    trendsQueries.length > 0
      ? `\n\nعبارات رائجة حالياً على Google Trends مصر (للمساعدة في تحديد is_trending عند المطابقة): ${trendsQueries.join("، ")}`
      : "";
  const raw = await callClaude({
    model: scoringModel(),
    system: SCORING_SYSTEM,
    user: `قيّم الأخبار التالية (${stories.length} خبراً):\n\n${list}${trendsNote}`,
    maxTokens: 8192,
  });
  const parsed = extractJson<ClaudeScoreItem[]>(raw);
  if (!parsed || !Array.isArray(parsed)) throw new Error("تعذّر فهم نتيجة التقييم من Claude.");

  const byIndex = new Map<number, ClaudeScoreItem>();
  for (const item of parsed) {
    if (typeof item.i === "number") byIndex.set(item.i, item);
  }
  return stories.map((story, idx) => {
    const item = byIndex.get(idx);
    if (!item) return keywordScore(story, trendsQueries);
    const category = CATEGORIES.includes(item.category as (typeof CATEGORIES)[number])
      ? (item.category as string)
      : guessCategory(`${story.title} ${story.description}`, !!item.is_legal);
    return {
      id: story.id,
      legalScore:
        typeof item.legal_score === "number" ? item.legal_score : keywordScore(story, trendsQueries).legalScore,
      category,
      isLegal: !!item.is_legal,
      legalAngle: typeof item.legal_angle === "string" ? item.legal_angle.trim() : "",
      isTrending: !!item.is_trending || matchesTrend(story.title, trendsQueries),
    };
  });
}

/**
 * يقيّم دفعة أخبار: Claude إن وُجد المفتاح، وإلا الكلمات المفتاحية.
 * يعيد طريقة التقييم المستخدمة فعلياً.
 */
export async function scoreBatch(
  stories: Story[],
  trendsQueries: string[]
): Promise<{ updates: ScoreUpdate[]; method: "claude" | "keywords" }> {
  if (stories.length === 0) return { updates: [], method: "keywords" };
  if (hasApiKey()) {
    try {
      const updates = await claudeScoreBatch(stories, trendsQueries);
      return { updates, method: "claude" };
    } catch (e) {
      console.error("فشل تقييم Claude، التحويل إلى الكلمات المفتاحية:", e);
    }
  }
  return { updates: stories.map((s) => keywordScore(s, trendsQueries)), method: "keywords" };
}
