// عميل Anthropic Claude عبر fetch مباشر — بدون أي SDK خارجي.
// المفتاح يُقرأ من متغير البيئة ANTHROPIC_API_KEY فقط، ولا يُخزَّن في أي مكان آخر.

export function hasApiKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

export const MISSING_KEY_ERROR =
  "مفتاح ANTHROPIC_API_KEY غير مُعدّ على الخادم. أضف المفتاح في متغيرات البيئة (ANTHROPIC_API_KEY) ثم أعد المحاولة — التوليد بالذكاء الاصطناعي غير متاح بدونه.";

export function scoringModel(): string {
  return process.env.SCORING_MODEL?.trim() || "claude-haiku-4-5-20251001";
}

export function generationModel(): string {
  return process.env.GENERATION_MODEL?.trim() || "claude-sonnet-4-5-20250929";
}

interface ClaudeResponse {
  content?: Array<{ type: string; text?: string }>;
  error?: { message?: string };
}

/**
 * يستدعي Claude Messages API ويعيد النص الناتج.
 * يرمي خطأً واضحاً عند غياب المفتاح أو فشل الطلب.
 */
export async function callClaude(opts: {
  model: string;
  system?: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error(MISSING_KEY_ERROR);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 4096,
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: "user", content: opts.user }],
    }),
  });

  const data = (await res.json().catch(() => ({}))) as ClaudeResponse;
  if (!res.ok) {
    throw new Error(
      `فشل طلب Claude API (${res.status}): ${data.error?.message || "خطأ غير معروف"}`
    );
  }
  const text = (data.content || [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n")
    .trim();
  if (!text) throw new Error("لم يُرجع Claude أي نص.");
  return text;
}

/** يستخرج أول كائن/مصفوفة JSON من نص قد يحيط به شرح أو أسوار كود. */
export function extractJson<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start < 0) return null;
  const open = candidate[start];
  const close = open === "[" ? "]" : "}";
  const end = candidate.lastIndexOf(close);
  if (end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
